import Papa from "papaparse";

export type ParsedChat = {
  is_reply: boolean;
  message: string;
  sender_name: string | null;
  sender_email: string | null;
  sent_at: string | null;
  total_reactions: number;
  total_responses: number;
};

export type ParsedQA = {
  question: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_auth_status: string | null;
  submitted_at: string | null;
  answer: string | null;
  responder_name: string | null;
  responder_email: string | null;
  responded_at: string | null;
  dismissed: boolean;
};

function naToNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "N/A") return null;
  return s;
}

function parseInt0(v: unknown): number {
  const s = naToNull(v);
  if (s === null) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseTs(v: unknown): string | null {
  const s = naToNull(v);
  if (s === null) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const CHAT_EMPTY_SENTINELS = /^(no chats?|no messages?|n\/a)$/i;

export function parseChatCsv(csv: string): ParsedChat[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  return (result.data ?? [])
    .filter((r) => {
      const m = r["Chat message"]?.trim();
      if (!m) return false;
      if (CHAT_EMPTY_SENTINELS.test(m) && !r["Email"]?.trim()) return false;
      return true;
    })
    .map((r) => ({
      is_reply: /^yes$/i.test((r["Is a reply"] ?? r["Is a reply "] ?? "").trim()),
      message: r["Chat message"].trim(),
      sender_name: naToNull(r["Name"]),
      sender_email: naToNull(r["Email"]),
      sent_at: parseTs(r["Send time"]),
      total_reactions: parseInt0(r["Total reactions"]),
      total_responses: parseInt0(r["Total responses"]),
    }));
}

// Zoom emits a single sentinel row like "No responses" or "No Q&A" when nothing
// was submitted during the session. Skip those so the workshop shows the proper
// empty state instead of one fake question.
const QA_EMPTY_SENTINELS = /^(no responses?|no q\s*&?\s*a|no questions?|n\/a)$/i;

export function parseQACsv(csv: string): ParsedQA[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });

  return (result.data ?? [])
    .filter((r) => {
      const q = r["Question"]?.trim();
      if (!q) return false;
      if (QA_EMPTY_SENTINELS.test(q) && !r["Email (sender)"]?.trim()) return false;
      return true;
    })
    .map((r) => {
      const raw = r["Question"].trim();
      const dismissed = /^\(DISMISSED\)/i.test(raw);
      const cleaned = raw.replace(/^\(DISMISSED\)\s*/i, "");
      return {
        question: cleaned,
        sender_name: naToNull(r["Name (sender)"]),
        sender_email: naToNull(r["Email (sender)"]),
        sender_auth_status: naToNull(r["Authentication status"]),
        submitted_at: parseTs(r["Submission date"]),
        answer: naToNull(r["Answer"]),
        responder_name: naToNull(r["Name (responder)"]),
        responder_email: naToNull(r["Email (responder)"]),
        responded_at: parseTs(r["Answer date"]),
        dismissed,
      };
    });
}
