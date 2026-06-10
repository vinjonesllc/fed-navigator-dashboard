import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireConsoleAccess, isContentManager } from "@/lib/auth";
import { CreateClientDialog } from "./create-client-dialog";
import { ClickableRow } from "@/components/clickable-row";
import type { Client } from "@/lib/supabase/types";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-1 bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-ink-3";

export default async function ClientsPage() {
  const session = await requireConsoleAccess();
  const role = session.appUser?.role;

  // Advisor: redirect straight to their single client.
  if ((role === "advisor" || role === "client") && session.appUser?.client_id) {
    redirect(`/admin/clients/${session.appUser.client_id}`);
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  // Scope to assigned clients for super_advisor
  if (session.accessibleClientIds !== null) {
    if (session.accessibleClientIds.length === 0) {
      // No assigned clients
      query = query.in("id", []);
    } else {
      query = query.in("id", session.accessibleClientIds);
    }
  }

  const { data: clients } = await query;
  const list = (clients ?? []) as Client[];
  const manager = isContentManager(role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-line-2 pb-5">
        <div>
          <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.025em] text-ink-1 dark:text-white">
            Advisors
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Agencies, associations, and partners that host workshops with Fed Navigator.
          </p>
        </div>
        {manager && <CreateClientDialog />}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-2.5 px-5 pb-3.5 pt-4">
          <h3 className="m-0 font-display text-[14.5px] font-semibold text-ink-1 dark:text-white">
            All advisors
          </h3>
          <span className={PILL}>{list.length}</span>
        </div>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {["Name", "Slug", "Contact"].map((h) => (
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
            {list.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="border-b border-line-2 px-4 py-6 text-center text-ink-3"
                >
                  {manager ? "No advisors yet. Create one above." : "No advisors assigned to you."}
                </td>
              </tr>
            )}
            {list.map((c) => (
              <ClickableRow
                key={c.id}
                href={`/admin/clients/${c.id}`}
                className="cursor-pointer hover:bg-bg-2"
                title="Click to view this advisor"
              >
                <td className="border-b border-line-2 px-4 py-3 font-medium text-ink-1 dark:text-white">
                  {c.name}
                </td>
                <td className="border-b border-line-2 px-4 py-3 font-mono text-[11.5px] text-ink-4">
                  {c.slug}
                </td>
                <td className="border-b border-line-2 px-4 py-3 text-ink-3">
                  {c.contact_email ?? "—"}
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
