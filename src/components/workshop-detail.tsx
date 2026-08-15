"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  Attendee,
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
import { SectionHelp } from "@/components/section-help";

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
// Demoted card-internal title: clearly subordinate to a SectionHeading so the
// eye can tell a region title from a widget label.
const CARD_LABEL =
  "m-0 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3";

// One consistent tier for the top of every major region. The overline + 20px
// display title sit a full step above the demoted card labels, so the page
// reads as distinct regions instead of one flat stack of ~14px headers.
function SectionHeading({
  eyebrow,
  title,
  help,
  count,
  action,
}: {
  eyebrow: string;
  title: string;
  help?: React.ReactNode;
  count?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-4">
        {eyebrow}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 font-display text-[21px] font-semibold tracking-[-0.02em] text-ink-1 dark:text-white">
          {title}
        </h2>
        {help}
        {count != null && <span className={PILL}>{count}</span>}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

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
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  // Ranks the KPIs against each other so the outcome metric leads instead of
  // four identical numbers competing. primary = the number to act on.
  tone?: "primary" | "secondary" | "neutral";
}) {
  const isPrimary = tone === "primary";
  const isSecondary = tone === "secondary";
  // KPI cards are intentionally light/white in BOTH themes — they "pop"
  // against the dark page in dark mode.
  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border p-[18px_18px_16px] shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)] ${
        isPrimary
          ? "border-[oklch(0.62_0.18_142/0.45)] bg-gradient-to-b from-[oklch(0.62_0.18_142/0.06)] to-white"
          : "border-[oklch(0.500_0.020_260/0.18)] bg-gradient-to-b from-white to-[oklch(0.985_0.003_260)]"
      }`}
    >
      {isPrimary && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[oklch(0.62_0.18_142)] to-[oklch(0.50_0.14_230)]" />
      )}
      {isSecondary && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[oklch(0.55_0.13_230/0.55)]" />
      )}
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.60_0.02_260/0.18)] to-transparent" />
      <div
        className={`mb-3.5 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.04em] ${
          isPrimary ? "text-[oklch(0.42_0.10_150)]" : "text-[oklch(0.505_0.016_260)]"
        }`}
      >
        {label}
        {isPrimary && (
          <span className="rounded-full bg-[oklch(0.62_0.18_142/0.14)] px-1.5 py-px font-mono text-[9px] font-semibold tracking-[0.08em] text-[oklch(0.42_0.10_150)]">
            KEY
          </span>
        )}
      </div>
      <div
        className={`flex items-baseline gap-1.5 font-display font-semibold leading-none tracking-[-0.03em] tabular-nums ${
          isPrimary
            ? "text-[54px] text-[oklch(0.46_0.13_150)]"
            : isSecondary
              ? "text-[44px] text-[oklch(0.205_0.020_260)]"
              : "text-[36px] text-[oklch(0.38_0.018_260)]"
        }`}
      >
        {value}
        {unit && (
          <span className="text-[22px] font-medium text-[oklch(0.505_0.016_260)]">{unit}</span>
        )}
      </div>
      {hint && <div className="mt-2.5 text-[12px] text-[oklch(0.505_0.016_260)]">{hint}</div>}
    </div>
  );
}

// Small badge showing where an intent signal came from — the live chat/Q&A, or
// a post-workshop evaluation comment. Eval gets an amber tint so it stands out
// from the transcript-sourced rows.
function SourceBadge({ source }: { source: WorkshopIntent["source"] }) {
  if (!source) return null;
  const isEval = source === "eval";
  const label =
    source === "eval" ? "Eval" : source === "qa" ? "Q&A" : source === "both" ? "Chat + Q&A" : "Chat";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.04em] ${
        isEval
          ? "border-[oklch(0.62_0.13_50/0.4)] bg-[oklch(0.62_0.13_50/0.09)] text-[oklch(0.52_0.13_50)]"
          : "border-line-2 bg-bg-2 text-ink-4"
      }`}
      title={isEval ? "From a post-workshop evaluation comment" : "From the live chat / Q&A"}
    >
      {label}
    </span>
  );
}

function Stars({ avg, className }: { avg: number; className?: string }) {
  const full = Math.floor(avg);
  const hasHalf = avg - full >= 0.25 && avg - full < 0.75;
  return (
    <div aria-label={`${avg} out of 5 stars`} className={className}>
      {Array.from({ length: 5 }).map((_, i) => {
        const opacity = i < full ? "" : i === full && hasHalf ? " opacity-60" : " opacity-25";
        return (
          <span key={i} className={`text-[oklch(0.66_0.17_60)]${opacity}`}>
            ★
          </span>
        );
      })}
    </div>
  );
}

