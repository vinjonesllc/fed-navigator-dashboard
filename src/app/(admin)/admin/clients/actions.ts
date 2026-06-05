"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireContentManager } from "@/lib/auth";
import { slugify } from "@/lib/utils-slug";
import { CLIENT_BRANDS, NEXT_WORKSHOP_TIMEZONES } from "@/lib/supabase/types";

const ClientInput = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  accent_color: z.string().optional(),
  eval_sheet_url: z.string().url().optional().or(z.literal("")),
  brand: z.enum(CLIENT_BRANDS).default("Fed Pilot"),
  next_workshop_date: z.string().optional(),
  next_workshop_hour: z.string().optional(),
  next_workshop_tz: z.string().optional(),
  next_workshop_registrant_tab: z.string().optional(),
});

type ClientParsed = z.infer<typeof ClientInput>;

// Normalize the optional "next workshop" form fields into DB-ready values:
// blanks -> null, hour validated 0-23, timezone validated against the enum.
function nextWorkshopFields(parsed: ClientParsed) {
  const hourRaw = parsed.next_workshop_hour?.trim();
  const hour = hourRaw ? Number(hourRaw) : null;
  const tz = parsed.next_workshop_tz?.trim() || null;
  return {
    next_workshop_date: parsed.next_workshop_date?.trim() || null,
    next_workshop_hour: hour !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null,
    next_workshop_tz: tz && (NEXT_WORKSHOP_TIMEZONES as readonly string[]).includes(tz) ? tz : null,
    next_workshop_registrant_tab: parsed.next_workshop_registrant_tab?.trim() || null,
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
    next_workshop_date: formData.get("next_workshop_date") ?? undefined,
    next_workshop_hour: formData.get("next_workshop_hour") ?? undefined,
    next_workshop_tz: formData.get("next_workshop_tz") ?? undefined,
    next_workshop_registrant_tab: formData.get("next_workshop_registrant_tab") ?? undefined,
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
