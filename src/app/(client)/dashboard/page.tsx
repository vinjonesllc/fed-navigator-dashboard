import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientWorkshops } from "@/lib/queries";
import { getNextWorkshops } from "@/lib/next-workshop";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClientOverview } from "@/components/client-overview";

export default async function OverviewPage() {
  const session = await requireUser();
  const clientId = session.appUser?.client_id;
  if (!clientId) redirect("/login?error=no-client");

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("accent_color, eval_sheet_url, next_workshops")
    .eq("id", clientId)
    .maybeSingle();

  const [workshops, nextWorkshops] = await Promise.all([
    getClientWorkshops(clientId),
    client ? getNextWorkshops(client) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">All-time totals across your workshops.</p>
      </div>
      <ClientOverview
        workshops={workshops}
        workshopHref={(id) => `/dashboard/workshops/${id}`}
        nextWorkshops={nextWorkshops}
        registrationsExportFor={
          client?.eval_sheet_url
            ? (w) => `/api/registrations/export?clientId=${clientId}&w=${w}`
            : undefined
        }
        accentColor={client?.accent_color ?? null}
      />
    </div>
  );
}
