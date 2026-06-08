"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
import type { Attendee, WorkshopChat, WorkshopQA } from "@/lib/supabase/types";
import { engagementIndex } from "@/lib/workshop-stats";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SortKey = "name" | "agency" | "time" | "engagement";
type SortDir = "asc" | "desc";

const NAME_OF = (a: Attendee) =>
  `${a.last_name ?? ""} ${a.first_name ?? ""}`.trim().toLowerCase();

const fullName = (a: Attendee) =>
  `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();

const normEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const normName = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Match a transcript row (chat / Q&A) to an attendee by email, then by name.
function rowMatchesAttendee(
  rowEmail: string | null,
  rowName: string | null,
  a: Attendee,
): boolean {
  const ae = normEmail(a.email);
  const re = normEmail(rowEmail);
  if (ae && re && ae === re) return true;
  const an = normName(fullName(a));
  const rn = normName(rowName);
  return !!an && !!rn && an === rn;
}

type AttendeeEvalResult = {
  configured: boolean;
  found: boolean;
  fields?: { label: string; value: string }[];
};

const FED_TLDS = [".gov", ".mil", ".fed.us"];
const isGovDomain = (a: Attendee) =>
  !!a.email_domain && FED_TLDS.some((t) => a.email_domain!.endsWith(t));

const initials = (a: Attendee) =>
  [a.first_name?.[0], a.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
  (a.email?.[0] ?? "?").toUpperCase();

// Stable color per attendee from email hash
const ACCENTS = [
  "oklch(0.55 0.18 142)",
  "oklch(0.45 0.10 220)",
  "oklch(0.55 0.16 60)",
  "oklch(0.50 0.15 320)",
  "oklch(0.55 0.18 22)",
  "oklch(0.50 0.12 180)",
  "oklch(0.50 0.14 280)",
  "oklch(0.55 0.17 110)",
  "oklch(0.55 0.16 40)",
  "oklch(0.45 0.13 240)",
  "oklch(0.55 0.13 160)",
  "oklch(0.50 0.15 300)",
];
const avatarColor = (a: Attendee) => {
  const key = a.email ?? a.id;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
};

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  hint,
  tooltip,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  hint?: string;
  tooltip?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`border-b border-line-1 bg-bg-2 px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-ink-1" : ""} hover:text-ink-1`}
      >
        <span>
          {label}
          {hint && (
            <span className="ml-1 normal-case text-ink-4">{hint}</span>
          )}
        </span>
        {tooltip && (
          <span title={tooltip} className="cursor-help text-ink-4">
            <Info className="h-3 w-3" />
          </span>
        )}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

const ENGAGEMENT_TOOLTIP =
  "Workshop Engagement Index (0–10): (time in session ÷ scheduled) × 7, +1.5 if chats > 5, +1.5 if questions > 3.";

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

