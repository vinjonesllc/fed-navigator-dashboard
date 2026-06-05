import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS, type AppUser, type Client } from "@/lib/supabase/types";
import { InviteForm } from "./invite-form";

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
  const clientById = new Map(clientList.map((c) => [c.id, c]));
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
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {["Email", "Role", "Advisor / Access", "Joined"].map((h) => (
                <th
                  key={h}
                  className="border-b border-line-1 bg-bg-2 px-4 py-2.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const access =
                u.role === "super_advisor"
                  ? (grantsByUser.get(u.id) ?? [])
                      .map((cid) => clientById.get(cid)?.name ?? cid.slice(0, 8))
                      .join(", ") || "—"
                  : u.client_id
                    ? (clientById.get(u.client_id)?.name ?? u.client_id.slice(0, 8))
                    : "—";
              return (
                <tr key={u.id} className="hover:bg-bg-2">
                  <td className="border-b border-line-2 px-4 py-3 font-medium text-ink-1 dark:text-white">
                    {u.email}
                  </td>
                  <td className="border-b border-line-2 px-4 py-3">
                    <span className="rounded border border-line-1 bg-bg-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="border-b border-line-2 px-4 py-3 text-ink-2">{access}</td>
                  <td className="border-b border-line-2 px-4 py-3 font-mono text-[11.5px] text-ink-4">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
