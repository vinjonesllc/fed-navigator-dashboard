import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientWorkshops } from "@/lib/queries";
import { ClientOverview } from "@/components/client-overview";

export default async function OverviewPage() {
  const session = await requireUser();
  const clientId = session.appUser?.client_id;
  if (!clientId) redirect("/login?error=no-client");

  const workshops = await getClientWorkshops(clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">All-time totals across your workshops.</p>
      </div>
      <ClientOverview workshops={workshops} workshopHref={(id) => `/dashboard/workshops/${id}`} />
    </div>
  );
}
