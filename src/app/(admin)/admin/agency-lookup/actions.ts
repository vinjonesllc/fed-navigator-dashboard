"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContentManager } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  domain: z.string().min(3).max(120),
  agency_name: z.string().min(2).max(200),
  agency_short: z.string().max(30).optional(),
});

export async function upsertAgency(formData: FormData) {
  await requireContentManager();
  const parsed = Schema.parse({
    domain: (formData.get("domain") as string).toLowerCase().trim(),
    agency_name: (formData.get("agency_name") as string).trim(),
    agency_short: ((formData.get("agency_short") as string) || "").trim() || undefined,
  });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("agency_lookup").upsert({
    domain: parsed.domain,
    agency_name: parsed.agency_name,
    agency_short: parsed.agency_short ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/agency-lookup");
}
