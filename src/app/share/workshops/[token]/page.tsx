import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatWorkshopDate } from "@/lib/format-date";
import { buildFunnel, buildRetention, engagementTotals, isLive } from "@/lib/workshop-stats";
import { RetentionChart } from "@/components/charts/retention-chart";
import { NextWorkshop } from "@/components/next-workshop-card";
import { getNextWorkshops } from "@/lib/next-workshop";
import type {
  Attendee,
  Client,
  Workshop,
  WorkshopEvalComment,
} from "@/lib/supabase/types";

/** The only eval-comment fields this public page is allowed to read. */
type PublicEvalComment = Pick<WorkshopEvalComment, "id" | "comment_text">;

// Public by design (shared with prospects, no login) — but never indexable:
// this page shows attendee names, agencies and verbatim eval quotes. Paired
// with the X-Robots-Tag header on /share/:path* in next.config.ts.
export const metadata: Metadata = {
  title: "Workshop summary — Fed Navigator",
  robots: { index: false, follow: false },
};

const CARD =
  "relative overflow-hidden rounded-[12px] border border-line-1 bg-surface shadow-[var(--shadow)]";

function StatCard({
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
  return (
    <div
      className={`relative overflow-hidden rounded-[12px] border p-[16px_18px_15px] text-ink-1 shadow-[var(--shadow)] ${
        accent ? "border-brand-bord bg-brand-soft" : "border-line-1 bg-surface"
      }`}
    >
      {accent && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-brand to-brand-deep" />
      )}
      <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent" />
      <div className="mb-3 text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {value}
        {unit && (
          <span className="text-[18px] font-medium text-ink-3">{unit}</span>
        )}
      </div>
      {hint && (
        <div className="mt-2.5 text-[11.5px] text-ink-3">{hint}</div>
      )}
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
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[12px] border border-brand-bord bg-gradient-to-b from-brand-soft to-surface p-5 text-center shadow-[var(--shadow)]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Average rating</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-display text-5xl font-semibold tracking-tight tabular-nums text-ink-1">
          {avg.toFixed(1)}
        </span>
        <span className="text-lg text-ink-3">/ 5</span>
      </div>
      <div className="mt-2 text-2xl leading-none tracking-wide">
        {Array.from({ length: 5 }).map((_, i) => {
          if (i < full)
            return (
              <span key={i} className="text-amber">
                ★
              </span>
            );
          if (i === full && hasHalf)
            return (
              <span key={i} className="text-amber opacity-60">
                ★
              </span>
            );
          return (
            <span key={i} className="text-amber opacity-25">
              ★
            </span>
          );
        })}
      </div>
      {typeof responses === "number" && responses > 0 && (
        <p className="mt-3 font-mono text-[11px] text-ink-3">
          From {responses} {responses === 1 ? "response" : "responses"}
        </p>
      )}
    </div>
  );
}

