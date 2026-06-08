"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  Attendee,
  QuestionTheme,
  Workshop,
  WorkshopChat,
  WorkshopEvalComment,
  WorkshopIntent,
  WorkshopQA,
} from "@/lib/supabase/types";
import { buildFunnel, buildRetention, engagementTotals, isLive } from "@/lib/workshop-stats";
import { formatWorkshopDate, humanizeDateIfIso } from "@/lib/format-date";
import { RetentionChart } from "@/components/charts/retention-chart";
import { AttendeesTable } from "@/components/attendees-table";
import { AttendeeDetailModal, fullName, type PersonRef } from "@/components/attendee-detail-modal";

const normEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const normName = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Resolve a {name,email} reference (from a Q&A sender or an intent row) to the
// full attendee row, when present, so the modal can show time/engagement.
function findAttendee(attendees: Attendee[], ref: PersonRef): Attendee | null {
  const e = normEmail(ref.email);
  const n = normName(ref.name);
  return (
    attendees.find((a) => {
      if (e && normEmail(a.email) === e) return true;
      return !!n && normName(fullName(a)) === n;
    }) ?? null
  );
}

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-1 bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-ink-3";

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-4 dark:text-[oklch(0.7_0.012_260)]">
        {label}
      </span>
      <b className="font-medium text-ink-2 dark:text-white">{value}</b>
    </span>
  );
}

function KpiCard({
  label,
  value,
  unit,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: boolean;
}) {
  // KPI cards are intentionally light/white in BOTH themes — they "pop"
  // against the dark page in dark mode.
  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-[oklch(0.500_0.020_260/0.18)] bg-gradient-to-b from-white to-[oklch(0.985_0.003_260)] p-[18px_18px_16px] shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)] text-[oklch(0.205_0.020_260)]"
    >
      {accent && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[oklch(0.62_0.18_142)] to-[oklch(0.50_0.14_230)]" />
      )}
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.60_0.02_260/0.18)] to-transparent" />
      <div className="mb-3.5 text-[12px] uppercase tracking-[0.04em] text-[oklch(0.505_0.016_260)]">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 font-display text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[oklch(0.205_0.020_260)]">
        {value}
        {unit && (
          <span className="text-[22px] font-medium text-[oklch(0.505_0.016_260)]">{unit}</span>
        )}
      </div>
      {hint && <div className="mt-2.5 text-[12px] text-[oklch(0.505_0.016_260)]">{hint}</div>}
    </div>
  );
}

function RatingTile({
  avg,
  responses,
}: {
  avg: number;
  responses: number | null;
}) {
  const full = Math.floor(avg);
  const hasHalf = avg - full >= 0.25 && avg - full < 0.75;
  // Always-light tile so the rating reads clearly in both themes.
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[14px] border border-[oklch(0.62_0.18_142/0.30)] bg-gradient-to-b from-[oklch(0.62_0.18_142/0.06)] to-[oklch(0.55_0.13_230/0.06)] bg-white p-5 text-center shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[oklch(0.505_0.016_260)]">
        Average rating
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-5xl font-semibold tracking-tight tabular-nums text-[oklch(0.205_0.020_260)]">
          {avg.toFixed(1)}
        </span>
        <span className="text-lg text-[oklch(0.505_0.016_260)]">/ 5</span>
      </div>
      <div
        aria-label={`${avg} out of 5 stars`}
        className="mt-2 text-2xl leading-none tracking-wide"
      >
        {Array.from({ length: 5 }).map((_, i) => {
          if (i < full)
            return (
              <span key={i} className="text-[oklch(0.66_0.17_60)]">
                ★
              </span>
            );
          if (i === full && hasHalf)
            return (
              <span key={i} className="text-[oklch(0.66_0.17_60)] opacity-60">
                ★
              </span>
            );
          return (
            <span key={i} className="text-[oklch(0.66_0.17_60)] opacity-25">
              ★
            </span>
          );
        })}
      </div>
      {typeof responses === "number" && responses > 0 && (
        <p className="mt-3 font-mono text-[11px] text-[oklch(0.505_0.016_260)]">
          From {responses} {responses === 1 ? "response" : "responses"}
        </p>
      )}
    </div>
  );
}

