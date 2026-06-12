import { NextResponse, type NextRequest } from "next/server";
import { requireContentManager, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { placeCallForTarget } from "@/lib/place-call";
import type { CallCampaign, CallTarget } from "@/lib/supabase/types";

/** Place a single outbound Part 2 call for a target — the manual "Call" button.
 *  (The cron dispatcher calls placeCallForTarget directly.) */
export async function POST(request: NextRequest) {
  const session = await requireContentManager();
  const { targetId } = (await request.json().catch(() => ({}))) as { targetId?: string };
  if (!targetId) {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }

  // Authorize against the target's client before dialing.
  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("call_targets")
    .select("campaign_id")
    .eq("id", targetId)
    .maybeSingle<Pick<CallTarget, "campaign_id">>();
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const { data: campaign } = await admin
    .from("call_campaigns")
    .select("client_id")
    .eq("id", target.campaign_id)
    .maybeSingle<Pick<CallCampaign, "client_id">>();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!userCanAccessClient(session, campaign.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const r = await placeCallForTarget(targetId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, callId: r.callId });
}
