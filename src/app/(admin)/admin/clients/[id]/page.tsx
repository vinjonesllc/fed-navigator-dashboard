import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isContentManager, requireConsoleAccess, userCanAccessClient } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Client } from "@/lib/supabase/types";
import { getClientWorkshops } from "@/lib/queries";
import { listSheetTabs } from "@/lib/google-sheets";
import { getNextWorkshop } from "@/lib/next-workshop";
import { ClientOverview } from "@/components/client-overview";
import { EditClientForm } from "./edit-client-form";
import { LogoUpload } from "./logo-upload";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireConsoleAccess();
  if (!userCanAccessClient(session, id)) redirect("/admin/clients?error=forbidden");

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle<Client>();

  if (!client) notFound();

  const workshops = await getClientWorkshops(id);
  const [sheetTabs, nextWorkshop] = await Promise.all([
    listSheetTabs(client.eval_sheet_url),
    getNextWorkshop(client),
  ]);
  const manager = isContentManager(session.appUser?.role);
  const role = session.appUser?.role;
  const isAdvisor = role === "advisor" || role === "client";

  return (
    <div className="space-y-6">
      {!isAdvisor && (
        <div className="flex items-center gap-2.5 text-[12.5px] text-ink-3">
          <Link href="/admin/clients" className="hover:text-ink-1">
            ← {manager ? "Clients" : "My clients"}
          </Link>
          <span className="text-ink-4">/</span>
          <span className="text-ink-2 dark:text-white">{client.name}</span>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-2 pb-5">
        <div>
          <h1 className="m-0 font-display text-[32px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
            {client.name}
          </h1>
          <p className="mt-1.5 font-mono text-[12.5px] text-ink-4">{client.slug}</p>
          {client.accent_color && (
            <div
              className="mt-2.5 h-1 w-14 rounded-full"
              style={{ background: client.accent_color }}
              aria-hidden
            />
          )}
        </div>
        {manager && (
          <Button
            asChild
            className="rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] text-white hover:bg-[oklch(0.12_0.02_260)]"
          >
            <Link href={`/admin/upload?clientId=${client.id}`}>+ New workshop</Link>
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {manager && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ClientOverview
            workshops={workshops}
            workshopHref={(wid) => `/admin/clients/${id}/workshops/${wid}`}
            editHref={manager ? (wid) => `/admin/clients/${id}/workshops/${wid}/edit` : undefined}
            nextWorkshop={nextWorkshop}
            accentColor={client.accent_color}
          />
        </TabsContent>

        {manager && (
          <TabsContent value="settings" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <EditClientForm client={client} sheetTabs={sheetTabs} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Logo</CardTitle>
                </CardHeader>
                <CardContent>
                  <LogoUpload client={client} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
