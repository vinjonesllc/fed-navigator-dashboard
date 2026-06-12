import { NextResponse, type NextRequest } from "next/server";
import { requireContentManager, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { placeOutboundCall } from "@/lib/vapi";
import { buildPart2Assistant } from "@/lib/part2-agent";
import type { CallCampaign, CallTarget, Workshop } from "@/lib/supabase/types";

/** Place a single outbound Part 2 booking call for a call_target. The campaign
 *  runner (Phase 3) will call this per target with retry scheduling; for now it
 *  can be invoked directly to dial one person. */
export async function POST(request: NextRequest) {
  const session = await requireContentManager();
  const { targetId } = (await request.json().catch(() => ({}))) as { targetId?: string };
  if (!targetId) {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("call_targets")
    .select("*")
    .eq("id", targetId)
    .maybeSingle<CallTarget>();
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const { data: campaign } = await admin
    .from("call_campaigns")
    .select("*")
    .eq("id", target.campaign_id)
    .maybeSingle<CallCampaign>();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!userCanAccessClient(session, campaign.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!target.phone) {
    return NextResponse.json({ error: "Target has no phone number" }, { status: 400 });
  }

  let workshopTitle = "your Fed Pilot workshop";
  let workshopDate: string | null = null;
  if (campaign.workshop_id) {
    const { data: ws } = await admin
      .from("workshops")
      .select("*")
      .eq("id", campaign.workshop_id)
      .maybeSingle<Workshop>();
    if (ws) {
      workshopTitle = ws.title;
      workshopDate = ws.workshop_date;
    }
  }
  const cfg = campaign.calendar_config as { advisor_name?: string };
  const advisorName = cfg.advisor_name ?? "your Fed Pilot advisor";

  const assistant = buildPart2Assistant({
    attendeeName: target.full_name ?? "there",
    agency: target.agency,
    workshopTitle,
    workshopDate,
    advisorName,
  });

  let callId: string;
  try {
    const call = await placeOutboundCall({
      customerNumber: target.phone,
      assistant,
      metadata: { targetId: target.id, campaignId: campaign.id },
    });
    callId = call.id;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to place call" },
      { status: 502 },
    );
  }

  await admin
    .from("call_targets")
    .update({
      status: "calling",
      provider_call_id: callId,
      attempts: target.attempts + 1,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);

  return NextResponse.json({ ok: true, callId });
}