// The aggregate rating is the single strongest piece of social proof, so it
// leads the feedback section as a full-width banner rather than trailing as the
// 8th cell of the quote grid.
function RatingBanner({ avg, responses }: { avg: number; responses: number | null }) {
  return (
    <div className="relative flex flex-wrap items-center gap-x-7 gap-y-3 overflow-hidden rounded-[14px] border border-[oklch(0.62_0.18_142/0.30)] bg-gradient-to-r from-[oklch(0.62_0.18_142/0.07)] to-[oklch(0.55_0.13_230/0.05)] px-6 py-5 shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-lime to-cyan" />
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink-1 dark:text-white">
          {avg.toFixed(1)}
        </span>
        <span className="text-[20px] text-ink-3">/ 5</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Stars avg={avg} className="text-2xl leading-none tracking-wide" />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
          Average rating
          {typeof responses === "number" && responses > 0
            ? ` · ${responses} ${responses === 1 ? "response" : "responses"}`
            : ""}
        </p>
      </div>
    </div>
  );
}

export function WorkshopDetail({
  workshop,
  attendees,
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
  const funnel = buildFunnel(attendees);
  const liveAttendees = attendees.filter(isLive);
  const visibleQA = qa.filter((q) => !q.dismissed);
  const totals = engagementTotals(liveAttendees, visibleQA.length);
  const retention = buildRetention(workshop, attendees);
  const pctLabel = `${Math.round(funnel.attendedPct * 100)}%`;

  const retiring = intents.filter((i) => i.intent_type === "retiring_soon");
  const cliff = intents.filter((i) => i.intent_type === "cliff_notes_request");
  const worried = intents.filter((i) => i.intent_type === "worried_confused");

  const [selected, setSelected] = useState<PersonRef | null>(null);
  const selectedAttendee = useMemo(
    () => (selected ? findAttendee(attendees, selected) : null),
    [selected, attendees],
  );

  return (
    <div className="space-y-11">
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
            // Plain <a>, not <Link>: this hits an API route that streams a CSV
            // download (Content-Disposition: attachment). Next's client-side
            // <Link> navigation silently no-ops on a file response.
            <a
              href={exportAllHref}
              className="inline-flex items-center gap-2 rounded-[9px] border border-line-1 bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 transition hover:bg-bg-2 hover:text-ink-1"
            >
              ↓ Export All
            </a>
          )}
          {leadsExportHref && (
            <a
              href={leadsExportHref}
              className="inline-flex items-center gap-2 rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_6px_18px_oklch(0.20_0.02_260/0.20)] transition hover:bg-[oklch(0.12_0.02_260)]"
            >
              ↓ Export Attendees
            </a>
          )}
        </div>
      </div>

      {/* KPI grid — ordered by what a follow-up team acts on: the outcome
          metrics lead and are visually ranked; the raw counts trail, muted. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Attended (live)"
          value={funnel.attended}
          hint="Participation = Live"
          tone="primary"
        />
        <KpiCard label="% Attended" value={pctLabel} hint="Live ÷ registered" tone="secondary" />
        <KpiCard label="Registered" value={funnel.registered} hint="Total CSV rows ingested" />
        <KpiCard
          label="Engaged"
          value={funnel.engaged}
          hint="≥ 1 chat, question, or reaction"
        />
      </div>

      {/* Attendee feedback — rating banner leads, then the quote wall */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Social proof"
          title="What attendees said"
          help={
            <SectionHelp
              title="What attendees said"
              whatItIs="Attendees' own evaluation comments and star ratings for this workshop, pulled live from your evaluations sheet."
              whatToClick="Click any comment to open that person's full profile — their questions, chats, time in session, and evaluation. Use “Download evaluations” to export them all."
              booking="Their own words are your best opener. Reach out referencing a specific comment (“you mentioned … in your feedback”) and quote the rating (“attendees rated this 4.7/5”) to make the ask feel earned."
            />
          }
          count={evalComments.length > 0 ? `${evalComments.length} quoted` : undefined}
          action={
            evalsExportHref ? (
              <a
                href={evalsExportHref}
                className="inline-flex items-center gap-2 rounded-[9px] border border-line-1 bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 transition hover:bg-bg-2 hover:text-ink-1"
              >
                ↓ Download evaluations
              </a>
            ) : undefined
          }
        />
        {evalComments.length === 0 && workshop.eval_rating_avg === null ? (
          <div className={`${CARD} px-5 py-6 text-[13px] text-ink-3`}>
            No eval responses linked to this workshop yet. They&apos;ll appear here once
            attendees fill out the evaluation form and the date in the sheet falls within
            7 days after the workshop date. Click <b className="text-ink-2">Re-fetch evals</b>
            {" "}to retry.
          </div>
        ) : null}
        {workshop.eval_rating_avg !== null && (
          <RatingBanner
            avg={workshop.eval_rating_avg}
            responses={workshop.eval_rating_responses}
          />
        )}
        {evalComments.length > 0 && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {evalComments.slice(0, 6).map((c) => {
              const canOpen = !!c.comment_author;
              const inner = (
                <>
                  <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-lime to-cyan opacity-60" />
                  <div className="mb-1.5 font-display text-[18px] font-bold leading-none text-lime opacity-40">
                    &ldquo;
                  </div>
                  <div className="flex-1 text-[14px] leading-[1.55] text-ink-1 [text-wrap:pretty]">
                    {c.comment_text}
                  </div>
                  {(c.comment_author || c.comment_agency) && (
                    <div className="mt-3.5 flex items-center gap-2.5 border-t border-line-2 pt-3 font-mono text-[11px] tracking-[0.02em] text-ink-3">
                      <span className="text-ink-4">—</span>
                      <span>
                        {c.comment_author ?? "Anonymous"}
                        {c.comment_agency ? `, ${c.comment_agency}` : ""}
                      </span>
                    </div>
                  )}
                </>
              );
              const cardClass = `relative flex min-h-[168px] flex-col overflow-hidden p-[16px_18px_18px] ${CARD}`;
              return canOpen ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected({ name: c.comment_author, email: c.comment_email })}
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
          </div>
        )}
        {evalComments.length > 6 && (
          <p className="text-[12px] text-ink-3">
            Showing 6 of {evalComments.length}. Download evaluations for the full set.
          </p>
        )}
      </section>

      {/* Charts row */}
      <section className="space-y-4">
        <SectionHeading eyebrow="Participation" title="Engagement & retention" />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className={`relative p-[18px_20px_20px] ${CARD}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <h3 className={CARD_LABEL}>Engagement breakdown</h3>
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
            <h3 className={CARD_LABEL}>Retention curve</h3>
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
      </section>

      {/* Intent panels — one region: the warm follow-up lists */}
      <section className="space-y-3.5">
        <SectionHeading
          eyebrow="Follow-up"
          title="Buying signals"
          count={`${retiring.length + cliff.length + worried.length} flagged`}
        />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className={`px-5 py-4 ${CARD}`}>
          <div className="mb-3 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14px] font-semibold text-ink-1">
              Retiring within the next 12 months
            </h3>
            <SectionHelp
              title="Retiring within the next 12 months"
              whatItIs="Attendees who signaled that they plan to retire within the next 12 months, with a “soon” date or phrase when they gave one. Auto-detected from the live transcript and post-workshop evaluation comments."
              whatToClick="Click anyone to open their profile — their questions, chats, time in session, eval, and the timing they mentioned."
              booking="This is your #1 call list. Phone anyone retiring within ~6 months in the next 48 hours, and lead with their stated timeline plus the exact question they asked — that's a warm, specific reason to talk now."
            />
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
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-ink-1">{r.attendee_name ?? "—"}</span>
                      <SourceBadge source={r.source} />
                    </span>
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
            <SectionHelp
              title="Cliff notes requested"
              whatItIs="Attendees who asked for the cliff notes / written summary / materials, or left an email to receive them. Auto-detected from the live chat, Q&A, and post-workshop evaluation comments."
              whatToClick="Click anyone to open their full profile and see exactly what they asked for."
              booking="These people raised their hand. Send what they asked for the same day — and use that email as your opener to offer a quick, no-obligation review of their numbers."
            />
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
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium text-ink-1">{r.attendee_name ?? "—"}</span>
                        <SourceBadge source={r.source} />
                      </span>
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

      {/* Worried about current situation */}
      <div className={`px-5 py-4 ${CARD}`}>
        <div className="mb-3 flex items-center gap-2.5">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
            Worried about current situation
          </h3>
          <SectionHelp
            title="Worried about current situation"
            whatItIs="Attendees who signaled they feel worried, apprehensive, overwhelmed, or confused about their benefits — most say so when the presenter asks if they feel like they're on a roller coaster trying to reach retirement (they reply “Amen”, “Me”, “Yes!”, or an agreeing emoji), plus anyone who calls the material a lot to take in or “clear as mud.” Auto-detected from the live transcript and from post-workshop evaluation comments."
            whatToClick="Click anyone to open their full profile — their questions, chats, time in session, and evaluation — with the exact words they used."
            booking="This is a warm call list: they've admitted they're overwhelmed and need help making sense of it. Lead with reassurance and their own words (“you mentioned it feels like a roller coaster — let's make it simple with your real numbers”) to book a one-on-one."
          />
          <span className={PILL}>
            {worried.length} {worried.length === 1 ? "person" : "people"}
          </span>
        </div>
        {worried.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">No worried / confused signals detected.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {worried.map((r) => {
              const quote = r.source_quote?.trim() || r.detail?.trim() || null;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    setSelected({ name: r.attendee_name, email: r.attendee_email })
                  }
                  className="flex h-full flex-col rounded-[10px] border border-line-1 bg-bg-2 p-3.5 text-left transition hover:bg-surface hover:shadow-sm"
                  title="View this person's details"
                >
                  {quote && (
                    <p className="mb-3 text-[13px] italic leading-snug text-[oklch(0.60_0.13_50)] [text-wrap:pretty]">
                      &ldquo;{quote}&rdquo;
                    </p>
                  )}
                  <div className="mt-auto border-t border-line-2 pt-2.5">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-1">
                      <span>{r.attendee_name ?? "—"}</span>
                      <SourceBadge source={r.source} />
                    </div>
                    <div className="truncate font-mono text-[11px] text-ink-4">
                      {r.attendee_email ?? ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </section>

      {/* Q&A */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Transcript"
          title="Q&A"
          help={
            <SectionHelp
              title="Q&A"
              whatItIs="Every question attendees asked during the session, alongside who asked it."
              whatToClick="Click any row to open that person's profile — their other questions, chats, time in session, and evaluation."
              booking="A question is a stated concern in their own words. Open your call or email with it (“you asked about survivor benefits — let's put your real numbers to it”) for an instant, relevant reason to connect."
            />
          }
          count={`${visibleQA.length} ${visibleQA.length === 1 ? "question" : "questions"}`}
        />
        <div className={`px-5 py-4 ${CARD}`}>
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
                    // Some Zoom Q&A exports carry only the asker's email, not
                    // their name. Resolve the name from the attendee list by
                    // email so the row still shows who asked and stays clickable.
                    const asker = findAttendee(attendees, {
                      name: q.sender_name,
                      email: q.sender_email,
                    });
                    const displayName =
                      (q.sender_name && q.sender_name.trim()) || (asker ? fullName(asker) : null);
                    const canOpen = !!(q.sender_email || displayName);
                    return (
                      <tr
                        key={q.id}
                        onClick={
                          canOpen
                            ? () => setSelected({ name: displayName, email: q.sender_email })
                            : undefined
                        }
                        className={`hover:bg-bg-2 ${canOpen ? "cursor-pointer" : ""}`}
                        title={canOpen ? "View this person's details" : undefined}
                      >
                        <td className="border-b border-line-2 px-4 py-3 align-top text-ink-2">
                          {q.question}
                        </td>
                        <td className="border-b border-line-2 px-4 py-3 align-top">
                          <div className="font-medium text-ink-1">{displayName ?? "—"}</div>
                          <div className="font-mono text-[11.5px] text-ink-4">
                            {q.sender_email ?? "—"}
                          </div>
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
      </section>

      {/* Attendees */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="Directory"
          title="Live attendees"
          help={
            <SectionHelp
              title="Live attendees"
              whatItIs="Everyone who attended live, with their engagement score and time in the session."
              whatToClick="Click any name to open their profile — chats, questions, time in session, and evaluation in one place. “Export All” downloads the whole list with every field for your CRM."
              booking="Work the list by heat: people who stayed to the end or asked questions are your warmest leads. Open each person's profile to personalize the outreach, and export to tag the hot ones for follow-up."
            />
          }
          count={liveAttendees.length}
          action={
            <>
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
            </>
          }
        />
        <div className={`overflow-hidden ${CARD}`}>
          <AttendeesTable
            attendees={liveAttendees}
            scheduledMinutes={workshop.scheduled_minutes}
            onSelect={(a) => setSelected({ name: fullName(a), email: a.email })}
          />
        </div>
      </section>

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
