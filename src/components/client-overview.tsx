import Link from "next/link";
import { OverviewTrend } from "@/components/charts/overview-trend";
import { formatWorkshopDate } from "@/lib/format-date";
import type { WorkshopWithStats } from "@/lib/queries";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-1 bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-ink-3";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line-1 bg-gradient-to-b from-surface to-background p-[18px_18px_16px] shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
      <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.60_0.02_260/0.18)] to-transparent" />
      <div className="mb-3.5 text-[12px] uppercase tracking-[0.04em] text-ink-3">{label}</div>
      <div className="font-display text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink-1">
        {value}
      </div>
      {hint && <div className="mt-2.5 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function ClientOverview({
  workshops,
  workshopHref,
}: {
  workshops: WorkshopWithStats[];
  workshopHref: (id: string) => string;
}) {
  const totalAttendees = workshops.reduce((acc, w) => acc + w.live_count, 0);
  const totalRegistered = workshops.reduce((acc, w) => acc + w.registered_count, 0);
  const avgAttendancePct =
    totalRegistered > 0 ? Math.round((totalAttendees / totalRegistered) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Stat label="Workshops" value={workshops.length} />
        <Stat
          label="Total attendees"
          value={totalAttendees}
          hint={`${totalRegistered} registered`}
        />
        <Stat
          label="Average attendance"
          value={`${avgAttendancePct}%`}
          hint="Live ÷ registered"
        />
      </div>

      <div className={`p-[18px_20px_20px] ${CARD}`}>
        <div className="mb-4 flex items-center gap-2.5">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1">
            Attendance over time
          </h3>
        </div>
        {workshops.length === 0 ? (
          <p className="text-[13px] text-ink-3">No workshops yet.</p>
        ) : (
          <OverviewTrend
            data={[...workshops].reverse().map((w) => ({
              date: w.workshop_date,
              title: w.title,
              attendees: w.live_count,
              engagement: w.avg_engagement ?? 0,
            }))}
          />
        )}
      </div>

      <div className={`${CARD} overflow-hidden`}>
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
                    <Link
                      href={workshopHref(w.id)}
                      className="inline-flex items-center gap-1 rounded-[7px] border border-line-1 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                    >
                      View →
                    </Link>
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
