import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "no session" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("app_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    // New self-signup with no invite → land in advisor role with no client.
    // Admin needs to assign them a client (or change their role) via /admin/team.
    await admin.from("app_users").insert({
      id: user.id,
      email: user.email,
      role: "advisor",
    });
  }

  return NextResponse.json({ ok: true });
}
