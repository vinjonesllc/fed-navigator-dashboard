"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Small "?" link rendered after a section title. Opens a uniform popup that
 * explains the section in three consistent blocks: what it is, what to click,
 * and how to use it to book more appointments.
 */
export function SectionHelp({
  title,
  whatItIs,
  whatToClick,
  booking,
}: {
  title: string;
  whatItIs: string;
  whatToClick: string;
  booking: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`About “${title}”`}
          title={`About “${title}”`}
          className="inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center self-center rounded-full border border-line-1 text-[10.5px] font-bold leading-none text-ink-3 transition hover:border-ink-3 hover:bg-bg-2 hover:text-ink-1"
        >
          ?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            How to read and use the {title} section
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <HelpBlock label="What it is" body={whatItIs} />
          <HelpBlock label="What to click — and what you'll see" body={whatToClick} />
          <HelpBlock label="Use it to book more appointments" body={booking} accent />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpBlock({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div
      className={
        accent
          ? "rounded-r-[8px] border-l-[3px] border-brand bg-bg-2 px-3.5 py-2.5"
          : "px-0.5"
      }
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
        {label}
      </div>
      <p className="text-[13.5px] leading-[1.55] text-ink-2">{body}</p>
    </div>
  );
}
