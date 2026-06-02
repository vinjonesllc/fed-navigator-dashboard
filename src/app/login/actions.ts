"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

/**
 * Server-action sign-in. Doing this on the server avoids a race between the
 * browser SDK writing the auth cookies and the immediate redirect — the cookies
 * are set as part of this response, so the next page render sees the session.
 */
export async function signInWithPassword(formData: FormData) {
  const parsed = Schema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  const supabase = await createSupabaseServerClient();
  const { error, data } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });

  if (error) {
    return { error: error.message };
  }
  if (!data.user) {
    return { error: "Sign-in returned no user" };
  }

  // Lazily ensure an app_users row exists for this auth user (handles users
  // created outside the team invite flow).
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("app_users")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!existing) {
    await admin.from("app_users").insert({
      id: data.user.id,
      email: data.user.email,
      role: "advisor",
    });
  }

  redirect(parsed.next || "/");
}
