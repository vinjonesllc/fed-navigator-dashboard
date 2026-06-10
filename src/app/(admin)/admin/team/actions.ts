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

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  originalEmail: z.string().email(),
  fullName: z.string().optional(),
  role: z.enum(["admin", "editor", "super_advisor", "advisor"]),
  clientId: z.string().uuid().optional().nullable(),
  superAdvisorClientIds: z.array(z.string().uuid()).optional(),
  password: z.string().optional(),
});

export async function updateUser(formData: FormData) {
  await requireAdmin();

  const superRaw = formData.get("superAdvisorClientIds") as string | null;
  const superIds = superRaw ? (JSON.parse(superRaw) as string[]) : [];
  const password = ((formData.get("password") as string) || "").trim();

  const parsed = UpdateSchema.parse({
    userId: formData.get("userId"),
    email: formData.get("email"),
    originalEmail: formData.get("originalEmail"),
    fullName: (formData.get("fullName") as string) || undefined,
    role: formData.get("role"),
    clientId: (formData.get("clientId") as string) || null,
    superAdvisorClientIds: superIds,
    password: password || undefined,
  });

  if (parsed.password && parsed.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (parsed.role === "advisor" && !parsed.clientId) {
    throw new Error("Advisor role requires an advisor page");
  }
  if (
    parsed.role === "super_advisor" &&
    (!parsed.superAdvisorClientIds || parsed.superAdvisorClientIds.length === 0)
  ) {
    throw new Error("Super-Advisor role requires at least one advisor to view");
  }

  const admin = createSupabaseAdminClient();

  // Touch the auth record only when the email changed or a new password is set.
  const authPatch: { email?: string; password?: string } = {};
  if (parsed.email !== parsed.originalEmail) authPatch.email = parsed.email;
  if (parsed.password) authPatch.password = parsed.password;
  if (Object.keys(authPatch).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(parsed.userId, authPatch);
    if (error) throw new Error(error.message);
  }

  const clientId = parsed.role === "advisor" ? (parsed.clientId ?? null) : null;
  const { error: upErr } = await admin
    .from("app_users")
    .update({
      email: parsed.email,
      full_name: parsed.fullName?.trim() || null,
      role: parsed.role,
      client_id: clientId,
    })
    .eq("id", parsed.userId);
  if (upErr) throw new Error(upErr.message);

  await admin.from("super_advisor_clients").delete().eq("user_id", parsed.userId);
  const grantIds = parsed.superAdvisorClientIds ?? [];
  if (parsed.role === "super_advisor" && grantIds.length > 0) {
    await admin.from("super_advisor_clients").insert(
      grantIds.map((cid) => ({ user_id: parsed.userId, client_id: cid })),
    );
  }

  revalidatePath("/admin/team");
}
