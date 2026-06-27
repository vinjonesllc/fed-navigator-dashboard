import { NextResponse, type NextRequest } from "next/server";
import { requireContentManager } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listSheetTabs } from "@/lib/google-sheets";
import type { Client } from "@/lib/supabase/types";

// Lists the worksheet tabs of a client's evaluations/registrations Google Sheet,
// plus the tab currently configured for registrant enrichment. Used by the
// upload form's "Registrations tab" picker. Content-managers only.
export async function GET(request: NextRequest) {
  await requireContentManager();

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url, next_workshop_registrant_tab")
    .eq("id", clientId)
    .maybeSingle<Pick<Client, "eval_sheet_url" | "next_workshop_registrant_tab">>();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const tabs = await listSheetTabs(client.eval_sheet_url);
  return NextResponse.json(
    { tabs, configured: client.next_workshop_registrant_tab ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
