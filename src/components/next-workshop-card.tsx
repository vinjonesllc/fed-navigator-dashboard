import type { NextWorkshopCard } from "@/lib/next-workshop";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";

const KELLY_MAILTO = "mailto:kelly@vinjones.com?subject=Next%20Workshop%20Date";

export function AccentStrip({ accent }: { accent?: string | null }) {
  if (!accent) return null;
  return (
    <span
      className="absolute left-0 top-0 bottom-0 w-[3px]"
      style={{ background: accent }}
      aria-hidden
    />
  );
}

/** One workshop, stacked vertically: date → time → # registered → download. */
function WorkshopTile({
  item,
  exportHref,
}: {
  item: NextWorkshopCard;
  exportHref?: string;
}) {
  return (
    <div className="flex flex-col rounded-[12px] border border-line-1 bg-gradient-to-b from-surface to-background p-4">
      <div className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink-1 dark:text-white">
        {item.dateLabel}
      </div>
      <div className="mt-1 min-h-[20px] text-[15px] font-medium text-ink-2">
        {item.timeLabel ?? ""}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[26px] font-semibold leading-none tabular-nums text-ink-1 dark:text-white">
          {item.registrants ?? "—"}
        </span>
        <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">registered</span>
      </div>
      {exportHref && (
        <a
          href={exportHref}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-[7px] border border-line-1 bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path d="M5 21h14" />
          </svg>
          Download registrations
        </a>
      )}
    </div>
  );
}

/**
 * Next Workshop card. Shared by the advisor overview and the public share page.
 * Renders one stacked tile per upcoming workshop. Pass `exportHrefFor` to show
 * each tile's "Download registrations" button (advisor only); omit it on the
 * public page. When nothing is scheduled, renders a bold "contact Kelly" state.
 */
export function NextWorkshop({
  items,
  accent,
  exportHrefFor,
}: {
  items: NextWorkshopCard[];
  accent?: string | null;
  exportHrefFor?: (index: number) => string;
}) {
  if (items.length === 0) {
    return (
      <div className={`relative overflow-hidden p-[18px_20px_20px] ${CARD}`}>
        <AccentStrip accent={accent} />
        <div className="mb-2 text-[12px] uppercase tracking-[0.04em] text-ink-3">
          Next workshop
        </div>
        <p className="font-display text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink-1 dark:text-white">
          No next workshop scheduled yet.
        </p>
        <p className="mt-2 text-[15px] font-medium text-ink-2">
          Contact{" "}
          <a
            href={KELLY_MAILTO}
            className="font-bold text-ink-1 underline underline-offset-2 hover:opacity-80 dark:text-white"
          >
            Kelly
          </a>{" "}
          to schedule your next workshop.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden p-[18px_20px_20px] ${CARD}`}>
      <AccentStrip accent={accent} />
      <div className="mb-3 text-[12px] uppercase tracking-[0.04em] text-ink-3">
        {items.length === 1 ? "Next workshop" : "Next workshops"}
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <WorkshopTile
            key={item.index}
            item={item}
            exportHref={
              exportHrefFor && item.hasTab ? exportHrefFor(item.index) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
