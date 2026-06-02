"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireContentManager } from "@/lib/auth";
import { slugify } from "@/lib/utils-slug";

const ClientInput = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  accent_color: z.string().optional(),
  eval_sheet_url: z.string().url().optional().or(z.literal("")),
});

export async function createClient(formData: FormData) {
  await requireContentManager();
  const parsed = ClientInput.parse({
    name: formData.get("name"),
    slug: formData.get("slug") ?? undefined,
    contact_email: formData.get("contact_email") ?? "",
    accent_color: formData.get("accent_color") ?? "",
    eval_sheet_url: formData.get("eval_sheet_url") ?? "",
  });

  const slug = parsed.slug?.trim() ? slugify(parsed.slug) : slugify(parsed.name);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("clients").insert({
    name: parsed.name,
    slug,
    contact_email: parsed.contact_email || null,
    accent_color: parsed.accent_color || null,
    eval_sheet_url: parsed.eval_sheet_url || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
}

export async function updateClient(id: string, formData: FormData) {
  await requireContentManager();
  const parsed = ClientInput.parse({
    name: formData.get("name"),
    slug: formData.get("slug") ?? undefined,
    contact_email: formData.get("contact_email") ?? "",
    accent_color: formData.get("accent_color") ?? "",
    eval_sheet_url: formData.get("eval_sheet_url") ?? "",
  });

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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
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
