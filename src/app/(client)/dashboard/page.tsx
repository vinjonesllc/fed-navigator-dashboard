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
    .select("eval_sheet_url, next_workshops")
    .eq("id", clientId)
    .maybeSingle();

  const [workshops, nextWorkshops] = await Promise.all([
    getClientWorkshops(clientId),
    client ? getNextWorkshops(client) : Promise.resolve([]),
  ]);

  return (
    <div>
      <header className="border-b border-line-1 pb-5">
        <h1 className="font-display text-[clamp(24px,4.5vw,30px)] font-semibold tracking-[-0.025em] text-ink-1">
          Overview
        </h1>
        <p className="mt-1 text-[14px] text-ink-3">All-time totals across your workshops.</p>
      </header>
      <div className="mt-6">
        <ClientOverview
          workshops={workshops}
          workshopHref={(id) => `/dashboard/workshops/${id}`}
          nextWorkshops={nextWorkshops}
          registrationsExportFor={
            client?.eval_sheet_url
              ? (w) => `/api/registrations/export?clientId=${clientId}&w=${w}`
              : undefined
          }
          registrationsListFor={
            client?.eval_sheet_url
              ? (w) => `/api/registrations/list?clientId=${clientId}&w=${w}`
              : undefined
          }
        />
      </div>
    </div>
  );
}
