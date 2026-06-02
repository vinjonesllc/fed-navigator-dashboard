import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Workshop } from "@/lib/supabase/types";

export type WorkshopWithStats = Workshop & {
  // attended_count from workshops table can be stale; this is computed from attendees.
  live_count: number;
  avg_engagement: number | null;
  opted_in_count: number;
};

export async function getClientWorkshops(clientId: string): Promise<WorkshopWithStats[]> {
  const admin = createSupabaseAdminClient();
  const { data: workshops } = await admin
    .from("workshops")
    .select("*")
    .eq("client_id", clientId)
    .order("workshop_date", { ascending: false });

  const list = (workshops ?? []) as Workshop[];
  if (list.length === 0) return [];

  const ids = list.map((w) => w.id);
  const { data: stats } = await admin
    .from("attendees")
    .select("workshop_id, engagement_score, text_opt_in, participation")
    .in("workshop_id", ids);

  const byWs = new Map<string, { sum: number; n: number; opted: number; live: number }>();
  for (const r of stats ?? []) {
    const cur = byWs.get(r.workshop_id) ?? { sum: 0, n: 0, opted: 0, live: 0 };
    if (r.engagement_score !== null) {
      cur.sum += Number(r.engagement_score);
      cur.n += 1;
    }
    if (r.text_opt_in) cur.opted += 1;
    if (r.participation === "Live") cur.live += 1;
    byWs.set(r.workshop_id, cur);
  }

  return list.map((w) => {
    const s = byWs.get(w.id);
    return {
      ...w,
      live_count: s?.live ?? 0,
      avg_engagement: s && s.n > 0 ? Math.round((s.sum / s.n) * 10) / 10 : null,
      opted_in_count: s?.opted ?? 0,
    };
  });
}
