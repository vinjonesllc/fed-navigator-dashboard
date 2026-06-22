"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireContentManager } from "@/lib/auth";
import { slugify } from "@/lib/utils-slug";
import { CLIENT_BRANDS } from "@/lib/supabase/types";
import {
  parseNextWorkshops,
  pruneExpiredWorkshops,
  soonestFutureWorkshop,
} from "@/lib/next-workshop";

const ClientInput = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  accent_color: z.string().optional(),
  eval_sheet_url: z.string().url().optional().or(z.literal("")),
  brand: z.enum(CLIENT_BRANDS).default("Fed Pilot"),
  // JSON array of { date, hour, tz, registrant_tab, reg_url } from the form.
  next_workshops: z.string().optional(),
});

type ClientParsed = z.infer<typeof ClientInput>;

// Normalize the "next workshops" form field into DB-ready values: the validated
// jsonb array, plus a mirror of the SOONEST FUTURE entry into the singular
// next_workshop_* columns (consumed by AC, the AI calls, the cron, and Part 2).
function nextWorkshopFields(parsed: ClientParsed) {
  let entries: ReturnType<typeof parseNextWorkshops> = [];
  if (parsed.next_workshops) {
    try {
      entries = parseNextWorkshops(JSON.parse(parsed.next_workshops));
    } catch {
      entries = [];
    }
  }
  // Past workshops are no longer needed — drop them on every save.
  entries = pruneExpiredWorkshops(entries);
  const soonest = soonestFutureWorkshop(entries);
  return {
    next_workshops: entries,
    next_workshop_date: soonest?.date ?? null,
    next_workshop_hour: soonest?.hour ?? null,
    next_workshop_tz: soonest?.tz ?? null,
    next_workshop_registrant_tab: soonest?.registrant_tab ?? null,
    next_workshop_reg_url: soonest?.reg_url ?? null,
  };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// Turn a Postgres/Supabase error into a human-friendly message. Returned (not
// thrown) so the message survives — Next.js sanitizes THROWN server errors in
// production into a generic "Server Components render" string.
function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23514" && /brand/i.test(error.message)) {
    return "That brand isn't enabled in the database yet. Apply the latest brand migration, then try again.";
  }
  if (error.code === "23505") {
    return "A client with that name or slug already exists.";
  }
  return error.message || "Could not save the client.";
}

function readClientForm(formData: FormData) {
  return ClientInput.parse({
    name: formData.get("name"),
    slug: formData.get("slug") ?? undefined,
    contact_email: formData.get("contact_email") ?? "",
    accent_color: formData.get("accent_color") ?? "",
    eval_sheet_url: formData.get("eval_sheet_url") ?? "",
    brand: formData.get("brand") ?? undefined,
    next_workshops: formData.get("next_workshops") ?? undefined,
  });
}

export async function createClient(formData: FormData): Promise<ActionResult> {
  await requireContentManager();

  let parsed: ClientParsed;
  try {
    parsed = readClientForm(formData);
  } catch {
    return { ok: false, error: "Please check the form fields and try again." };
  }

  const slug = parsed.slug?.trim() ? slugify(parsed.slug) : slugify(parsed.name);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("clients").insert({
    name: parsed.name,
    slug,
    contact_email: parsed.contact_email || null,
    accent_color: parsed.accent_color || null,
    eval_sheet_url: parsed.eval_sheet_url || null,
    brand: parsed.brand,
    ...nextWorkshopFields(parsed),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath("/admin/clients");
  return { ok: true };
}

export async function updateClient(id: string, formData: FormData): Promise<ActionResult> {
  await requireContentManager();

  let parsed: ClientParsed;
  try {
    parsed = readClientForm(formData);
  } catch {
    return { ok: false, error: "Please check the form fields and try again." };
  }

  const slug = parsed.slug?.trim() ? slugify(parsed.slug) : slugify(parsed.name);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("clients")
    .update({
      name: parsed.name,
      slug,
      contact_email: parsed.contact_email || null,
      accent_color: parsed.accent_color || null,
      eval_sheet_url: parsed.eval_sheet_url || null,
      brand: parsed.brand,
      ...nextWorkshopFields(parsed),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true };
}

export async function uploadClientLogo(clientId: string, formData: FormData) {
  await requireContentManager();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const admin = createSupabaseAdminClient();
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
  const path = `${clientId}/logo-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("client-logos")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = admin.storage.from("client-logos").getPublicUrl(path);
  const { error: updErr } = await admin
    .from("clients")
    .update({ logo_url: pub.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", clientId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
}
