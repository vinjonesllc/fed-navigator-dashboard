import Link from "next/link";
import { formatWorkshopDate } from "@/lib/format-date";
import type { WorkshopWithStats } from "@/lib/queries";
import type { NextWorkshopCard } from "@/lib/next-workshop";
import { NextWorkshop, AccentStrip } from "@/components/next-workshop-card";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-1 bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-ink-3";

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line-1 bg-gradient-to-b from-surface to-background p-[18px_18px_16px] shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
      <div
        className="absolute left-0 right-0 top-0 h-px"
        style={{
          background: accent
            ? `linear-gradient(to right, transparent, ${accent}, transparent)`
            : "linear-gradient(to right, transparent, oklch(0.60 0.02 260 / 0.18), transparent)",
        }}
      />
      <div className="mb-3.5 text-[12px] uppercase tracking-[0.04em] text-ink-3">{label}</div>
      <div className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink-1">
        {value}
      </div>
      {hint && <div className="mt-2.5 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

function RatingStat({
  avg,
  count,
  accent,
}: {
  avg: number | null;
  count: number;
  accent?: string | null;
}) {
  const full = avg !== null ? Math.floor(avg) : 0;
  const hasHalf = avg !== null && avg - full >= 0.25 && avg - full < 0.75;
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line-1 bg-gradient-to-b from-surface to-background p-[18px_18px_16px] shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
      <div
        className="absolute left-0 right-0 top-0 h-px"
        style={{
          background: accent
            ? `linear-gradient(to right, transparent, ${accent}, transparent)`
            : "linear-gradient(to right, transparent, oklch(0.60 0.02 260 / 0.18), transparent)",
        }}
      />
      <div className="mb-3.5 text-[12px] uppercase tracking-[0.04em] text-ink-3">Average rating</div>
      {avg === null ? (
        <>
          <div className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink-3">
            —
          </div>
          <div className="mt-2.5 text-[12px] text-ink-3">No ratings yet</div>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink-1">
              {avg.toFixed(1)}
            </span>
            <span className="text-[18px] font-medium text-ink-3">/ 5</span>
          </div>
          <div
            aria-label={`${avg.toFixed(1)} out of 5 stars`}
            className="mt-2 text-[18px] leading-none tracking-wide"
          >
            {Array.from({ length: 5 }).map((_, i) => {
              if (i < full)
                return (
                  <span key={i} style={{ color: "oklch(0.66 0.17 60)" }}>
                    ★
                  </span>
                );
              if (i === full && hasHalf)
                return (
                  <span key={i} style={{ color: "oklch(0.66 0.17 60)", opacity: 0.6 }}>
                    ★
                  </span>
                );
              return (
                <span key={i} style={{ color: "oklch(0.66 0.17 60)", opacity: 0.25 }}>
                  ★
                </span>
              );
            })}
          </div>
          <div className="mt-2.5 text-[12px] text-ink-3">
            Across {count} rated workshop{count === 1 ? "" : "s"}
          </div>
        </>
      )}
    </div>
  );
}

export function ClientOverview({
  workshops,
  workshopHref,
  editHref,
  nextWorkshop,
  registrationsExportHref,
  accentColor,
}: {
  workshops: WorkshopWithStats[];
  workshopHref: (id: string) => string;
  editHref?: (id: string) => string;
  nextWorkshop?: NextWorkshopCard | null;
  registrationsExportHref?: string;
  accentColor?: string | null;
}) {
  const accent = accentColor?.trim() || null;
  const totalAttendees = workshops.reduce((acc, w) => acc + w.live_count, 0);
  const totalRegistered = workshops.reduce((acc, w) => acc + w.registered_count, 0);
  const avgAttendancePct =
    totalRegistered > 0 ? Math.round((totalAttendees / totalRegistered) * 100) : 0;

  // Average of each workshop's own "average rating" (unweighted mean across the
  // workshops that have one).
  const ratedWorkshops = workshops.filter(
    (w): w is WorkshopWithStats & { eval_rating_avg: number } => w.eval_rating_avg !== null,
  );
  const avgRating =
    ratedWorkshops.length > 0
      ? Math.round(
          (ratedWorkshops.reduce((acc, w) => acc + w.eval_rating_avg, 0) / ratedWorkshops.length) *
            10,
        ) / 10
      : null;

  return (
    <div className="space-y-6">
      <NextWorkshop
        data={nextWorkshop ?? null}
        accent={accent}
        exportHref={registrationsExportHref}
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Workshops" value={workshops.length} accent={accent} />
        <Stat
          label="Total attendees"
          value={totalAttendees}
          hint={`${totalRegistered} registered`}
          accent={accent}
        />
        <Stat
          label="Average attendance"
          value={`${avgAttendancePct}%`}
          hint="Live ÷ registered"
          accent={accent}
        />
        <RatingStat avg={avgRating} count={ratedWorkshops.length} accent={accent} />
      </div>

      <div className={`relative ${CARD} overflow-hidden`}>
        <AccentStrip accent={accent} />
        <div className="flex items-center gap-2.5 px-5 pb-3.5 pt-4">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">Workshops</h3>
          <span className={PILL}>{workshops.length}</span>
        </div>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {["Date", "Title", "Presenter", "Registered", "Attended (live)", "% Attended", "Actions"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={`border-b border-line-1 bg-bg-2 px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4 ${
                      i >= 3 && i <= 5 ? "text-right" : i === 6 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {workshops.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="border-b border-line-2 px-4 py-6 text-center text-ink-3"
                >
                  No workshops yet.
                </td>
              </tr>
            )}
            {workshops.map((w) => {
              const pct =
                w.registered_count > 0
                  ? Math.round((w.live_count / w.registered_count) * 100)
                  : 0;
              return (
                <tr key={w.id} className="hover:bg-bg-2">
                  <td className="border-b border-line-2 px-4 py-3 font-mono text-[12px] text-ink-2">
                    {formatWorkshopDate(w.workshop_date)}
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 font-medium text-ink-1">
                    {w.title}
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 text-ink-3">
                    {w.presenter ?? "—"}
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 text-right font-mono text-ink-2">
                    {w.registered_count}
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 text-right font-mono text-ink-2">
                    {w.live_count}
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 text-right font-mono text-ink-2">
                    {pct}%
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {editHref && (
                        <Link
                          href={editHref(w.id)}
                          className="inline-flex items-center gap-1 rounded-[7px] border border-line-1 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                        >
                          Edit
                        </Link>
                      )}
                      <Link
                        href={workshopHref(w.id)}
                        className="inline-flex items-center gap-1 rounded-[7px] border border-line-1 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                      >
                        View →
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
