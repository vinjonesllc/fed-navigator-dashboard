import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadForm } from "./upload-form";
import type { Client } from "@/lib/supabase/types";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId: initialClientId } = await searchParams;

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("clients").select("id, name, slug").order("name");
  const clients = (data ?? []) as Pick<Client, "id" | "name" | "slug">[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload workshop</h1>
        <p className="text-sm text-muted-foreground">
          Drop the three Zoom exports (Attendees, Chat, Q&amp;A). We map the fixed 36 columns,
          detect custom registration questions, store the transcripts, and run intent
          extraction.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New workshop</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm clients={clients} initialClientId={initialClientId} />
        </CardContent>
      </Card>
    </div>
  );
}
