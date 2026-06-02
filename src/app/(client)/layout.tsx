import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppHeader } from "@/components/app-header";
import type { Client } from "@/lib/supabase/types";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/workshops", label: "Workshops" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  if (!session.appUser) redirect("/login?error=no-client");
  if (session.appUser.role === "admin" && !session.appUser.client_id) {
    redirect("/admin/clients");
  }
  const clientId = session.appUser.client_id;
  if (!clientId) redirect("/login?error=no-client");

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle<Client>();

  if (!client) redirect("/login?error=no-client");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        email={session.email}
        role={session.appUser.role}
        client={client}
        nav={
          <nav className="hidden gap-1 md:flex">
            {NAV.map((item) => (
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
