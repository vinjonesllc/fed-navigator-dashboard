import Link from "next/link";
import { requireConsoleAccess, isAdmin, isContentManager } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireConsoleAccess();
  const role = session.appUser?.role ?? "advisor";
  const adminUser = isAdmin(role);
  const manager = isContentManager(role);

  const nav: { href: string; label: string }[] = [{ href: "/admin/clients", label: "Clients" }];
  if (adminUser) nav.push({ href: "/admin/team", label: "Team" });
  if (manager) {
    nav.push({ href: "/admin/upload", label: "Upload" });
    nav.push({ href: "/admin/agency-lookup", label: "Agencies" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        email={session.email}
        role={role}
        nav={
          <nav className="hidden gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-[13px] text-ink-3 hover:bg-bg-2 hover:text-ink-1"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        }
      />
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-6 py-7 sm:px-8">{children}</main>
    </div>
  );
}