export default async function PublicWorkshopPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  // Looked up on share_token, never on workshops.id — the workshop id is not a
  // secret and must not grant access to this page.
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();

  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("share_token", token)
    .maybeSingle<Workshop>();

  if (!workshop) notFound();

  const wid = workshop.id;

  const [{ data: attendees }, { data: evalComments }, { count: qaCount }, { data: client }] =
    await Promise.all([
      admin
        .from("attendees")
        .select("*")
        .eq("workshop_id", wid)
        .order("total_time_minutes", { ascending: false }),
      // Quote text only. comment_author / comment_agency / comment_email are
      // deliberately not selected: this page is openable by anyone holding the
      // link, so no attendee is identified on it. The private report reads the
      // full row.
      admin
        .from("workshop_eval_comments")
        .select("id, comment_text")
        .eq("workshop_id", wid)
        .order("display_order"),
      admin
        .from("workshop_qa")
        .select("*", { count: "exact", head: true })
        .eq("workshop_id", wid)
        .eq("dismissed", false),
      admin
        .from("clients")
        .select("eval_sheet_url, next_workshops")
        .eq("id", workshop.client_id)
        .maybeSingle<Pick<Client, "eval_sheet_url" | "next_workshops">>(),
    ]);

  const rows = (attendees ?? []) as Attendee[];
  const liveRows = rows.filter(isLive);
  const evals = (evalComments ?? []) as PublicEvalComment[];
  const nextWorkshops = client ? await getNextWorkshops(client) : [];

  const funnel = buildFunnel(rows);
  const totals = engagementTotals(liveRows, qaCount ?? 0);
  const retention = buildRetention(workshop, rows);
  const pctLabel = `${Math.round(funnel.attendedPct * 100)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-line-2 pb-5">
        <h1 className="m-0 font-display text-[38px] font-semibold tracking-[-0.025em] text-ink-1">
          {workshop.title}
          {workshop.topic && (
            <span className="ml-3 text-[22px] font-normal text-ink-3">
              · {workshop.topic}
            </span>
          )}
        </h1>
        <p className="mt-2 text-base font-medium text-ink-1">
          <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-4">
            Workshop
          </span>
          {formatWorkshopDate(workshop.workshop_date)}
          {/* No presenter name here — this page names nobody. The private
              report still shows it. */}
        </p>
      </div>

      {/* 3 stat cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard
          label="Registered"
          value={funnel.registered}
          hint="Total registrants"
          accent
        />
        <StatCard
          label="Attended (live)"
          value={funnel.attended}
          hint="Joined the live session"
        />
        <StatCard label="% Attended" value={pctLabel} hint="Live ÷ registered" />
      </div>

      {/* What attendees said */}
      {(evals.length > 0 || workshop.eval_rating_avg !== null) && (
        <section className="space-y-3">
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.005em] text-ink-1">
            What attendees said
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {evals.slice(0, 7).map((c) => (
              <div
                key={c.id}
                className={`relative flex min-h-[188px] flex-col overflow-hidden p-[16px_18px_18px] ${CARD}`}
              >
                <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-brand to-brand-deep opacity-70" />
                <div className="mb-2.5 font-display text-[30px] font-bold leading-[0.7] tracking-[-0.04em] text-brand opacity-80">
                  &ldquo;
                </div>
                {/* No attribution here by design — see the eval-comment query
                    above. The private report still shows author + agency. */}
                <div className="flex-1 text-[13px] leading-[1.55] text-ink-2 [text-wrap:pretty]">
                  {c.comment_text}
                </div>
              </div>
            ))}
            {workshop.eval_rating_avg !== null && (
              <RatingTile
                avg={workshop.eval_rating_avg}
                responses={workshop.eval_rating_responses}
              />
            )}
          </div>
        </section>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className={`relative p-[18px_20px_20px] ${CARD}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
              Engagement breakdown
            </h3>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Chats", value: totals.chats, color: "var(--brand)" },
              { label: "Questions", value: totals.questions, color: "var(--brand-deep)" },
              { label: "Reactions", value: totals.reactions, color: "var(--amber)" },
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
        </div>
        <div className={`relative p-[18px_20px_20px] ${CARD}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
              Retention curve
            </h3>
          </div>
          {retention.length === 0 ? (
            <p className="text-[13px] text-ink-3">No timing data available.</p>
          ) : (
            <RetentionChart data={retention} />
          )}
        </div>
      </div>

      {/* Next workshop */}
      <NextWorkshop items={nextWorkshops} />

      {/* Footer CTA */}
      <div className="flex items-center justify-center gap-4 border-t border-line-2 pt-8">
        <p className="text-[13px] text-ink-3">Want the full report — Q&amp;A, attendees, leads?</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/dashboard`)}`}
          className="inline-flex items-center gap-2 rounded-[9px] border border-brand-deep bg-brand-deep px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-brand-ink"
        >
          Sign in for full details →
        </Link>
      </div>
    </div>
  );
}
