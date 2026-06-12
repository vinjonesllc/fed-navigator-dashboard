"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireContentManager, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCallList } from "@/lib/part2";
import { bestHoursForClient, firstAttemptAt } from "@/lib/call-scheduling";
import { enrollContactsInAutomation } from "@/lib/activecampaign";
import type { Attendee, CallCampaign, Workshop } from "@/lib/supabase/types";

// Everyone added to the Part 2 call list is also enrolled in this AC automation.
const AC_PART2_AUTOMATION = "PART2 Post-Event Contacting";

const MarkSchema = z.object({
  clientId: z.string().uuid(),
  workshopId: z.string().uuid(),
  attendeeId: z.string().uuid(),
});

const ToggleSchema = z.object({
  clientId: z.string().uuid(),
  workshopId: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
});

/** Turn the Part 2 Booking module on/off for a single workshop. Off by default,
 *  so the UI stays out of the way on workshops that don't run a Part 2. */
export async function setPart2Enabled(formData: FormData) {
  const session = await requireContentManager();
  const { clientId, workshopId, enabled } = ToggleSchema.parse({
    clientId: formData.get("clientId"),
    workshopId: formData.get("workshopId"),
    enabled: formData.get("enabled"),
  });
  if (!userCanAccessClient(session, clientId)) return { error: "Forbidden" };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("workshops")
    .update({ part2_enabled: enabled === "true", updated_at: new Date().toISOString() })
    .eq("id", workshopId)
    .eq("client_id", clientId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}/workshops/${workshopId}`);
  revalidatePath(`/admin/clients/${clientId}/workshops/${workshopId}/part2`);
  return { ok: true };
}

const CreateCampaignSchema = z.object({
  clientId: z.string().uuid(),
  workshopId: z.string().uuid(),
  advisorName: z.string().min(1).max(120),
  schedulingUrl: z.string().url().optional().or(z.literal("")),
});

/** Create the calling campaign for a workshop (Calendly provider). Idempotent:
 *  returns the existing campaign if one already exists for the workshop. */
export async function createCampaign(formData: FormData) {
  const session = await requireContentManager();
  const { clientId, workshopId, advisorName, schedulingUrl } = CreateCampaignSchema.parse({
    clientId: formData.get("clientId"),
    workshopId: formData.get("workshopId"),
    advisorName: formData.get("advisorName"),
    schedulingUrl: formData.get("schedulingUrl") ?? "",
  });
  if (!userCanAccessClient(session, clientId)) return { error: "Forbidden" };

  const admin = createSupabaseAdminClient();
  const { data: ws } = await admin
    .from("workshops")
    .select("id, title")
    .eq("id", workshopId)
    .eq("client_id", clientId)
    .maybeSingle<{ id: string; title: string }>();
  if (!ws) return { error: "Workshop not found" };

  const { data: existing } = await admin
    .from("call_campaigns")
    .select("id")
    .eq("workshop_id", workshopId)
    .maybeSingle<{ id: string }>();
  if (existing) return { ok: true, campaignId: existing.id };

  const { data: created, error } = await admin
    .from("call_campaigns")
    .insert({
      client_id: clientId,
      workshop_id: workshopId,
      name: `Part 2 — ${ws.title}`,
      status: "draft",
      calendar_provider: "calendly",
      calendar_config: {
        advisor_name: advisorName,
        scheduling_url: schedulingUrl || null,
      },
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}/workshops/${workshopId}/part2`);
  return { ok: true, campaignId: created?.id };
}

const SeedSchema = z.object({
  clientId: z.string().uuid(),
  workshopId: z.string().uuid(),
});

/** Add every currently-callable attendee (live, has phone, not registered, not
 *  already a target) to the campaign's call list as queued targets. */
