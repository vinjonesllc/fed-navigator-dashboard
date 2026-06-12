import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { placeOutboundCall } from "@/lib/vapi";
import { buildPart2Assistant } from "@/lib/part2-agent";
import type { CallCampaign, CallTarget, Workshop } from "@/lib/supabase/types";

/**
 * Place one outbound Part 2 call for a target. Shared by the manual "Call"
 * button (/api/calls/start) and the cron dispatcher. Loads the target's
 * campaign/workshop/client context, builds the agent (with the client's
 * timezone), dials via Vapi, and marks the target "calling".
 */
export async function placeCallForTarget(
  targetId: string,
): Promise<{ ok: boolean; callId?: string; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: target } = await admin
    .from("call_targets")
    .select("*")
    .eq("id", targetId)
    .maybeSingle<CallTarget>();
  if (!target) return { ok: false, error: "Target not found" };
  if (!target.phone) return { ok: false, error: "Target has no phone number" };

  const { data: campaign } = await admin
    .from("call_campaigns")
    .select("*")
    .eq("id", target.campaign_id)
    .maybeSingle<CallCampaign>();
  if (!campaign) return { ok: false, error: "Campaign not found" };

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

  const { data: clientRow } = await admin
    .from("clients")
    .select("next_workshop_tz")
    .eq("id", campaign.client_id)
    .maybeSingle<{ next_workshop_tz: string | null }>();
  const timezone = clientRow?.next_workshop_tz ?? "Eastern";

  const assistant = buildPart2Assistant({
    attendeeName: target.full_name ?? "there",
    agency: target.agency,
    workshopTitle,
    workshopDate,
    advisorName,
    timezone,
  });

  let callId: string;
  try {
    const call = await placeOutboundCall({
      customerNumber: target.phone,
      assistant,
      metadata: {
        targetId: target.id,
        campaignId: campaign.id,
        clientId: campaign.client_id,
        timezone,
      },
    });
    callId = call.id;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to place call" };
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

  return { ok: true, callId };
}
