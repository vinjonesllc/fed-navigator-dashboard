import Link from "next/link";
import { formatWorkshopDate } from "@/lib/format-date";
import type { WorkshopWithStats } from "@/lib/queries";
import type { NextWorkshopCard } from "@/lib/next-workshop";

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

const KELLY_MAILTO = "mailto:kelly@vinjones.com?subject=Next%20Workshop%20Date";

function AccentStrip({ accent }: { accent?: string | null }) {
  if (!accent) return null;
  return (
    <span
      className="absolute left-0 top-0 bottom-0 w-[3px]"
      style={{ background: accent }}
      aria-hidden
    />
  );
}

function NextWorkshop({
  data,
  accent,
  exportHref,
}: {
  data: NextWorkshopCard | null;
  accent?: string | null;
  exportHref?: string;
}) {
  if (!data) {
    return (
      <div className={`relative overflow-hidden p-[18px_20px_20px] ${CARD}`}>
        <AccentStrip accent={accent} />
        <div className="mb-2 text-[12px] uppercase tracking-[0.04em] text-ink-3">
          Next workshop
        </div>
        <p className="text-[14px] text-ink-2">
          No next workshop date.{" "}
          <span className="text-ink-3">
            Contact{" "}
            <a
              href={KELLY_MAILTO}
              className="font-medium text-ink-1 underline underline-offset-2 hover:opacity-80 dark:text-white"
            >
              Kelly
            </a>{" "}
            to schedule your next workshop.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden p-[18px_20px_20px] ${CARD}`}>
      <AccentStrip accent={accent} />
      <div className="mb-3 text-[12px] uppercase tracking-[0.04em] text-ink-3">
        Next workshop
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink-1 dark:text-white">
          {data.dateLabel}
        </div>
        {data.timeLabel && (
          <div className="font-display text-[20px] font-medium leading-none tracking-[-0.01em] text-ink-2">
            {data.timeLabel}
          </div>
        )}
        <div className="ml-auto flex items-baseline gap-2">
          <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-ink-1 dark:text-white">
            {data.registrants ?? "—"}
          </span>
          <span className="text-[12px] uppercase tracking-[0.04em] text-ink-3">
            registered
          </span>
        </div>
      </div>
      {exportHref && (
        <div className="mt-4 flex justify-end border-t border-line-2 pt-3.5">
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-line-1 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
              <path d="M5 21h14" />
            </svg>
            Download registrations
          </a>
        </div>
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

  return (
    <div className="space-y-6">
      <NextWorkshop
        data={nextWorkshop ?? null}
        accent={accent}
        exportHref={registrationsExportHref}
      />

      <div className="grid gap-3.5 sm:grid-cols-3">
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