function AttendeeDetailModal({
  attendee,
  workshopId,
  scheduledMinutes,
  chats,
  qa,
  hasChatTranscript,
  onClose,
}: {
  attendee: Attendee;
  workshopId: string;
  scheduledMinutes: number | null;
  chats: WorkshopChat[];
  qa: WorkshopQA[];
  hasChatTranscript: boolean;
  onClose: () => void;
}) {
  // This component is mounted fresh per attendee (keyed by id), so the initial
  // state is "loading" and the effect only sets state in its async callbacks.
  const [evalState, setEvalState] = useState<
    { status: "loading" } | { status: "done"; data: AttendeeEvalResult } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ workshopId });
    if (attendee.email) params.set("email", attendee.email);
    const name = fullName(attendee);
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
  }, [attendee, workshopId]);

  const myChats = chats.filter((c) => rowMatchesAttendee(c.sender_email, c.sender_name, attendee));
  const myQuestions = qa.filter(
    (q) => !q.dismissed && rowMatchesAttendee(q.sender_email, q.sender_name, attendee),
  );
  const score = engagementIndex(attendee, scheduledMinutes);
  const agencyLabel = attendee.agency ?? attendee.email_domain ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fullName(attendee) || "Attendee"}</DialogTitle>
          <DialogDescription className="font-mono text-[12px]">
            {attendee.email ?? "—"}
            {agencyLabel ? ` · ${agencyLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Stat chips */}
        <div className="flex flex-wrap gap-2">
          <StatChip
            icon="⏱"
            value={`${attendee.total_time_minutes ?? 0}${scheduledMinutes ? `/${scheduledMinutes}` : ""}`}
            label="min"
          />
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
            <p className="text-[12.5px] text-ink-3">This attendee didn&apos;t send any chat messages.</p>
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
            <p className="text-[12.5px] text-ink-3">This attendee didn&apos;t ask any questions.</p>
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
                No evaluation found for this attendee (matched by email, then name).
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

export function AttendeesTable({
  attendees,
  scheduledMinutes,
  workshopId,
  chats,
  qa,
}: {
  attendees: Attendee[];
  scheduledMinutes: number | null;
  workshopId: string;
  chats: WorkshopChat[];
  qa: WorkshopQA[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => attendees.find((a) => a.id === selectedId) ?? null,
    [attendees, selectedId],
  );
  const hasChatTranscript = chats.length > 0;
  const [key, setKey] = useState<SortKey>("engagement");
  const [dir, setDir] = useState<SortDir>("desc");

  const enriched = useMemo(
    () =>
      attendees.map((a) => ({
        a,
        score: engagementIndex(a, scheduledMinutes) ?? -1,
        gov: isGovDomain(a),
      })),
    [attendees, scheduledMinutes],
  );

  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((x, y) => {
      let cmp = 0;
      switch (key) {
        case "name":
          cmp = NAME_OF(x.a).localeCompare(NAME_OF(y.a));
          break;
        case "agency":
          cmp = (x.a.agency ?? x.a.email_domain ?? "").localeCompare(
            y.a.agency ?? y.a.email_domain ?? "",
          );
          break;
        case "time":
          cmp = (x.a.total_time_minutes ?? 0) - (y.a.total_time_minutes ?? 0);
          break;
        case "engagement":
          cmp = x.score - y.score;
          break;
      }
      return cmp * (dir === "asc" ? 1 : -1);
    });
    return arr;
  }, [enriched, key, dir]);

  function toggle(next: SortKey) {
    if (next === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setKey(next);
      setDir(next === "name" || next === "agency" ? "asc" : "desc");
    }
  }

  const shown = sorted.slice(0, 200);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <SortHeader
              label="Name"
              active={key === "name"}
              dir={dir}
              onClick={() => toggle("name")}
            />
            <SortHeader
              label="Agency"
              active={key === "agency"}
              dir={dir}
              onClick={() => toggle("agency")}
            />
            <SortHeader
              label="Time"
              hint="(min)"
              active={key === "time"}
              dir={dir}
              onClick={() => toggle("time")}
              align="right"
            />
            <SortHeader
              label="Engagement"
              hint="(0–10)"
              tooltip={ENGAGEMENT_TOOLTIP}
              active={key === "engagement"}
              dir={dir}
              onClick={() => toggle("engagement")}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={4} className="border-b border-line-2 px-4 py-6 text-center text-ink-3">
                No live attendees yet.
              </td>
            </tr>
          )}
          {shown.map(({ a, score, gov }) => {
            const agencyLabel = a.agency ?? a.email_domain ?? "—";
            return (
              <tr
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className="cursor-pointer hover:bg-bg-2"
                title="Click for this attendee's chats, questions, time & evaluation"
              >
                <td className="border-b border-line-2 px-4 py-3 align-middle">
                  <span
                    className="mr-3 inline-grid h-[30px] w-[30px] place-items-center rounded-full align-middle font-display text-[11px] font-semibold text-white"
                    style={{ background: avatarColor(a) }}
                  >
                    {initials(a)}
                  </span>
                  <span className="inline-block align-middle">
                    <span className="block font-medium text-ink-1">
                      {a.first_name} {a.last_name}
                    </span>
                    <span className="mt-px block font-mono text-[11.5px] text-ink-4">
                      {a.email}
                    </span>
                  </span>
                </td>
                <td className="border-b border-line-2 px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] ${
                      gov
                        ? "border-lime-bord bg-lime-soft text-lime"
                        : "border-line-1 bg-bg-2 text-ink-2"
                    }`}
                  >
                    {agencyLabel}
                  </span>
                </td>
                <td className="border-b border-line-2 px-4 py-3 text-right font-mono text-ink-2">
                  {a.total_time_minutes ?? 0}
                  {scheduledMinutes ? (
                    <span className="text-ink-4"> / {scheduledMinutes}</span>
                  ) : null}
                </td>
                <td className="border-b border-line-2 px-4 py-3 text-right">
                  {score >= 0 ? (
                    <span className="inline-flex items-center gap-2.5 font-mono font-semibold text-ink-1">
                      {score.toFixed(1)} <span className="font-normal text-ink-4">/ 10</span>
                      <span
                        className="inline-block h-1 rounded-sm bg-gradient-to-r from-lime to-cyan align-middle"
                        style={{ width: `${score * 9.6}px` }}
                      />
                    </span>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > 200 && (
        <p className="mt-2 px-4 text-[11.5px] text-ink-3">
          Showing first 200 of {sorted.length}. Export CSV for the full list.
        </p>
      )}
      <p className="mt-2 px-4 py-3 text-[11.5px] text-ink-4">
        <span className="font-medium text-ink-2">Engagement</span> is a 0–10 index: (time ÷
        scheduled) × 7, plus 1.5 if chats &gt; 5, plus 1.5 if questions &gt; 3. Click any
        attendee to see their chats, questions, time &amp; evaluation.
      </p>

      {selected && (
        <AttendeeDetailModal
          key={selected.id}
          attendee={selected}
          workshopId={workshopId}
          scheduledMinutes={scheduledMinutes}
          chats={chats}
          qa={qa}
          hasChatTranscript={hasChatTranscript}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
