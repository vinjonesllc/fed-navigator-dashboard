import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { placeOutboundCall } from "@/lib/vapi";
import { buildPart2Assistant } from "@/lib/part2-agent";
import { toE164 } from "@/lib/phone";
import {
  formatNextWorkshopDateOrdinal,
  formatNextWorkshopTime,
  isFutureWorkshopDate,
} from "@/lib/next-workshop";
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
  const phone = toE164(target.phone);
  if (!phone) {
    // Unusable number (too short/long/foreign) — mark it skipped so it leaves the
    // dialable queue and is never attempted again.
    await admin
      .from("call_targets")
      .update({
        status: "skipped",
        outcome_notes: `Unusable phone number: ${target.phone ?? "none"}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);
    return { ok: false, error: `Skipped — unusable phone number (${target.phone ?? "none"})` };
  }

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
    .select("next_workshop_tz, next_workshop_date, next_workshop_hour, next_workshop_reg_url")
    .eq("id", campaign.client_id)
    .maybeSingle<{
      next_workshop_tz: string | null;
      next_workshop_date: string | null;
      next_workshop_hour: number | null;
      next_workshop_reg_url: string | null;
    }>();
  const timezone = clientRow?.next_workshop_tz ?? "Eastern";

  // Next public workshop — only surfaced if the caller specifically asks. Needs a
  // future date AND a registration URL to be offerable.
  let nextWorkshop: { whenLabel: string; regUrl: string } | null = null;
  const regUrl = (clientRow?.next_workshop_reg_url ?? "").trim();
  if (regUrl && isFutureWorkshopDate(clientRow?.next_workshop_date)) {
    const datePart = formatNextWorkshopDateOrdinal(clientRow!.next_workshop_date as string);
    const timePart = formatNextWorkshopTime(clientRow?.next_workshop_hour ?? null, clientRow?.next_workshop_tz ?? null);
    nextWorkshop = { whenLabel: timePart ? `${datePart} at ${timePart}` : datePart, regUrl };
  }

  const assistant = buildPart2Assistant({
    attendeeName: target.full_name ?? "there",
    agency: target.agency,
    workshopTitle,
    workshopDate,
    advisorName,
    timezone,
    nextWorkshop,
  });

  let callId: string;
  try {
    const call = await placeOutboundCall({
      customerNumber: phone,
      assistant,
      metadata: {
        targetId: target.id,
        campaignId: campaign.id,
        clientId: campaign.client_id,
        timezone,
        ...(nextWorkshop ? { nextWorkshopRegUrl: nextWorkshop.regUrl } : {}),
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
