import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type AppUser, type Client } from "@/lib/supabase/types";
import { InviteForm } from "./invite-form";
import { MembersTable } from "./members-table";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-1 bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-ink-3";

export default async function TeamPage() {
  await requireAdmin();

  const admin = createSupabaseAdminClient();
  const [{ data: users }, { data: clients }, { data: grants }] = await Promise.all([
    admin.from("app_users").select("*").order("created_at", { ascending: false }),
    admin.from("clients").select("id, name, slug").order("name"),
    admin.from("super_advisor_clients").select("user_id, client_id"),
  ]);

  const list = (users ?? []) as AppUser[];
  const clientList = (clients ?? []) as Pick<Client, "id" | "name" | "slug">[];
  const grantsByUser = new Map<string, string[]>();
  for (const g of grants ?? []) {
    const arr = grantsByUser.get(g.user_id as string) ?? [];
    arr.push(g.client_id as string);
    grantsByUser.set(g.user_id as string, arr);
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-line-2 pb-5">
        <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
          Team
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-3">
          Invite users and pick their role. Magic-link sign-in.
        </p>
      </div>

      <div className={`${CARD} p-5`}>
        <h3 className="m-0 mb-4 font-display text-[14.5px] font-semibold text-ink-1 dark:text-white">
          Add user
        </h3>
        <InviteForm clients={clientList} />
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-2.5 px-5 pb-3.5 pt-4">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1 dark:text-white">
            Members
          </h3>
          <span className={PILL}>{list.length}</span>
        </div>
        <MembersTable
          members={list}
          clients={clientList}
          grantsByUser={Object.fromEntries(grantsByUser)}
        />
      </div>
    </div>
  );
}
