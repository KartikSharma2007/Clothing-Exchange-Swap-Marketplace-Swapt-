/**
 * AI-assisted listing creation.
 *
 * Sends an uploaded clothing photo to a vision model and asks it to produce
 * listing fields (title, brand, category, color, condition, size) as strict
 * JSON. Supports OpenAI (GPT-4o) and Google Gemini — whichever key is present
 * in Backend/.env is used. Output is normalised against the app taxonomy so
 * it always validates when submitted.
 */
import { CATEGORIES, CONDITIONS, SIZES } from "../models/Listing.js";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

/** Read keys at call time (not module load) so they reflect the live process env. */
function openAIKey() {
  return process.env.OPENAI_API_KEY || "";
}
function geminiKey() {
  return process.env.GEMINI_API_KEY || "";
}

/** Which provider is configured, if any. */
export function aiConfigured() {
  if (openAIKey()) return "openai";
  if (geminiKey()) return "gemini";
  return null;
}

/** Treat the key as an opaque value. Google owns the format: legacy Standard
 *  keys start with "AIza", new Auth keys issued by AI Studio (June 2026+) start
 *  with "AQ.Ab". Never hard-code a prefix — let the API validate the key. */
function validGeminiKey(key) {
  return /^AIza[A-Za-z0-9_-]{35}$/.test(key) || /^AQ\.\w{20,}$/.test(key);
}

const PROMPT = `You are a fashion catalog assistant. Analyse the clothing in the photo and return STRICT JSON (no markdown, no prose) with exactly this shape:
{
  "title": string, /* short human catalog title, at most 10 words, e.g. "Beige cargo shorts" */
  "brand": string, /* brand if visible on a label or logo, otherwise "" */
  "color": string, /* dominant color(s), one or two words lowercase, e.g. "beige" */
  "category": string, /* one of: ${CATEGORIES.join(" | ")} */
  "condition": string, /* one of: ${CONDITIONS.join(" | ")} — estimate from how used the item looks */
  "size": string, /* the size tag if legible (XS, S, M, L, XL, XXL, XXXL), otherwise "" */
  "confidence": number /* 0 to 1, how sure you are about the whole suggestion */
}`;

/** Strip markdown fences and pull the first JSON object out of a response. */
function parseJson(text) {
  const cleaned = String(text || "").replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("The vision model didn't return valid JSON.");
  }
}

/** Fuzzy-match a free-text answer onto one of our enum values. */
function closest(needle, haystack) {
  if (!needle) return "";
  const n = String(needle).toLowerCase().trim();
  let best = "";
  let bestScore = 0;
  for (const candidate of haystack) {
    const c = String(candidate).toLowerCase();
    if (c === n) return candidate;
    let score = 0;
    if (c.includes(n) || n.includes(c)) score = 3;
    const firstWord = n.split(/\s+/)[0];
    if (firstWord && (c.includes(firstWord) || firstWord.includes(c))) score = Math.max(score, 2);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Coerce raw model output into the shape the sell form accepts. */
function normalize(raw) {
  const title = String(raw.title || "").trim().slice(0, 120);
  const brand = String(raw.brand || "").trim().slice(0, 60);
  const color = String(raw.color || "").trim().slice(0, 40);
  const confidence = Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.5;
  return {
    title,
    brand,
    color,
    category: closest(raw.category, CATEGORIES),
    condition: closest(raw.condition, CONDITIONS),
    size: closest(raw.size, SIZES),
    confidence,
    source: "ai",
  };
}

async function suggestOpenAI({ buffer, mimeType }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIKey()}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Suggest listing fields for this clothing photo." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` } },
          ],
        },
      ],
      max_tokens: 300,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`AI provider error (${res.status}): ${body.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error("AI provider returned an empty response.");
    err.status = 502;
    throw err;
  }
  return parseJson(content);
}

async function suggestGemini({ buffer, mimeType }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${PROMPT}\nSuggest listing fields for this clothing photo.` },
              { inline_data: { mime_type: mimeType, data: buffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`AI provider error (${res.status}): ${body.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) {
    const err = new Error("AI provider returned an empty response.");
    err.status = 502;
    throw err;
  }
  return parseJson(text);
}

/**
 * Suggest listing fields from a photo. Throws a 503 (with a friendly message)
 * when no AI provider is configured.
 */
export async function suggestListingFromImage({ buffer, mimeType }) {
  const provider = aiConfigured();
  if (!provider) {
    const err = new Error(
      "AI-assisted listing isn't configured. Add OPENAI_API_KEY or GEMINI_API_KEY to Backend/.env.",
    );
    err.status = 503;
    throw err;
  }
  if (provider === "gemini" && !validGeminiKey(geminiKey())) {
    const err = new Error(
      "GEMINI_API_KEY is set but it doesn't look like a Gemini API key. Valid Gemini keys start with \"AIza\" (legacy Standard key) or \"AQ.\" (new Auth key from Google AI Studio). Double-check the key in Backend/.env, then restart the server.",
    );
    err.status = 503;
    throw err;
  }
  const raw = provider === "openai" ? await suggestOpenAI({ buffer, mimeType }) : await suggestGemini({ buffer, mimeType });
  return normalize(raw);
}
