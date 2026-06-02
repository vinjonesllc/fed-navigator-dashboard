import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadsForm } from "./leads-form";
import type { Workshop } from "@/lib/supabase/types";

export default async function LeadsPage() {
  const session = await requireUser();
  const clientId = session.appUser?.client_id;
  if (!clientId) redirect("/login?error=no-client");

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workshops")
    .select("id, title, workshop_date")
    .eq("client_id", clientId)
    .order("workshop_date", { ascending: false });

  const workshops = (data ?? []) as Pick<Workshop, "id" | "title" | "workshop_date">[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Export attendee leads as CSV. Pick a workshop and a preset.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsForm workshops={workshops} />
        </CardContent>
      </Card>
    </div>
  );
}
