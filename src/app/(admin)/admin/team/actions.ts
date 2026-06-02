"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  email: z.string().email(),
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.email, {
    redirectTo: `${appUrl}/auth/callback`,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Invite did not return a user");

  // For roles other than advisor, client_id stays null.
  const clientId = parsed.role === "advisor" ? (parsed.clientId ?? null) : null;

  const { error: upErr } = await admin.from("app_users").upsert({
    id: data.user.id,
    email: parsed.email,
    role: parsed.role,
    client_id: clientId,
  });
  if (upErr) throw new Error(upErr.message);

  // Replace any existing super_advisor grants with the new set.
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
    // Clean up any stale super_advisor grants if the role changed.
    await admin.from("super_advisor_clients").delete().eq("user_id", data.user.id);
  }

  revalidatePath("/admin/team");
}
