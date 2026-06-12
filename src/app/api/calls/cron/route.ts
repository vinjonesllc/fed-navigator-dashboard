import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqualStr } from "@/lib/webhook-verify";
import { placeCallForTarget } from "@/lib/place-call";
import { canDialNow } from "@/lib/call-scheduling";
import type { CallTarget } from "@/lib/supabase/types";

// Scheduler entrypoint — pinged on a cadence by Supabase pg_cron (via pg_net).
// Dials targets that are due (next_attempt_at <= now) in running campaigns,
// in small batches so calls stay spread out. Secret-gated with CRON_SECRET.
const BATCH = 25;
const DIALABLE: CallTarget["status"][] = ["queued", "no_answer", "voicemail"];

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("x-cron-secret");
  if (!secret || !got || !timingSafeEqualStr(got, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("call_targets")
    .select("id, attempts, campaign_id")
    .in("status", DIALABLE)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  const targets = (due ?? []) as Pick<CallTarget, "id" | "attempts" | "campaign_id">[];
  if (targets.length === 0) return NextResponse.json({ ok: true, dialed: 0 });

  // Only dial running campaigns, respect each campaign's max_attempts, and only
  // on US workdays inside the calling window (using the workshop's timezone).
  const campaignIds = Array.from(new Set(targets.map((t) => t.campaign_id)));
  const { data: campaigns } = await admin
    .from("call_campaigns")
    .select("id, status, max_attempts, client_id")
    .in("id", campaignIds);
  const byId = new Map(
    (campaigns ?? []).map((c) => [
      c.id as string,
      c as { status: string; max_attempts: number; client_id: string },
    ]),
  );

  const clientIds = Array.from(new Set((campaigns ?? []).map((c) => c.client_id as string)));
  const { data: clients } = await admin
    .from("clients")
    .select("id, next_workshop_tz")
    .in("id", clientIds);
  const tzByClient = new Map(
    (clients ?? []).map((c) => [c.id as string, (c.next_workshop_tz as string | null) ?? "Eastern"]),
  );

  const now = new Date();
  const eligible = targets.filter((t) => {
    const c = byId.get(t.campaign_id);
    if (!c || c.status !== "running" || t.attempts >= c.max_attempts) return false;
    return canDialNow(tzByClient.get(c.client_id) ?? "Eastern", now);
  });

  // Dial the batch CONCURRENTLY so the route returns in ~a second or two. The
  // caller is Supabase pg_net, which times out at 5s — slow sequential dialing
  // of a full batch was exceeding it (and risked Vercel cutting the function off
  // mid-batch). Vapi's own concurrency cap limits how many actually connect; any
  // that don't place stay queued and retry on the next tick.
  const results = await Promise.allSettled(eligible.map((t) => placeCallForTarget(t.id)));
  const dialed = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;

  return NextResponse.json({
    ok: true,
    considered: targets.length,
    eligible: eligible.length,
    dialed,
  });
}
