import { requireConsoleAccess, isAdmin, isContentManager } from "@/lib/auth";
import { AppShell, type NavItem } from "@/components/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireConsoleAccess();
  const role = session.appUser?.role ?? "advisor";
  const adminUser = isAdmin(role);
  const manager = isContentManager(role);

  const nav: NavItem[] = [{ href: "/admin/clients", label: "Advisors", icon: "advisors" }];
  if (adminUser) nav.push({ href: "/admin/team", label: "Team", icon: "team" });
  if (manager) {
    nav.push({ href: "/admin/upload", label: "Upload", icon: "upload" });
    nav.push({ href: "/admin/agency-lookup", label: "Agencies", icon: "agencies" });
  }
  nav.push({ href: "/admin/guide", label: "Guide", icon: "guide" });

  return (
    <AppShell email={session.email} role={role} nav={nav} renderedAt={new Date().toISOString()}>
      {children}
    </AppShell>
  );
}
