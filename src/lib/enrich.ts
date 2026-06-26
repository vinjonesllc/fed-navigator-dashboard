import "server-only";
import Papa from "papaparse";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTabCsvForExport } from "@/lib/google-sheets";
import { parsePhone } from "@/lib/phone";

/**
 * Backfill attendee records from the client's master registrations sheet.
 *
 * Zoom's post-event "attendee/usage" export sometimes omits the registration
 * fields — it jams the name into one column and drops phone / age / the
 * registration question. The full registration data still lives in the client's
 * registrations tab (e.g. "MASTER Registrations"). This matches attendees to
 * that tab by email and fills ONLY the fields that are missing, so it never
 * clobbers a good upload. Safe no-op when no sheet/tab is configured.
 */
export type EnrichResult = { matched: number; updated: number; skipped?: string };

type HeaderMap = Partial<
  Record<"email" | "first" | "last" | "phone" | "age" | "question" | "text", string>
>;

function buildHeaderMap(fields: string[]): HeaderMap {
  const map: HeaderMap = {};
  for (const h of fields) {
    const k = h.toLowerCase().trim();
    if (!map.email && /e-?mail/.test(k)) map.email = h;
    else if (!map.first && /first/.test(k)) map.first = h;
    else if (!map.last && /last/.test(k)) map.last = h;
    else if (!map.phone && /(phone|mobile|cell)/.test(k)) map.phone = h;
    else if (!map.age && /\bage\b/.test(k)) map.age = h;
    else if (!map.question && /question/.test(k)) map.question = h;
    else if (!map.text && /text/.test(k)) map.text = h;
  }
  return map;
}

const norm = (e: string | null | undefined) => (e ?? "").toLowerCase().trim();

async function runInChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export async function enrichAttendeesFromRegistrations(
  workshopId: string,
): Promise<EnrichResult> {
  const admin = createSupabaseAdminClient();

  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", workshopId)
    .maybeSingle<{ client_id: string }>();
  if (!ws) return { matched: 0, updated: 0, skipped: "workshop not found" };

  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url, next_workshop_registrant_tab")
    .eq("id", ws.client_id)
    .maybeSingle<{ eval_sheet_url: string | null; next_workshop_registrant_tab: string | null }>();
  if (!client?.eval_sheet_url || !client?.next_workshop_registrant_tab) {
    return { matched: 0, updated: 0, skipped: "no registrations sheet/tab configured" };
  }

  const csv = await fetchTabCsvForExport(client.eval_sheet_url, client.next_workshop_registrant_tab);
  if (!csv) return { matched: 0, updated: 0, skipped: "could not read registrations tab" };

  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy" });
  const hmap = buildHeaderMap(parsed.meta.fields ?? []);
  if (!hmap.email) return { matched: 0, updated: 0, skipped: "no Email column in registrations tab" };

  const byEmail = new Map<string, Record<string, string>>();
  for (const row of parsed.data) {
    const e = norm(row[hmap.email]);
    if (e && !byEmail.has(e)) byEmail.set(e, row);
  }

  // Load this workshop's attendees (paginated).
  type Att = {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    age: number | null;
    registration_question: string | null;
    text_opt_in: boolean | null;
  };
  const attendees: Att[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("attendees")
      .select("id, email, first_name, last_name, phone, age, registration_question, text_opt_in")
      .eq("workshop_id", workshopId)
      .range(from, from + 999);
    const rows = (data ?? []) as Att[];
    attendees.push(...rows);
    if (rows.length < 1000) break;
  }

  let matched = 0;
  let updated = 0;
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

  for (const a of attendees) {
    const r = byEmail.get(norm(a.email));
    if (!r) continue;
    matched++;

    const patch: Record<string, unknown> = {};
    const regFirst = hmap.first ? (r[hmap.first] ?? "").trim() : "";
    const regLast = hmap.last ? (r[hmap.last] ?? "").trim() : "";

    // Fix combined names: only when our last_name is empty AND the sheet has a
    // real first+last split (don't overwrite a properly-split upload).
    if ((!a.last_name || !a.last_name.trim()) && regFirst && regLast) {
      patch.first_name = regFirst;
      patch.last_name = regLast;
    }
    if ((!a.phone || !a.phone.trim()) && hmap.phone) {
      const v = (r[hmap.phone] ?? "").trim();
      if (v) {
        patch.phone = v;
        const p = parsePhone(v);
        patch.phone_e164 = p.e164;
        patch.phone_extension = p.extension;
      }
    }
    if ((a.age === null || a.age === undefined) && hmap.age) {
      const n = parseInt((r[hmap.age] ?? "").replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(n) && n > 0) patch.age = n;
    }
    if ((!a.registration_question || !a.registration_question.trim()) && hmap.question) {
      const v = (r[hmap.question] ?? "").trim();
      if (v && v.toUpperCase() !== "N/A") patch.registration_question = v;
    }
    if ((a.text_opt_in === null || a.text_opt_in === undefined) && hmap.text) {
      const v = (r[hmap.text] ?? "").trim().toUpperCase();
      if (v) patch.text_opt_in = ["YES", "Y", "TRUE", "1"].includes(v);
    }

    if (Object.keys(patch).length > 0) toUpdate.push({ id: a.id, patch });
  }

  await runInChunks(toUpdate, 10, async ({ id, patch }) => {
    const { error } = await admin.from("attendees").update(patch).eq("id", id);
    if (!error) updated++;
  });

  return { matched, updated };
}
