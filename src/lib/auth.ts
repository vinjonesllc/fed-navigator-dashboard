import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppRole, AppUser } from "@/lib/supabase/types";

export type Session = {
  authUserId: string;
  email: string;
  appUser: AppUser | null;
  /** Clients this user can view. For admin/editor: all clients (signaled by `null`).
   *  For super_advisor: explicit list. For advisor: their single client_id. */
  accessibleClientIds: string[] | null;
};

const CONTENT_MANAGER_ROLES: AppRole[] = ["admin", "editor"];

export function isContentManager(role: AppRole | undefined): boolean {
  return !!role && CONTENT_MANAGER_ROLES.includes(role);
}

export function isAdmin(role: AppRole | undefined): boolean {
  return role === "admin";
}

export async function getCurrentUser(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: appUser } = await admin
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<AppUser>();

  let accessibleClientIds: string[] | null = null;
  if (appUser) {
    if (isContentManager(appUser.role)) {
      accessibleClientIds = null; // null sentinel = "all"
    } else if (appUser.role === "super_advisor") {
      const { data: grants } = await admin
        .from("super_advisor_clients")
        .select("client_id")
        .eq("user_id", appUser.id);
      accessibleClientIds = (grants ?? []).map((g) => g.client_id as string);
    } else if (appUser.client_id) {
      // advisor / legacy client
      accessibleClientIds = [appUser.client_id];
    } else {
      accessibleClientIds = [];
    }
  }

  return {
    authUserId: user.id,
    email: user.email ?? "",
    appUser: appUser ?? null,
    accessibleClientIds,
  };
}

export async function requireUser(): Promise<Session> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  return session;
}

/** Any role that can access the console UI. */
export async function requireConsoleAccess(): Promise<Session> {
  const session = await requireUser();
  if (!session.appUser) redirect("/login?error=no-role");
  return session;
}

/** admin + editor — can create/edit/delete content. */
export async function requireContentManager(): Promise<Session> {
  const session = await requireConsoleAccess();
  if (!isContentManager(session.appUser?.role)) redirect("/admin/clients?error=forbidden");
  return session;
}

/** admin only — team management. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireConsoleAccess();
  if (!isAdmin(session.appUser?.role)) redirect("/admin/clients?error=forbidden");
  return session;
}

/** Whether the user can view a given client_id. */
export function userCanAccessClient(session: Session, clientId: string): boolean {
  if (session.accessibleClientIds === null) return true; // admin / editor
  return session.accessibleClientIds.includes(clientId);
}
