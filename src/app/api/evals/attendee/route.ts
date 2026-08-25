import { NextResponse, type NextRequest } from "next/server";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAttendeeEval } from "@/lib/eval-comments";
import { hasEvaluations } from "@/lib/workshop-type";
import type { Workshop } from "@/lib/supabase/types";

// Returns one attendee's evaluation response (if any), matched against the eval
// sheet by email/name within the workshop_date → +7-day window. Called on-demand
// when the attendee detail modal opens.
export async function GET(request: NextRequest) {
  const session = await requireUser();
  const sp = request.nextUrl.searchParams;
  const workshopId = sp.get("workshopId");
  const email = sp.get("email");
  const name = sp.get("name");
  if (!workshopId) {
    return NextResponse.json({ error: "workshopId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  // `*` because `workshop_type` doesn't exist until migration 0032 is applied.
  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("id", workshopId)
    .maybeSingle<Workshop>();

  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  if (!userCanAccessClient(session, workshop.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // L&Ls have no evaluation — the modal already skips the call, this is the guard.
  // `configured: true` so the caller says "none found" rather than blaming a
  // missing sheet, which isn't the reason here.
  if (!hasEvaluations(workshop)) {
    return NextResponse.json({ configured: true, found: false });
  }

  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url")
    .eq("id", workshop.client_id)
    .maybeSingle<{ eval_sheet_url: string | null }>();

  const url = client?.eval_sheet_url?.trim();
  if (!url) {
    // No eval sheet configured — treat as simply "no evaluation".
    return NextResponse.json({ found: false, configured: false });
  }

  const result = await getAttendeeEval(url, workshop.workshop_date, email, name);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ configured: true, ...result });
}
