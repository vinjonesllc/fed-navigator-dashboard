import { NextResponse, type NextRequest } from "next/server";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTabCsvForExport } from "@/lib/google-sheets";
import type { Client } from "@/lib/supabase/types";

// Downloads the full registration sheet (all columns + rows) for a client's
// upcoming workshop, pulled live from the configured tab of their eval Google
// Sheet. Served as CSV (opens directly in Excel).
export async function GET(request: NextRequest) {
  const session = await requireUser();
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  if (!userCanAccessClient(session, clientId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("name, eval_sheet_url, next_workshop_date, next_workshop_registrant_tab")
    .eq("id", clientId)
    .maybeSingle<
      Pick<
        Client,
        "name" | "eval_sheet_url" | "next_workshop_date" | "next_workshop_registrant_tab"
      >
    >();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  // The tab comes from the saved client config, never from the query string.
  if (!client.eval_sheet_url || !client.next_workshop_registrant_tab) {
    return NextResponse.json(
      { error: "No registration sheet is configured for this client." },
      { status: 404 },
    );
  }

  const csv = await fetchTabCsvForExport(
    client.eval_sheet_url,
    client.next_workshop_registrant_tab,
  );
  if (csv === null) {
    return NextResponse.json(
      { error: "Could not read the registration sheet. Check that it's shared as link-viewable." },
      { status: 502 },
    );
  }

  const safeName = (client.name || "client").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const dateTag = client.next_workshop_date ?? "upcoming";
  const filename = `registrations_${safeName}_${dateTag}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
