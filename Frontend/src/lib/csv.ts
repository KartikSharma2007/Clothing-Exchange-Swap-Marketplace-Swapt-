import { getAccessToken, API_URL } from "@/lib/api";

/** Escape a value into a CSV cell. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV text with a BOM for Excel. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

/** Trigger a browser download for a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a CSV from the live backend (bypasses the JSON-only `api()` helper).
 * Falls back to the provided client-built CSV when the API is not configured.
 */
export async function downloadApiCsv(path: string, filename: string, fallback: () => string): Promise<void> {
  if (!API_URL) {
    downloadCsv(filename, fallback());
    return;
  }
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    credentials: "include",
  });
  if (!res.ok) {
    downloadCsv(filename, fallback());
    return;
  }
  downloadCsv(filename, await res.text());
}