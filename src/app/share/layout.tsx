import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-10 border-b border-line-2 backdrop-blur-md bg-gradient-to-b from-surface/85 to-surface/55">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-8 py-3.5">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-gradient-to-br from-[oklch(0.22_0.02_260)] to-[oklch(0.14_0.015_260)] font-display text-[12px] font-bold tracking-[0.04em] text-lime shadow-[0_1px_0_oklch(1_0_0_/_0.6)_inset,0_4px_14px_oklch(0.20_0.02_260/0.18)]">
              FP
            </div>
            <div>
              <div className="font-display text-[15px] font-semibold text-ink-1 dark:text-white">
                Fed Pilot
              </div>
              <div className="mt-px text-[10px] uppercase tracking-[0.08em] text-ink-4">
                Workshop Summary
              </div>
            </div>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-6 py-7 sm:px-8">{children}</main>
    </div>
  );
}
