import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROLE_LABELS, type AppRole, type Client } from "@/lib/supabase/types";

export function AppHeader({
  email,
  role,
  client,
  nav,
}: {
  email: string;
  role: AppRole;
  client?: Pick<Client, "name" | "logo_url"> | null;
  nav?: React.ReactNode;
}) {
  const roleLabel = ROLE_LABELS[role] ?? role;
  const initials = email
    .split("@")[0]
    .split(/[._-]+/)
    .map((p) => p[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="relative z-10 border-b border-line-2 backdrop-blur-md bg-gradient-to-b from-surface/85 to-surface/55">
      <div className="mx-auto flex max-w-[1360px] items-center gap-8 px-8 py-3.5">
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
            <div className="font-display text-[15px] font-semibold text-ink-1">Fed Navigator</div>
          </div>
        </Link>

        {client && (
          <>
            <span className="text-ink-4">/</span>
            <div className="flex items-center gap-2">
              {client.logo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={client.logo_url}
                  alt={client.name}
                  className="h-7 w-7 rounded object-contain"
                />
              )}
              <span className="font-display text-sm font-medium text-ink-1">{client.name}</span>
            </div>
          </>
        )}

        {nav && <nav className="ml-2 flex gap-1.5">{nav}</nav>}

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden items-center gap-2.5 rounded-full border border-line-1 bg-surface py-1 pl-1.5 pr-3 sm:flex">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-gradient-to-br from-[oklch(0.55_0.18_142)] to-[oklch(0.50_0.14_230)] font-display text-[11px] font-bold text-white">
              {initials || "?"}
            </span>
            <span className="text-[12.5px] text-ink-2">{email}</span>
            <span className="rounded border border-lime-bord bg-lime-soft px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-lime">
              {roleLabel}
            </span>
          </div>
          <form action="/auth/sign-out" method="post">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
            >
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
