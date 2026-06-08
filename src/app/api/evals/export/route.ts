import { NextResponse, type NextRequest } from "next/server";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEvalExportCsv } from "@/lib/eval-comments";
import type { Workshop } from "@/lib/supabase/types";

// Downloads all evaluation responses for a workshop — every row in the eval
// sheet within the workshop_date → +7-day window, all columns. CSV (Excel).
export async function GET(request: NextRequest) {
  const session = await requireUser();
  const workshopId = request.nextUrl.searchParams.get("workshopId");
  if (!workshopId) {
    return NextResponse.json({ error: "workshopId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: workshop } = await admin
    .from("workshops")
    .select("id, client_id, title, workshop_date")
    .eq("id", workshopId)
    .maybeSingle<Pick<Workshop, "id" | "client_id" | "title" | "workshop_date">>();

  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  if (!userCanAccessClient(session, workshop.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url")
    .eq("id", workshop.client_id)
    .maybeSingle<{ eval_sheet_url: string | null }>();

  const url = client?.eval_sheet_url?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "No evaluations sheet is configured for this client." },
      { status: 404 },
    );
  }

  const result = await getEvalExportCsv(url, workshop.workshop_date);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const safeTitle = (workshop.title || "workshop").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const filename = `evaluations_${safeTitle}_${workshop.workshop_date}.csv`;

  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
