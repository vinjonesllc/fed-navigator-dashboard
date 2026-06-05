import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireContentManager, userCanAccessClient } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Client, Workshop } from "@/lib/supabase/types";
import { WorkshopEditForm } from "./workshop-edit-form";

export default async function EditWorkshopPage({
  params,
}: {
  params: Promise<{ id: string; wid: string }>;
}) {
  const { id, wid } = await params;
  const session = await requireContentManager();
  if (!userCanAccessClient(session, id)) redirect("/admin/clients?error=forbidden");

  const admin = createSupabaseAdminClient();
  const [{ data: client }, { data: workshop }] = await Promise.all([
    admin.from("clients").select("*").eq("id", id).maybeSingle<Client>(),
    admin
      .from("workshops")
      .select("*")
      .eq("id", wid)
      .eq("client_id", id)
      .maybeSingle<Workshop>(),
  ]);

  if (!client || !workshop) notFound();

  const backHref = `/admin/clients/${id}/workshops/${wid}`;

  return (
    <div className="space-y-6">
      <div className="text-[12.5px] text-ink-3">
        <Link href={backHref} className="hover:text-ink-1">
          ← Back to workshop
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit workshop</h1>
        <p className="text-sm text-muted-foreground">
          Update the title, date, presenter, and other details. Uploaded files and the
          advisor stay as-is.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workshop details</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkshopEditForm workshop={workshop} clientName={client.name} backHref={backHref} />
        </CardContent>
      </Card>
    </div>
  );
}
