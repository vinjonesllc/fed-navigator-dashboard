import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { FedNavLogo } from "@/components/fed-nav-logo";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { ROLE_LABELS, type AppRole } from "@/lib/supabase/types";

export function AppHeader({
  email,
  role,
  nav,
}: {
  email: string;
  role: AppRole;
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
          <FedNavLogo className="h-8 w-8 shadow-[0_4px_14px_oklch(0.20_0.02_260/0.18)]" />
          <div>
            <div className="font-display text-[15px] font-semibold text-ink-1">Fed Navigator</div>
          </div>
        </Link>

        {nav && <nav className="ml-2 flex gap-1.5">{nav}</nav>}

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <ChangePasswordDialog email={email} roleLabel={roleLabel} initials={initials} />
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
