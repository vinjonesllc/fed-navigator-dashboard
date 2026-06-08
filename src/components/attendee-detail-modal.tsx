"use client";

import { useEffect, useState } from "react";
import type { Attendee, WorkshopChat, WorkshopQA } from "@/lib/supabase/types";
import { engagementIndex } from "@/lib/workshop-stats";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const fullName = (a: Attendee) => `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();

const normEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const normName = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Match a transcript row (chat / Q&A) to a person by email, then by name.
function rowMatches(
  rowEmail: string | null,
  rowName: string | null,
  email: string | null,
  name: string | null,
): boolean {
  const e = normEmail(email);
  const re = normEmail(rowEmail);
  if (e && re && e === re) return true;
  const n = normName(name);
  const rn = normName(rowName);
  return !!n && !!rn && n === rn;
}

export type PersonRef = { name: string | null; email: string | null };

type AttendeeEvalResult = {
  configured: boolean;
  found: boolean;
  fields?: { label: string; value: string }[];
};

function StatChip({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-line-1 bg-bg-2 px-3 py-2">
      <span aria-hidden className="text-[15px]">{icon}</span>
      <span className="font-display text-[18px] font-semibold leading-none tabular-nums text-ink-1">
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</span>
    </div>
  );
}

/**
 * Per-person detail modal. Opened from the attendees table, the Q&A list, and
 * the intent panels. `attendee` is the matched live-attendee row when the person
 * is in the attendee list (drives time/engagement); otherwise we fall back to
 * the `person` ref (name/email) and still show their chats, questions & eval.
 * Mounted fresh per person (keyed by the caller), so initial state is "loading".
 */
export function AttendeeDetailModal({
  person,
  attendee,
  workshopId,
  scheduledMinutes,
  chats,
  qa,
  hasChatTranscript,
  onClose,
}: {
  person: PersonRef;
  attendee: Attendee | null;
  workshopId: string;
  scheduledMinutes: number | null;
  chats: WorkshopChat[];
  qa: WorkshopQA[];
  hasChatTranscript: boolean;
  onClose: () => void;
}) {
  const email = attendee?.email ?? person.email;
  const name = attendee ? fullName(attendee) : person.name;

  const [evalState, setEvalState] = useState<
    { status: "loading" } | { status: "done"; data: AttendeeEvalResult } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ workshopId });
    if (email) params.set("email", email);
    if (name) params.set("name", name);
    fetch(`/api/evals/attendee?${params.toString()}`)
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) setEvalState({ status: "error", message: body?.error ?? "Failed to load" });
        else setEvalState({ status: "done", data: body as AttendeeEvalResult });
      })
      .catch((e) => {
        if (!cancelled) setEvalState({ status: "error", message: e?.message ?? "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId, email, name]);

  const myChats = chats.filter((c) => rowMatches(c.sender_email, c.sender_name, email, name));
  const myQuestions = qa.filter(
    (q) => !q.dismissed && rowMatches(q.sender_email, q.sender_name, email, name),
  );
  const score = attendee ? engagementIndex(attendee, scheduledMinutes) : null;
  const agencyLabel = attendee?.agency ?? attendee?.email_domain ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name || "Attendee"}</DialogTitle>
          <DialogDescription className="font-mono text-[12px]">
            {email ?? "—"}
            {agencyLabel ? ` · ${agencyLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Stat chips */}
        <div className="flex flex-wrap gap-2">
          {attendee ? (
            <StatChip
              icon="⏱"
              value={`${attendee.total_time_minutes ?? 0}${scheduledMinutes ? `/${scheduledMinutes}` : ""}`}
              label="min"
            />
          ) : (
            <StatChip icon="⏱" value="—" label="not a live attendee" />
          )}
          <StatChip icon="💬" value={myChats.length} label={myChats.length === 1 ? "chat" : "chats"} />
          <StatChip
            icon="❓"
            value={myQuestions.length}
            label={myQuestions.length === 1 ? "question" : "questions"}
          />
          {score !== null && <StatChip icon="📊" value={`${score.toFixed(1)}/10`} label="engagement" />}
        </div>

        {/* Chat messages */}
        <section className="space-y-2">
          <h4 className="font-display text-[13px] font-semibold text-ink-1">
            Chat messages ({myChats.length})
          </h4>
          {!hasChatTranscript ? (
            <p className="text-[12.5px] text-ink-3">No chat transcript was uploaded for this workshop.</p>
          ) : myChats.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No chat messages from this person.</p>
          ) : (
            <ul className="space-y-1.5">
              {myChats.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[8px] border border-line-2 bg-bg-2 px-3 py-2 text-[12.5px] text-ink-2"
                >
                  {c.message}
                  {c.is_reply && <span className="ml-2 text-[10.5px] text-ink-4">(reply)</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Questions */}
        <section className="space-y-2">
          <h4 className="font-display text-[13px] font-semibold text-ink-1">
            Questions asked ({myQuestions.length})
          </h4>
          {myQuestions.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No questions from this person.</p>
          ) : (
            <ul className="space-y-1.5">
              {myQuestions.map((q) => (
                <li
                  key={q.id}
                  className="rounded-[8px] border border-line-2 bg-bg-2 px-3 py-2 text-[12.5px] text-ink-2"
                >
                  {q.question}
                  {q.answer && (
                    <p className="mt-1 border-t border-line-2 pt-1 text-[11.5px] text-ink-3">
                      <span className="text-ink-4">Answer:</span> {q.answer}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Evaluation */}
        <section className="space-y-2">
          <h4 className="font-display text-[13px] font-semibold text-ink-1">Evaluation</h4>
          {evalState.status === "loading" && (
            <p className="text-[12.5px] text-ink-3">Looking up evaluation…</p>
          )}
          {evalState.status === "error" && (
            <p className="text-[12.5px] text-ink-3">Couldn&apos;t load evaluation: {evalState.message}</p>
          )}
          {evalState.status === "done" &&
            (!evalState.data.configured ? (
              <p className="text-[12.5px] text-ink-3">No evaluations sheet configured for this client.</p>
            ) : !evalState.data.found || !evalState.data.fields?.length ? (
              <p className="text-[12.5px] text-ink-3">
                No evaluation found for this person (matched by email, then name).
              </p>
            ) : (
              <dl className="divide-y divide-line-2 rounded-[8px] border border-line-2">
                {evalState.data.fields.map((f) => (
                  <div key={f.label} className="grid grid-cols-[40%_60%] gap-2 px-3 py-1.5 text-[12.5px]">
                    <dt className="text-ink-4">{f.label}</dt>
                    <dd className="text-ink-2">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
