import Link from "next/link";
import { formatWorkshopDate } from "@/lib/format-date";
import type { WorkshopWithStats } from "@/lib/queries";
import type { NextWorkshopCard } from "@/lib/next-workshop";
import { NextWorkshop } from "@/components/next-workshop-card";
import { ClickableRow } from "@/components/clickable-row";

const CARD =
  "relative overflow-hidden rounded-[12px] border border-line-1 bg-surface shadow-[var(--shadow)]";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-1 bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-ink-3";

/** Hairline that seats each stat card. Brand at the centre, fading to nothing. */
function TopHairline() {
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent"
    />
  );
}

function Stat({
  label,
  value,
  hint,
  meter,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** 0–100. Draws a fill bar under the value — used for attendance. */
  meter?: number;
}) {
  return (
    <div className={`${CARD} px-[15px] pt-3.5 pb-[13px]`}>
      <TopHairline />
      <div className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">{label}</div>
      <div className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums text-ink-1">
        {value}
      </div>
      {meter !== undefined && (
        <div
          className="mt-2.5 h-[5px] overflow-hidden rounded-[3px] border border-line-2 bg-bg-2"
          aria-hidden
        >
          <div className="h-full rounded-[3px] bg-brand" style={{ width: `${meter}%` }} />
        </div>
      )}
      {hint && <div className="mt-2 text-[11.5px] text-ink-3">{hint}</div>}
    </div>
  );
}

function RatingStat({
  avg,
  workshops,
  responses,
}: {
  avg: number | null;
  workshops: number;
  responses: number;
}) {
  const full = avg !== null ? Math.floor(avg) : 0;
  const hasHalf = avg !== null && avg - full >= 0.25 && avg - full < 0.75;
  return (
    <div className={`${CARD} px-[15px] pt-3.5 pb-[13px]`}>
      <TopHairline />
      <div className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Average rating</div>
      {avg === null ? (
        <>
          <div className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink-3">
            —
          </div>
          <div className="mt-2 text-[11.5px] text-ink-3">No ratings yet</div>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums text-ink-1">
              {avg.toFixed(1)}
            </span>
            <span className="text-[15px] font-medium text-ink-3">/ 5</span>
          </div>
          <div
            aria-label={`${avg.toFixed(1)} out of 5 stars`}
            className="mt-1.5 text-[16px] leading-none tracking-wide text-amber"
          >
            {Array.from({ length: 5 }).map((_, i) => {
              const opacity = i < full ? "" : i === full && hasHalf ? " opacity-60" : " opacity-25";
              return (
                <span key={i} className={opacity.trim()}>
                  ★
                </span>
              );
            })}
          </div>
          <div className="mt-2 text-[11.5px] text-ink-3">
            {responses > 0
              ? `Across ${responses.toLocaleString()} response${responses === 1 ? "" : "s"} from ${workshops} workshop${workshops === 1 ? "" : "s"}`
              : `Across ${workshops} rated workshop${workshops === 1 ? "" : "s"}`}
          </div>
        </>
      )}
    </div>
  );
}

const TH =
  "border-y border-line-1 bg-bg-2 px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4 whitespace-nowrap";
const TD = "border-b border-line-2 px-4 py-[11px] text-ink-2";

export function ClientOverview({
  workshops,
  workshopHref,
  editHref,
  nextWorkshops,
  registrationsExportFor,
}: {
  workshops: WorkshopWithStats[];
  workshopHref: (id: string) => string;
  editHref?: (id: string) => string;
  nextWorkshops?: NextWorkshopCard[];
  registrationsExportFor?: (index: number) => string;
}) {
  const totalAttendees = workshops.reduce((acc, w) => acc + w.live_count, 0);
  const totalRegistered = workshops.reduce((acc, w) => acc + w.registered_count, 0);
  const avgAttendancePct =
    totalRegistered > 0 ? Math.round((totalAttendees / totalRegistered) * 100) : 0;

  // Cumulative average: every response counts once, wherever it was given.
  // Averaging each workshop's own average instead would let a workshop with one
  // response move the figure as much as one with sixty.
  const ratedWorkshops = workshops.filter(
    (w): w is WorkshopWithStats & { eval_rating_avg: number } => w.eval_rating_avg !== null,
  );
  const totalResponses = ratedWorkshops.reduce(
    (acc, w) => acc + (w.eval_rating_responses ?? 0),
    0,
  );
  const avgRating =
    totalResponses > 0
      ? Math.round(
          (ratedWorkshops.reduce(
            (acc, w) => acc + w.eval_rating_avg * (w.eval_rating_responses ?? 0),
            0,
          ) /
            totalResponses) *
            10,
        ) / 10
      : // No workshop carries a response count (older imports). Fall back to the
        // unweighted mean rather than showing nothing.
        ratedWorkshops.length > 0
        ? Math.round(
            (ratedWorkshops.reduce((acc, w) => acc + w.eval_rating_avg, 0) /
              ratedWorkshops.length) *
              10,
          ) / 10
        : null;

  const columns = ["Date", "Title", "Registered", "Attended (live)", "% Attended"];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Workshops" value={workshops.length} />
          <Stat
            label="Total attendees"
            value={totalAttendees.toLocaleString()}
            hint={`${totalRegistered.toLocaleString()} registered`}
          />
          <Stat
            label="Average attendance"
            value={`${avgAttendancePct}%`}
            meter={avgAttendancePct}
            hint="Live ÷ registered"
          />
          <RatingStat
            avg={avgRating}
            workshops={ratedWorkshops.length}
            responses={totalResponses}
          />
        </div>

        <section className={CARD}>
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
          <div className="flex flex-wrap items-center gap-2.5 px-[18px] pt-3.5 pb-3">
            <h3 className="m-0 font-display text-[15px] font-semibold text-ink-1">Workshops</h3>
            <span className={PILL}>{workshops.length}</span>
            <span className="ml-auto text-[11.5px] text-ink-3">
              Select a row to open the workshop
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  {columns.map((h, i) => (
                    <th key={h} scope="col" className={`${TH} ${i >= 2 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                  {editHref && <th scope="col" className={`${TH} text-right`}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {workshops.length === 0 && (
                  <tr>
                    <td
                      colSpan={editHref ? 6 : 5}
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
                    <ClickableRow
                      key={w.id}
                      href={workshopHref(w.id)}
                      className="cursor-pointer transition-colors hover:bg-bg-2"
                      title="Click to view this workshop"
                    >
                      <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>
                        {formatWorkshopDate(w.workshop_date)}
                      </td>
                      <td className={`${TD} min-w-[220px] font-medium text-ink-1`}>{w.title}</td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>
                        {w.registered_count}
                      </td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>{w.live_count}</td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>
                        <span className="flex items-center justify-end gap-2.5">
                          <span
                            aria-hidden
                            className="h-[5px] w-[54px] shrink-0 overflow-hidden rounded-[3px] border border-line-2 bg-bg-2"
                          >
                            <span className="block h-full bg-brand-deep" style={{ width: `${pct}%` }} />
                          </span>
                          {pct}%
                        </span>
                      </td>
                      {editHref && (
                        <td className={`${TD} text-right`}>
                          <Link
                            href={editHref(w.id)}
                            className="inline-flex items-center gap-1 rounded-[7px] border border-line-1 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                          >
                            Edit
                          </Link>
                        </td>
                      )}
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="xl:sticky xl:top-6">
        <NextWorkshop
          items={nextWorkshops ?? []}
          exportHrefFor={registrationsExportFor}
          variant="rail"
        />
      </aside>
    </div>
  );
}