export async function addCallableToCampaign(formData: FormData) {
  const session = await requireContentManager();
  const { clientId, workshopId } = SeedSchema.parse({
    clientId: formData.get("clientId"),
    workshopId: formData.get("workshopId"),
  });
  if (!userCanAccessClient(session, clientId)) return { error: "Forbidden" };

  const admin = createSupabaseAdminClient();
  const { data: campaign } = await admin
    .from("call_campaigns")
    .select("*")
    .eq("workshop_id", workshopId)
    .maybeSingle<CallCampaign>();
  if (!campaign) return { error: "Create the campaign first" };

  const list = await getCallList(workshopId);
  if (!list) return { error: "Workshop not found" };

  const { data: existingTargets } = await admin
    .from("call_targets")
    .select("attendee_id")
    .eq("campaign_id", campaign.id);
  const already = new Set((existingTargets ?? []).map((t) => t.attendee_id as string));

  // Schedule each new target the day AFTER the workshop, spread across the
  // calling window and biased toward hours people answer (learned over time).
  const { data: clientRow } = await admin
    .from("clients")
    .select("next_workshop_tz")
    .eq("id", clientId)
    .maybeSingle<{ next_workshop_tz: string | null }>();
  const zone = clientRow?.next_workshop_tz ?? "Eastern";
  const orderedHours = await bestHoursForClient(clientId);
  const workshopDate = list.workshop.workshop_date;

  const callable = list.entries.filter((e) => e.callable && !already.has(e.attendee_id));
  const toInsert = callable.map((e, i) => ({
    campaign_id: campaign.id,
    attendee_id: e.attendee_id,
    full_name: e.full_name,
    phone: e.phone,
    agency: e.agency,
    status: "queued" as const,
    next_attempt_at: firstAttemptAt(workshopDate, zone, i, orderedHours).toISOString(),
  }));

  if (toInsert.length === 0) return { ok: true, added: 0 };

  const { error } = await admin.from("call_targets").insert(toInsert);
  if (error) return { error: error.message };

  // Arm the campaign so the scheduler will dial these when they come due.
  await admin
    .from("call_campaigns")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", campaign.id);

  // Enroll the newly-added people in the Part 2 AC automation. They were synced
  // to AC at upload, so this only enrolls existing contacts. Runs after the
  // response so AC's throttled per-contact calls never block the button.
  const emails = callable.map((e) => e.email).filter((e): e is string => !!e);
  if (emails.length > 0) {
    after(async () => {
      try {
        const r = await enrollContactsInAutomation(emails, AC_PART2_AUTOMATION);
        if (r.configured) {
          console.log(
            `[part2] AC automation "${AC_PART2_AUTOMATION}": enrolled ${r.enrolled}/${r.requested}, ` +
              `${r.notInAc} not in AC, found=${r.automationFound}, ${r.errors} errors.`,
          );
        }
      } catch (e) {
        console.error("[part2] AC automation enroll failed:", e);
      }
    });
  }

  revalidatePath(`/admin/clients/${clientId}/workshops/${workshopId}/part2`);
  return { ok: true, added: toInsert.length };
}

/**
 * Manually mark a live attendee as registered for Part 2. Source = 'manual'.
 * This both records the signup and removes the person from future call lists.
 */
export async function markRegistered(formData: FormData) {
  const session = await requireContentManager();
  const { clientId, workshopId, attendeeId } = MarkSchema.parse({
    clientId: formData.get("clientId"),
    workshopId: formData.get("workshopId"),
    attendeeId: formData.get("attendeeId"),
  });
  if (!userCanAccessClient(session, clientId)) {
    return { error: "Forbidden" };
  }

  const admin = createSupabaseAdminClient();

  // Verify the workshop belongs to the client, and load the attendee snapshot.
  const [{ data: workshop }, { data: attendee }] = await Promise.all([
    admin
      .from("workshops")
      .select("*")
      .eq("id", workshopId)
      .eq("client_id", clientId)
      .maybeSingle<Workshop>(),
    admin
      .from("attendees")
      .select("*")
      .eq("id", attendeeId)
      .eq("workshop_id", workshopId)
      .maybeSingle<Attendee>(),
  ]);
  if (!workshop || !attendee) return { error: "Workshop or attendee not found" };

  const fullName =
    [attendee.first_name, attendee.last_name].filter(Boolean).join(" ").trim() ||
    attendee.email ||
    null;

  // Upsert on attendee_id (unique) so re-marking is idempotent and an AI/self
  // booking already on file isn't clobbered into a duplicate.
  const { error } = await admin.from("part2_registrations").upsert(
    {
      client_id: clientId,
      attendee_id: attendeeId,
      workshop_id: workshopId,
      full_name: fullName,
      email: attendee.email,
      phone: attendee.phone,
      agency: attendee.agency,
      source: "manual",
      marked_by: session.authUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attendee_id" },
  );
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}/workshops/${workshopId}/part2`);
  return { ok: true };
}

/** Undo a manual registration. Only manual rows can be removed here — AI/self
 *  bookings are real signups and must not be erased by this control. */
export async function unmarkRegistered(formData: FormData) {
  const session = await requireContentManager();
  const { clientId, workshopId, attendeeId } = MarkSchema.parse({
    clientId: formData.get("clientId"),
    workshopId: formData.get("workshopId"),
    attendeeId: formData.get("attendeeId"),
  });
  if (!userCanAccessClient(session, clientId)) {
    return { error: "Forbidden" };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("part2_registrations")
    .select("id, source")
    .eq("attendee_id", attendeeId)
    .eq("workshop_id", workshopId)
    .maybeSingle<{ id: string; source: string }>();

  if (!existing) return { ok: true };
  if (existing.source !== "manual") {
    return { error: "This person was booked by the AI or self-registered — can't undo here." };
  }

  const { error } = await admin
    .from("part2_registrations")
    .delete()
    .eq("id", existing.id);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}/workshops/${workshopId}/part2`);
  return { ok: true };
}
