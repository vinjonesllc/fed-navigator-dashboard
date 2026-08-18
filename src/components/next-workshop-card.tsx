import type { NextWorkshopCard } from "@/lib/next-workshop";

const CARD =
  "relative overflow-hidden rounded-[12px] border border-line-1 bg-surface shadow-[var(--shadow)]";

const KELLY_MAILTO = "mailto:kelly@vinjones.com?subject=Next%20Workshop%20Date";

export function AccentStrip() {
  return <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" />;
}

/** One workshop, stacked vertically: date → time → # registered → download. */
function WorkshopTile({ item, exportHref }: { item: NextWorkshopCard; exportHref?: string }) {
  return (
    <div className="rounded-[10px] border border-line-1 bg-bg-2 p-3.5">
      <div className="font-display text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink-1">
        {item.dateLabel}
      </div>
      <div className="mt-0.5 min-h-[20px] text-[14px] font-medium text-ink-2">
        {item.timeLabel ?? ""}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[24px] font-semibold leading-none tabular-nums text-ink-1">
          {item.registrants ?? "—"}
        </span>
        <span className="text-[11px] uppercase tracking-[0.04em] text-ink-3">registered</span>
      </div>
      {exportHref && (
        <a
          href={exportHref}
          className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-line-1 bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink-1"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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
 *
 * `variant="rail"` stacks the tiles in a single column for the 330px agenda
 * rail on the Overview; `"wide"` (the default) keeps the responsive grid the
 * full-width public share page needs. The rail can't use the responsive grid
 * because those breakpoints watch the viewport, not the 330px container.
 */
export function NextWorkshop({
  items,
  exportHrefFor,
  variant = "wide",
}: {
  items: NextWorkshopCard[];
  exportHrefFor?: (index: number) => string;
  variant?: "rail" | "wide";
}) {
  if (items.length === 0) {
    return (
      <div className={`${CARD} px-5 pt-[18px] pb-5`}>
        <AccentStrip />
        <div className="mb-2 text-[12px] uppercase tracking-[0.04em] text-ink-3">Next workshop</div>
        <p className="font-display text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink-1">
          No next workshop scheduled yet.
        </p>
        <p className="mt-2 text-[14.5px] font-medium text-ink-2">
          Contact{" "}
          <a
            href={KELLY_MAILTO}
            className="font-bold text-ink-1 underline underline-offset-2 hover:opacity-80"
          >
            Kelly
          </a>{" "}
          to schedule your next workshop.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} px-[18px] pt-4 pb-[18px]`}>
      <AccentStrip />
      <div className="mb-4 text-[12px] uppercase tracking-[0.04em] text-ink-3">
        {items.length === 1 ? "Next workshop" : "Next workshops"}
      </div>
      <div
        className={
          variant === "rail" ? "grid gap-3" : "grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {items.map((item) => (
          <WorkshopTile
            key={item.index}
            item={item}
            exportHref={exportHrefFor && item.hasTab ? exportHrefFor(item.index) : undefined}
          />
        ))}
      </div>
      <p className="mt-3.5 text-[11.5px] text-ink-3">
        Soonest first. Past dates drop off automatically.
      </p>
    </div>
  );
}
