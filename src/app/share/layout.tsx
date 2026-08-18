import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { FedNavLogo } from "@/components/fed-nav-logo";

/**
 * Public share chrome. Same navy ground as the signed-in rail, but the rail is
 * identity-only: a logged-out summary has nowhere to navigate, so it carries
 * the brand, a note about what is and isn't shown, and the theme toggle.
 */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="nav-ground hidden flex-col gap-5 border-r border-white/10 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <Link href="/" className="flex items-center gap-2.5">
          <FedNavLogo className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
          <span>
            <span className="block font-display text-[15px] font-semibold whitespace-nowrap text-nav-ink">
              Fed Navigator
            </span>
            <span className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-nav-ink-3">
              Workshop Summary
            </span>
          </span>
        </Link>

        <div className="rounded-[10px] border border-nav-line border-l-[3px] border-l-brand bg-white/[0.06] px-3.5 py-3">
          <b className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-nav-ink">
            Public summary
          </b>
          <span className="text-[12px] text-nav-ink-2">
            A shareable, read-only view of this workshop. Q&amp;A, the attendee directory and
            follow-up lists stay behind sign-in.
          </span>
        </div>

        <div className="mt-auto flex items-center gap-3 border-t border-nav-line pt-4">
          <ThemeToggle />
          <span className="text-[11.5px] text-nav-ink-3">Shared by Fed Navigator</span>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="nav-ground sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 px-4 py-2.5 lg:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <FedNavLogo className="h-[28px] w-[28px] shrink-0 rounded-[8px]" />
            <span className="min-w-0">
              <span className="block font-display text-[14px] font-semibold whitespace-nowrap text-nav-ink">
                Fed Navigator
              </span>
              <span className="block text-[9.5px] uppercase tracking-[0.08em] text-nav-ink-3">
                Workshop Summary
              </span>
            </span>
          </Link>
          <span className="ml-auto">
            <ThemeToggle />
          </span>
        </div>

        <main className="max-w-[1180px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
