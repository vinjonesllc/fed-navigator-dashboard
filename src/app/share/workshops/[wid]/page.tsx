import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatWorkshopDate } from "@/lib/format-date";
import { buildFunnel, buildRetention, engagementTotals, isLive } from "@/lib/workshop-stats";
import { RetentionChart } from "@/components/charts/retention-chart";
import type {
  Attendee,
  Workshop,
  WorkshopEvalComment,
} from "@/lib/supabase/types";

export const metadata = { title: "Workshop summary — Fed Pilot" };

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";

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
    <div className="relative overflow-hidden rounded-[14px] border border-[oklch(0.500_0.020_260/0.18)] bg-gradient-to-b from-white to-[oklch(0.985_0.003_260)] p-[18px_18px_16px] shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)] text-[oklch(0.205_0.020_260)]">
      {accent && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[oklch(0.62_0.18_142)] to-[oklch(0.50_0.14_230)]" />
      )}
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.60_0.02_260/0.18)] to-transparent" />
      <div className="mb-3.5 text-[12px] uppercase tracking-[0.04em] text-[oklch(0.505_0.016_260)]">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 font-display text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {value}
        {unit && (
          <span className="text-[22px] font-medium text-[oklch(0.505_0.016_260)]">{unit}</span>
        )}
      </div>
      {hint && (
        <div className="mt-2.5 text-[12px] text-[oklch(0.505_0.016_260)]">{hint}</div>
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
      <div className="mt-2 text-2xl leading-none tracking-wide">
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

export default async function PublicWorkshopPage({
  params,
}: {
  params: Promise<{ wid: string }>;
}) {
  const { wid } = await params;
  const admin = createSupabaseAdminClient();

  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("id", wid)
    .maybeSingle<Workshop>();

  if (!workshop) notFound();

  const [{ data: attendees }, { data: evalComments }, { count: qaCount }] = await Promise.all([
    admin
      .from("attendees")
      .select("*")
      .eq("workshop_id", wid)
      .order("total_time_minutes", { ascending: false }),
    admin
      .from("workshop_eval_comments")
      .select("*")
      .eq("workshop_id", wid)
      .order("display_order"),
    admin
      .from("workshop_qa")
      .select("*", { count: "exact", head: true })
      .eq("workshop_id", wid)
      .eq("dismissed", false),
  ]);

  const rows = (attendees ?? []) as Attendee[];
  const liveRows = rows.filter(isLive);
  const evals = (evalComments ?? []) as WorkshopEvalComment[];

  const funnel = buildFunnel(rows);
  const totals = engagementTotals(liveRows, qaCount ?? 0);
  const retention = buildRetention(workshop, rows);
  const pctLabel = `${Math.round(funnel.attendedPct * 100)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-line-2 pb-5">
        <h1 className="m-0 font-display text-[38px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
          {workshop.title}
          {workshop.topic && (
            <span className="ml-3 text-[22px] font-normal text-ink-3 dark:text-[oklch(0.8_0.012_260)]">
              · {workshop.topic}
            </span>
          )}
        </h1>
        <p className="mt-2 text-base font-medium text-ink-1 dark:text-white">
          <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-4 dark:text-[oklch(0.7_0.012_260)]">
            Workshop
          </span>
          {formatWorkshopDate(workshop.workshop_date)}
          {workshop.presenter && (
            <>
              {"   "}
              <span className="mr-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-4 dark:text-[oklch(0.7_0.012_260)]">
                Presenter
              </span>
              {workshop.presenter}
            </>
          )}
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
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.005em] text-ink-1 dark:text-white">
            What attendees said
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {evals.slice(0, 7).map((c) => (
              <div
                key={c.id}
                className={`relative flex min-h-[188px] flex-col overflow-hidden p-[16px_18px_18px] ${CARD}`}
              >
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
            <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1 dark:text-white">
              Engagement breakdown
            </h3>
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
        </div>
        <div className={`relative p-[18px_20px_20px] ${CARD}`}>
          <div className="mb-4 flex items-center gap-2.5">
            <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1 dark:text-white">
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

      {/* Footer CTA */}
      <div className="flex items-center justify-center gap-4 border-t border-line-2 pt-8">
        <p className="text-[13px] text-ink-3">Want the full report — Q&amp;A, attendees, leads?</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/admin/clients`)}`}
          className="inline-flex items-center gap-2 rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_6px_18px_oklch(0.20_0.02_260/0.20)] transition hover:bg-[oklch(0.12_0.02_260)]"
        >
          Sign in for full details →
        </Link>
      </div>
    </div>
  );
}
