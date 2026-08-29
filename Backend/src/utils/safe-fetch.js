import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF-safe remote image fetching.
 *
 * The server must never fetch arbitrary URLs on a user's say-so: a hostile URL
 * could otherwise be pointed at `http://169.254.169.254/`, `http://localhost:…`
 * or any internal host. Every hop (including redirects) is validated before the
 * bytes are read — only public http(s) endpoints on standard ports are allowed.
 */

const MAX_HOPS = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 15_000;

/** True when an IP literal is in a private / reserved / loopback range. */
export function isPrivateIp(ip) {
  if (net.isIP(ip) === 0) return true; // not a valid IP at all → treat as unsafe
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local (fe80::/10)
    if (lower.startsWith("ff")) return true; // multicast
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7)); // IPv4-mapped
    return false;
  }

  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // documentation
  if (a === 203 && b === 0 && c === 113) return true; // documentation
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/**
 * Validate a remote URL: scheme, port, and that every DNS result is a public
 * IP (not a literal or a resolver answer that points back inside the network).
 * Returns the parsed URL on success, throws on anything suspicious.
 */
async function assertPublicRemote(urlStr, hop) {
  if (hop > MAX_HOPS) throw new Error("Too many redirects");
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) image URLs are allowed");
  }
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new Error("Non-standard ports are not allowed");
  }

  const hostname = parsed.hostname;
  if (net.isIP(hostname) !== 0) {
    if (isPrivateIp(hostname)) throw new Error("Private network hosts are not allowed");
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve the image host");
  }
  if (!addresses.length) throw new Error("Could not resolve the image host");
  if (addresses.some((r) => isPrivateIp(r.address))) {
    throw new Error("Image host resolves to a private network");
  }
  return parsed;
}

/**
 * Fetch an image from a public URL, validating every redirect hop first.
 * Resolves with a Buffer (capped at MAX_BYTES); rejects with a plain message
 * suitable for surfacing to the user.
 */
export async function fetchPublicImage(urlStr) {
  let current = urlStr;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const parsed = await assertPublicRemote(current, hop);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(parsed.toString(), {
        redirect: "manual", // redirects are validated one hop at a time
        signal: controller.signal,
        headers: { "user-agent": "Swapt/1.0 (image importer)" },
      });
    } catch (err) {
      if (err?.name === "AbortError") throw new Error("Timed out fetching the image");
      throw new Error("Could not reach the image host");
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirected without a destination");
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);

    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw new Error("Image is too large");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("Image is too large");
    return { buffer: buf };
  }
  throw new Error("Too many redirects");
}