export function WorkshopDetail({
  workshop,
  attendees,
  themes: _themes,
  intents,
  qa,
  chats = [],
  evalComments,
  backHref,
  backLabel = "Back",
  leadsExportHref,
  exportAllHref,
  evalsExportHref,
  deleteAction,
  shareBar,
}: {
  workshop: Workshop;
  attendees: Attendee[];
  themes: QuestionTheme[];
  intents: WorkshopIntent[];
  qa: WorkshopQA[];
  chats?: WorkshopChat[];
  evalComments: WorkshopEvalComment[];
  backHref: string;
  backLabel?: string;
  leadsExportHref?: string;
  exportAllHref?: string;
  evalsExportHref?: string;
  deleteAction?: React.ReactNode;
  shareBar?: React.ReactNode;
}) {
  void _themes;
  const funnel = buildFunnel(attendees);
  const liveAttendees = attendees.filter(isLive);
  const visibleQA = qa.filter((q) => !q.dismissed);
  const totals = engagementTotals(liveAttendees, visibleQA.length);
  const retention = buildRetention(workshop, attendees);
  const pctLabel = `${Math.round(funnel.attendedPct * 100)}%`;

  const retiring = intents.filter((i) => i.intent_type === "retiring_soon");
  const cliff = intents.filter((i) => i.intent_type === "cliff_notes_request");

  const [selected, setSelected] = useState<PersonRef | null>(null);
  const selectedAttendee = useMemo(
    () => (selected ? findAttendee(attendees, selected) : null),
    [selected, attendees],
  );

  return (
    <div className="space-y-6">
      {shareBar}
      {/* breadcrumb */}
      <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-3">
        <Link href={backHref} className="hover:text-ink-1">
          ← {backLabel}
        </Link>
        <span className="text-ink-4">/</span>
        <span className="text-ink-2">{formatWorkshopDate(workshop.workshop_date)}</span>
      </div>

      {/* page head */}
      <div className="flex flex-wrap items-start gap-7 border-b border-line-2 pb-5">
        <div className="flex-1 min-w-[300px]">
          <h1 className="m-0 mb-2.5 font-display text-[38px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
            {workshop.title}
            {workshop.topic && (
              <span className="ml-3 text-[22px] font-normal text-ink-3 dark:text-[oklch(0.8_0.012_260)]">
                · {workshop.topic}
              </span>
            )}
          </h1>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12.5px] text-ink-3">
            <MetaItem label="Workshop" value={formatWorkshopDate(workshop.workshop_date)} />
            {workshop.presenter && <MetaItem label="Presenter" value={workshop.presenter} />}
            {workshop.scheduled_minutes && (
              <MetaItem label="Duration" value={`${workshop.scheduled_minutes} min`} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {deleteAction}
          {exportAllHref && (
            <Link
              href={exportAllHref}
              className="inline-flex items-center gap-2 rounded-[9px] border border-line-1 bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 transition hover:bg-bg-2 hover:text-ink-1"
            >
              ↓ Export All
            </Link>
          )}
          {leadsExportHref && (
            <Link
              href={leadsExportHref}
              className="inline-flex items-center gap-2 rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_6px_18px_oklch(0.20_0.02_260/0.20)] transition hover:bg-[oklch(0.12_0.02_260)]"
            >
              ↓ Export Attendees
            </Link>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Registered"
          value={funnel.registered}
          hint="Total CSV rows ingested"
          accent
        />
        <KpiCard
          label="Attended (live)"
          value={funnel.attended}
          hint="Participation = Live"
        />
        <KpiCard label="% Attended" value={pctLabel} hint="Live ÷ registered" />
        <KpiCard
          label="Engaged"
          value={funnel.engaged}
          hint="≥ 1 chat, question, or reaction"
        />
      </div>

      {/* Testimonials + rating tile */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.005em] text-ink-1 dark:text-white">
            What attendees said
          </h2>
          {evalComments.length > 0 && (
            <span className={PILL}>{evalComments.length} quoted</span>
          )}
          {evalsExportHref && (
            <a
              href={evalsExportHref}
              className="ml-auto inline-flex items-center gap-2 rounded-[9px] border border-line-1 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 transition hover:bg-bg-2 hover:text-ink-1"
            >
              ↓ Download evaluations
            </a>
          )}
        </div>
        {evalComments.length === 0 && workshop.eval_rating_avg === null ? (
          <div className={`${CARD} px-5 py-6 text-[13px] text-ink-3`}>
            No eval responses linked to this workshop yet. They&apos;ll appear here once
            attendees fill out the evaluation form and the date in the sheet falls within
            7 days after the workshop date. Click <b className="text-ink-2">Re-fetch evals</b>
            {" "}to retry.
          </div>
        ) : null}
        {(evalComments.length > 0 || workshop.eval_rating_avg !== null) && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {evalComments.slice(0, 7).map((c) => {
              const canOpen = !!c.comment_author;
              const inner = (
                <>
                  <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-lime to-cyan opacity-70" />
                  <div className="mb-2.5 font-display text-[30px] font-bold leading-[0.7] tracking-[-0.04em] text-lime opacity-80">
                    &ldquo;
                  </div>
                  <div className="flex-1 text-[13px] leading-[1.55] text-ink-2 [text-wrap:pretty]">
                    {c.comment_text}
                  </div>
                  {(c.comment_author || c.comment_agency) && (
                    <div className="mt-3.5 flex items-center gap-2.5 border-t border-line-2 pt-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
                      <span className="text-ink-4">—</span>
                      <span>
                        {c.comment_author ?? "Anonymous"}
                        {c.comment_agency ? `, ${c.comment_agency}` : ""}
                      </span>
                    </div>
                  )}
                </>
              );
              const cardClass = `relative flex min-h-[188px] flex-col overflow-hidden p-[16px_18px_18px] ${CARD}`;
              return canOpen ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected({ name: c.comment_author, email: null })}
                  className={`${cardClass} text-left transition hover:border-line-1 hover:shadow-md`}
                  title="View this person's details"
                >
                  {inner}
                </button>
              ) : (
                <div key={c.id} className={cardClass}>
                  {inner}
                </div>
              );
            })}
            {workshop.eval_rating_avg !== null && (
              <RatingTile
                avg={workshop.eval_rating_avg}
                responses={workshop.eval_rating_responses}
              />
            )}
          </div>
        )}
      </section>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className={`relative p-[18px_20px_20px] ${CARD}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
              Engagement breakdown
            </h3>
            <span className={PILL}>Totals · {liveAttendees.length} live</span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Chats", value: totals.chats, color: "oklch(0.62 0.18 142)" },
              { label: "Questions", value: totals.questions, color: "oklch(0.55 0.13 230)" },
              { label: "Reactions", value: totals.reactions, color: "oklch(0.66 0.17 60)" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-[10px] border border-line-1 bg-bg-2 px-4 py-3"
              >
                <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
                  {item.label}
                </span>
                <span
                  className="font-display text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums"
                  style={{ color: item.color }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-ink-4">
            Totals across all live attendees.
          </p>
        </div>
        <div className={`relative p-[18px_20px_20px] ${CARD}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
              Retention curve
            </h3>
            {workshop.scheduled_minutes && (
              <span className={PILL}>{workshop.scheduled_minutes} min session</span>
            )}
          </div>
          {retention.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              Needs join/exit timestamps + scheduled length on the workshop.
            </p>
          ) : (
            <RetentionChart data={retention} />
          )}
        </div>
      </div>

      {/* Intent panels */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className={`px-5 py-4 ${CARD}`}>
          <div className="mb-3 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14px] font-semibold text-ink-1">
              Retiring within the next 12 months
            </h3>
            <span className={PILL}>
              {retiring.length} {retiring.length === 1 ? "person" : "people"}
            </span>
          </div>
          {retiring.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No retirement intent detected.</p>
          ) : (
            <ul className="divide-y divide-line-2">
              {retiring.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({ name: r.attendee_name, email: r.attendee_email })
                    }
                    className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-left text-[13px] hover:bg-bg-2"
                    title="View this person's details"
                  >
                    <span className="font-medium text-ink-1">{r.attendee_name ?? "—"}</span>
                    <span className="font-mono text-[11.5px] text-ink-4">
                      {r.attendee_email ?? ""}
                    </span>
                    <span className="font-mono text-[11.5px] text-lime">
                      {humanizeDateIfIso(r.detail)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`px-5 py-4 ${CARD}`}>
          <div className="mb-3 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14px] font-semibold text-ink-1">
              Cliff notes requested
            </h3>
            <span className={PILL}>
              {cliff.length} {cliff.length === 1 ? "request" : "requests"}
            </span>
          </div>
          {cliff.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No cliff-notes requests detected.</p>
          ) : (
            <ul className="divide-y divide-line-2">
              {cliff.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({ name: r.attendee_name, email: r.attendee_email })
                    }
                    className="w-full space-y-0.5 py-2 text-left text-[13px] hover:bg-bg-2"
                    title="View this person's details"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <span className="font-medium text-ink-1">{r.attendee_name ?? "—"}</span>
                      <span className="font-mono text-[11.5px] text-ink-4">
                        {r.attendee_email ?? ""}
                      </span>
                    </div>
                    {r.detail && <p className="text-[11.5px] text-ink-3">{r.detail}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Q&A */}
      <div className={`px-5 py-4 ${CARD}`}>
        <div className="mb-4 flex items-center gap-2.5">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">Q&amp;A</h3>
          <span className={PILL}>
            {visibleQA.length} {visibleQA.length === 1 ? "question" : "questions"}
          </span>
        </div>
        {visibleQA.length === 0 ? (
          <p className="text-[13px] text-ink-3">No Q&A submitted.</p>
        ) : (
          <>
            <div className="scroll-show max-h-[26rem] overflow-y-auto rounded-[10px] border border-line-1">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 bg-bg-2">
                  <tr>
                    <th className="border-b border-line-1 px-4 py-2.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4">
                      Question
                    </th>
                    <th className="w-56 border-b border-line-1 px-4 py-2.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4">
                      Asked by
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQA.map((q) => {
                    const canOpen = !!(q.sender_name || q.sender_email);
                    return (
                      <tr key={q.id} className="hover:bg-bg-2">
                        <td className="border-b border-line-2 px-4 py-3 align-top text-ink-2">
                          {q.question}
                        </td>
                        <td className="border-b border-line-2 px-4 py-3 align-top">
                          {canOpen ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSelected({ name: q.sender_name, email: q.sender_email })
                              }
                              className="text-left hover:underline"
                              title="View this person's details"
                            >
                              <div className="font-medium text-ink-1">{q.sender_name ?? "—"}</div>
                              <div className="font-mono text-[11.5px] text-ink-4">
                                {q.sender_email ?? "—"}
                              </div>
                            </button>
                          ) : (
                            <>
                              <div className="font-medium text-ink-1">{q.sender_name ?? "—"}</div>
                              <div className="font-mono text-[11.5px] text-ink-4">
                                {q.sender_email ?? "—"}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visibleQA.length > 7 && (
              <p className="mt-2 text-[11.5px] text-ink-3">
                ↕ Scroll to see all {visibleQA.length} questions.
              </p>
            )}
          </>
        )}
      </div>

      {/* Attendees */}
      <div className={`overflow-hidden ${CARD}`}>
        <div className="flex items-center gap-2.5 px-5 pb-3.5 pt-4">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
            Live attendees
          </h3>
          <span className={PILL}>{liveAttendees.length}</span>
          <div className="ml-auto flex items-center gap-2">
            {exportAllHref && (
              <a
                href={exportAllHref}
                className="inline-flex items-center gap-2 rounded-[9px] border border-line-1 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 transition hover:bg-bg-2 hover:text-ink-1"
              >
                ↓ Export All
              </a>
            )}
            {leadsExportHref && (
              <a
                href={leadsExportHref}
                className="inline-flex items-center gap-2 rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_4px_12px_oklch(0.20_0.02_260/0.20)] transition hover:bg-[oklch(0.12_0.02_260)]"
              >
                ↓ Export Attendees
              </a>
            )}
          </div>
        </div>
        <AttendeesTable
          attendees={liveAttendees}
          scheduledMinutes={workshop.scheduled_minutes}
          onSelect={(a) => setSelected({ name: fullName(a), email: a.email })}
        />
      </div>

      {selected && (
        <AttendeeDetailModal
          key={`${selected.email ?? ""}|${selected.name ?? ""}`}
          person={selected}
          attendee={selectedAttendee}
          workshopId={workshop.id}
          scheduledMinutes={workshop.scheduled_minutes}
          chats={chats}
          qa={qa}
          hasChatTranscript={chats.length > 0}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
