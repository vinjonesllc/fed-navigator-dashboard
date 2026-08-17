"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarDays,
  LayoutDashboard,
  Menu,
  Settings,
  Upload,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { FedNavLogo } from "@/components/fed-nav-logo";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { ROLE_LABELS, type AppRole } from "@/lib/supabase/types";

/**
 * Icons are looked up by key rather than passed in: the layouts are Server
 * Components and cannot hand a component across the boundary.
 */
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  workshops: CalendarDays,
  leads: Users,
  guide: BookOpen,
  settings: Settings,
  advisors: Users,
  team: UsersRound,
  upload: Upload,
  agencies: Building2,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

/**
 * App chrome: a dark navigation rail beside the content on wide screens, an
 * off-canvas drawer behind a top bar below 1024px. The rail carries the brand,
 * the section nav, and the signed-in identity.
 *
 * The rail and top bar sit on `.nav-ground`, which re-declares the surface and
 * ink tokens for its subtree — so nested components (the theme toggle, the
 * identity chip, buttons) invert onto the dark ground without needing their own
 * variants. See globals.css.
 */
export function AppShell({
  email,
  role,
  nav,
  children,
}: {
  email: string;
  role: AppRole;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Navigating inside the drawer should close it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const roleLabel = ROLE_LABELS[role] ?? role;
  const initials = email
    .split("@")[0]
    .split(/[._-]+/)
    .map((p) => p[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // The section roots ("/dashboard", "/admin/clients") would match every child
  // route under startsWith, so they compare exactly; deeper items keep prefix
  // matching so a workshop detail page still highlights "Workshops".
  const isActive = (href: string) =>
    href === "/dashboard" || href === "/admin/clients"
      ? pathname === href || (href === "/admin/clients" && pathname.startsWith("/admin/clients"))
      : pathname.startsWith(href);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside
        id="app-rail"
        aria-label="Primary"
        className={`nav-ground fixed inset-y-0 left-0 z-50 flex w-[min(300px,84vw)] flex-col gap-5 border-r border-white/10 p-4 transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 motion-reduce:transition-none ${
          open ? "translate-x-0 shadow-[0_0_60px_oklch(0.17_0.02_250/0.35)]" : "-translate-x-[101%] lg:shadow-none"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <FedNavLogo className="h-[34px] w-[34px] rounded-[9px]" />
          <span className="font-display text-[15px] font-semibold whitespace-nowrap text-nav-ink">
            Fed Navigator
          </span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {nav.map((item) => {
            const Icon = ICONS[item.icon] ?? LayoutDashboard;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] whitespace-nowrap transition-colors ${
                  active
                    ? "bg-white/[0.13] font-semibold text-nav-ink shadow-[inset_3px_0_0_var(--brand)]"
                    : "text-nav-ink-3 hover:bg-white/[0.09] hover:text-nav-ink"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-nav-line pt-4">
          <ChangePasswordDialog email={email} roleLabel={roleLabel} initials={initials} />
          <div className="flex gap-2">
            <ThemeToggle />
            <form action="/auth/sign-out" method="post" className="flex-1">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-full rounded-[9px] border-nav-line bg-white/[0.07] text-nav-ink-2 hover:bg-white/[0.15] hover:text-nav-ink"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Scrim — drawer only, never on the wide layout */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-[oklch(0.17_0.02_250/0.45)] transition-opacity duration-200 lg:hidden motion-reduce:transition-none ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div className="min-w-0">
        <div className="nav-ground sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="app-rail"
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-nav-line bg-white/[0.07] text-nav-ink-2 transition-colors hover:bg-white/[0.15] hover:text-nav-ink"
          >
            <Menu className="h-[17px] w-[17px]" aria-hidden />
          </button>
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <FedNavLogo className="h-[26px] w-[26px] shrink-0 rounded-[7px]" />
            <span className="font-display text-[14px] font-semibold whitespace-nowrap text-nav-ink">
              Fed Navigator
            </span>
          </Link>
        </div>

        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
