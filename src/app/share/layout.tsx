import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-10 border-b border-line-2 backdrop-blur-md bg-gradient-to-b from-surface/85 to-surface/55">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-8 py-3.5">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-gradient-to-br from-[oklch(0.22_0.02_260)] to-[oklch(0.14_0.015_260)] text-lime shadow-[0_1px_0_oklch(1_0_0_/_0.6)_inset,0_4px_14px_oklch(0.20_0.02_260/0.18)]">
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] drop-shadow-[0_0_5px_oklch(0.86_0.21_130/0.55)]"
                fill="currentColor"
                aria-hidden="true"
              >
                {/* 4-point navigation star */}
                <path d="M12 1.5c.55 5.4 2.1 6.95 9 10.5-6.9 3.55-8.45 5.1-9 10.5-.55-5.4-2.1-6.95-9-10.5 6.9-3.55 8.45-5.1 9-10.5Z" />
              </svg>
            </div>
            <div>
              <div className="font-display text-[15px] font-semibold text-ink-1 dark:text-white">
                Fed Navigator
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
