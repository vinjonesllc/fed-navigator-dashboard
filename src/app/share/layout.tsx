import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { FedNavLogo } from "@/components/fed-nav-logo";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-10 border-b border-line-2 backdrop-blur-md bg-gradient-to-b from-surface/85 to-surface/55">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-8 py-3.5">
          <Link href="/" className="flex items-center gap-3">
            <FedNavLogo className="h-8 w-8 shadow-[0_4px_14px_oklch(0.20_0.02_260/0.18)]" />
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
