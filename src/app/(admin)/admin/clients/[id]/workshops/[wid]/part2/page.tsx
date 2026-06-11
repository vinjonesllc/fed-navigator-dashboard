import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isContentManager, requireConsoleAccess, userCanAccessClient } from "@/lib/auth";
import { getCallList, getCampaignForWorkshop } from "@/lib/part2";
import { formatWorkshopDate } from "@/lib/format-date";
import type { Client } from "@/lib/supabase/types";
import { Part2Client } from "./part2-client";
import { Part2ToggleButton } from "../part2-toggle-button";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="text-[11px] uppercase tracking-[0.04em] text-ink-4">{label}</div>
      <div className="mt-1.5 font-display text-[30px] font-semibold leading-none tabular-nums text-ink-1">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-ink-3">{hint}</div>}
    </div>
  );
}

export default async function Part2BookingPage({
  params,
}: {
  params: Promise<{ id: string; wid: string }>;
}) {
  const { id, wid } = await params;
  const session = await requireConsoleAccess();
  if (!userCanAccessClient(session, id)) redirect("/admin/clients?error=forbidden");

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle<Client>();
  if (!client) notFound();

  const [result, campaignView] = await Promise.all([
    getCallList(wid),
    getCampaignForWorkshop(wid),
  ]);
  if (!result || result.workshop.client_id !== id) notFound();

  const { workshop, entries, summary } = result;
  const canManage = isContentManager(session.appUser?.role);

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6">
      <Link
        href={`/admin/clients/${id}/workshops/${wid}`}
        className="text-[13px] text-ink-3 hover:text-ink-1"
      >
        ← {workshop.title}
      </Link>

      <div className="mt-3 mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink-1">
            Part 2 Booking
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {workshop.title} · {formatWorkshopDate(workshop.workshop_date)} · live attendees and
            their Part 2 status. Registered people are excluded from AI call lists.
          </p>
        </div>
        {canManage && (
          <Part2ToggleButton clientId={id} workshopId={wid} enabled={workshop.part2_enabled} />
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Callable" value={summary.callable} hint="Live · has phone · not registered" />
        <StatCard label="Registered" value={summary.registered} hint="AI, manual, or self-serve" />
        <StatCard label="With phone" value={summary.with_phone} hint="Live attendees reachable" />
        <StatCard label="No phone" value={summary.no_phone} hint="Live, but no number on file" />
      </div>

      <Part2Client
        clientId={id}
        workshopId={wid}
        entries={entries}
        canManage={canManage}
        campaign={campaignView.campaign}
        targetsByAttendee={campaignView.targetsByAttendee}
      />
    </div>
  );
}
