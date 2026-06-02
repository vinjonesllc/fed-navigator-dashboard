"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "editor", "super_advisor", "advisor"]),
  clientId: z.string().uuid().optional().nullable(),
  superAdvisorClientIds: z.array(z.string().uuid()).optional(),
});

export async function inviteUser(formData: FormData) {
  await requireAdmin();

  const superRaw = formData.get("superAdvisorClientIds") as string | null;
  const superIds = superRaw ? (JSON.parse(superRaw) as string[]) : [];

  const parsed = Schema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    clientId: (formData.get("clientId") as string) || null,
    superAdvisorClientIds: superIds,
  });

  if (parsed.role === "advisor" && !parsed.clientId) {
    throw new Error("Advisor role requires a client");
  }
  if (parsed.role === "super_advisor" && (!parsed.superAdvisorClientIds || parsed.superAdvisorClientIds.length === 0)) {
    throw new Error("Super-Advisor role requires at least one client to view");
  }

  const admin = createSupabaseAdminClient();

  // Create the user directly with a password — bypasses email entirely.
  // `email_confirm: true` skips the email confirmation step so they can sign in immediately.
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Create did not return a user");

  const clientId = parsed.role === "advisor" ? (parsed.clientId ?? null) : null;

  const { error: upErr } = await admin.from("app_users").upsert({
    id: data.user.id,
    email: parsed.email,
    role: parsed.role,
    client_id: clientId,
  });
  if (upErr) throw new Error(upErr.message);

  if (parsed.role === "super_advisor" && parsed.superAdvisorClientIds) {
    await admin.from("super_advisor_clients").delete().eq("user_id", data.user.id);
    if (parsed.superAdvisorClientIds.length > 0) {
      await admin.from("super_advisor_clients").insert(
        parsed.superAdvisorClientIds.map((cid) => ({
          user_id: data.user!.id,
          client_id: cid,
        })),
      );
    }
  } else {
    await admin.from("super_advisor_clients").delete().eq("user_id", data.user.id);
  }

  revalidatePath("/admin/team");
}
