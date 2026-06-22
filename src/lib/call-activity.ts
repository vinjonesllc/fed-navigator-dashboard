import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Append one entry to a person's call activity log. Used by the human "Record
 * action" UI and by the AI (webhooks). Best-effort for the AI paths — callers
 * there should wrap in try/catch so logging never breaks a call.
 */
export async function recordCallActivity(a: {
  clientId: string;
  attendeeId: string | null;
  campaignId?: string | null;
  workshopId?: string | null;
  action: string;
  notes?: string | null;
  actorName: string;
  actorUserId?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.from("call_activities").insert({
    client_id: a.clientId,
    attendee_id: a.attendeeId ?? null,
    campaign_id: a.campaignId ?? null,
    workshop_id: a.workshopId ?? null,
    action: a.action,
    notes: a.notes ?? null,
    actor_name: a.actorName,
    actor_user_id: a.actorUserId ?? null,
  });
}

/** Activity history for one attendee, newest first. */
export async function listAttendeeActivities(attendeeId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("call_activities")
    .select("id, action, notes, actor_name, created_at")
    .eq("attendee_id", attendeeId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
