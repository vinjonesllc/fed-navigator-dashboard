// Auto-detect which Zoom CSV export a file is, by sniffing its header row.
// Client-safe (no server imports) so the upload form can classify on selection
// and give immediate feedback. The three exports have completely disjoint
// headers, so a token match on the first line is reliable.

export type CsvKind = "attendees" | "qa" | "chat";

// Distinctive header tokens for each export (lowercased). A file is classified
// by the first kind whose tokens appear in its header line. `chat` and `qa` are
// checked before `attendees` because their headers are the most specific.
const SIGNATURES: { kind: CsvKind; tokens: string[] }[] = [
  // Chat export: "Is a reply", "Chat message", "Send time", "Total reactions"
  { kind: "chat", tokens: ["chat message"] },
  // Q&A export: "Question", "Name (sender)", "Submission date", "Answer date"
  { kind: "qa", tokens: ["name (sender)", "email (sender)", "submission date"] },
  // Attendee export: "First name", "Participation", "Engagement score", ...
  { kind: "attendees", tokens: ["participation", "engagement score", "sessions attended"] },
];

/** Read just the header line (handles \r\n / \n, strips a leading BOM). */
export function firstLine(text: string): string {
  const end = text.search(/\r?\n/);
  const line = end === -1 ? text : text.slice(0, end);
  return line.replace(/^﻿/, "");
}

/**
 * Classify a CSV by its header row. Returns the detected kind, or `null` if the
 * header doesn't match any known Zoom export.
 */
export function classifyCsv(text: string): CsvKind | null {
  const header = firstLine(text).toLowerCase();
  if (!header.trim()) return null;
  for (const { kind, tokens } of SIGNATURES) {
    if (tokens.some((t) => header.includes(t))) return kind;
  }
  return null;
}

export const CSV_KIND_LABEL: Record<CsvKind, string> = {
  attendees: "Attendees",
  qa: "Q&A",
  chat: "Chat transcript",
};
