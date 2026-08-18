import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppShell, type NavItem } from "@/components/app-shell";
import type { Client } from "@/lib/supabase/types";

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "overview" },
  { href: "/dashboard/workshops", label: "Workshops", icon: "workshops" },
  { href: "/dashboard/leads", label: "Leads", icon: "leads" },
  { href: "/dashboard/guide", label: "Guide", icon: "guide" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  if (!session.appUser) redirect("/login?error=no-client");
  if (session.appUser.role === "admin" && !session.appUser.client_id) {
    redirect("/admin/clients");
  }
  const clientId = session.appUser.client_id;
  if (!clientId) redirect("/login?error=no-client");

  // Authorization guard only — the shell is Fed Navigator branded, so the row
  // itself is never rendered. A user whose client_id points at nothing is out.
  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle<Pick<Client, "id">>();

  if (!client) redirect("/login?error=no-client");

  return (
    <AppShell
      email={session.email}
      role={session.appUser.role}
      nav={NAV}
      renderedAt={new Date().toISOString()}
    >
      {children}
    </AppShell>
  );
}
