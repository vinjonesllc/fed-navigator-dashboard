"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CALL_TARGET_STATUS_LABELS,
  REGISTRATION_SOURCE_LABELS,
  type CallCampaign,
  type CallTarget,
  type CallTargetStatus,
  type RegistrationSource,
} from "@/lib/supabase/types";
import type { CallListEntry } from "@/lib/part2";
import {
  addCallableToCampaign,
  createCampaign,
  markRegistered,
  setCampaignStatus,
  unmarkRegistered,
} from "./actions";

const CARD =
  "rounded-[14px] border border-line-1 bg-surface shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]";

// Statuses where a (re)call is still worth placing.
const CALLABLE_STATUSES: CallTargetStatus[] = ["queued", "no_answer", "voicemail"];

function SourceBadge({ source }: { source: RegistrationSource }) {
  const variant =
    source === "ai_call" ? "default" : source === "self_serve" ? "secondary" : "outline";
  return <Badge variant={variant}>{REGISTRATION_SOURCE_LABELS[source]}</Badge>;
}

type Filter = "callable" | "registered" | "all";

export function Part2Client({
  clientId,
  workshopId,
  entries,
  canManage,
  campaign,
  targetsByAttendee,
  defaultAdvisorName,
}: {
  clientId: string;
  workshopId: string;
  entries: CallListEntry[];
  canManage: boolean;
  campaign: CallCampaign | null;
  targetsByAttendee: Record<string, CallTarget>;
  /** Advisor name to pre-fill the campaign setup with — the client/advisor the
   *  workshop belongs to. Editable in case the client name needs trimming. */
  defaultAdvisorName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("callable");
  const [advisorName, setAdvisorName] = useState(defaultAdvisorName);
  const [schedulingUrl, setSchedulingUrl] = useState("");

  const shown = useMemo(() => {
    if (filter === "callable") return entries.filter((e) => e.callable);
    if (filter === "registered") return entries.filter((e) => e.registration);
    return entries;
  }, [entries, filter]);

  // Callable people not yet on the call list — what "Add to call list" will add.
  const unqueuedCallable = useMemo(
    () => entries.filter((e) => e.callable && !targetsByAttendee[e.attendee_id]).length,
    [entries, targetsByAttendee],
  );

  function run(
    action: (fd: FormData) => Promise<{ ok?: boolean; error?: string; added?: number }>,
    fd: FormData,
    success: (r: { added?: number }) => string,
    key?: string,
  ) {
    if (key) setBusyId(key);
    startTransition(async () => {
      try {
        const r = await action(fd);
        if (r.error) toast.error(r.error);
        else toast.success(success(r));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusyId(null);
      }
    });
  }

  function baseFd(extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("workshopId", workshopId);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    return fd;
  }

  function callNow(targetId: string) {
    setBusyId(targetId);
    startTransition(async () => {
      try {
        const res = await fetch("/api/calls/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || j.error) toast.error(j.error ?? "Call failed");
        else toast.success("Placing call…");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Call failed");
      } finally {
        setBusyId(null);
      }
    });
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: "callable", label: "Call list" },
    { key: "registered", label: "Registered" },
    { key: "all", label: "All live attendees" },
  ];

  const advisor =
    (campaign?.calendar_config as { advisor_name?: string } | undefined)?.advisor_name ?? "—";

  return (
    <div className="space-y-4">
      {/* Campaign setup / status */}
      {!campaign ? (
        canManage ? (
          <div className={`${CARD} p-4`}>
            <div className="text-[13px] font-medium text-ink-1">Set up calling</div>
            <p className="mt-1 mb-3 text-[12px] text-ink-3">
              Create a calling campaign for this workshop, then add callable attendees and place
              calls. Booking happens on the advisor&apos;s Calendly.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-ink-3">Advisor name</Label>
                <Input
                  value={advisorName}
                  onChange={(e) => setAdvisorName(e.target.value)}
                  placeholder="e.g. Dana Reynolds"
                  className="h-9 w-56"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-ink-3">Calendly link (optional)</Label>
                <Input
                  value={schedulingUrl}
                  onChange={(e) => setSchedulingUrl(e.target.value)}
                  placeholder="https://calendly.com/…/part-2"
                  className="h-9 w-72"
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={pending || advisorName.trim().length === 0}
                onClick={() =>
                  run(
                    createCampaign,
                    baseFd({ advisorName: advisorName.trim(), schedulingUrl: schedulingUrl.trim() }),
                    () => "Campaign created",
                    "create",
                  )
                }
                className="h-9 rounded-[9px]"
              >
                {busyId === "create" && pending ? "Creating…" : "Create campaign"}
              </Button>
            </div>
          </div>
        ) : (
          <div className={`${CARD} p-4 text-[13px] text-ink-3`}>No calling campaign set up yet.</div>
        )
      ) : (
        <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <span className="font-medium text-ink-1">Calling campaign</span> · Calendly · advisor{" "}
            <span className="font-medium text-ink-1">{advisor}</span>
            <Badge variant={campaign.status === "running" ? "default" : "secondary"}>
              {campaign.status}
            </Badge>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {campaign.status === "running" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(setCampaignStatus, baseFd({ status: "paused" }), () => "Calling paused", "status")
                  }
                  className="h-9 rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                >
                  {busyId === "status" && pending ? "Pausing…" : "Pause calling"}
                </Button>
              )}
              {campaign.status === "paused" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(setCampaignStatus, baseFd({ status: "running" }), () => "Calling resumed", "status")
                  }
                  className="h-9 rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                >
                  {busyId === "status" && pending ? "Resuming…" : "Resume calling"}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || unqueuedCallable === 0}
                onClick={() =>
                  run(addCallableToCampaign, baseFd(), (r) => `Added ${r.added ?? 0} to call list`, "seed")
                }
                className="h-9 rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
              >
                {busyId === "seed" && pending
                  ? "Adding…"
                  : `Add ${unqueuedCallable} callable to call list`}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-[9px] border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              filter === t.key
                ? "border-line-1 bg-bg-2 text-ink-1"
                : "border-transparent text-ink-3 hover:bg-bg-2 hover:text-ink-1"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line-1 text-left text-[11px] uppercase tracking-[0.04em] text-ink-4">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Agency</th>
              <th className="px-4 py-2.5 font-medium text-right">Attended</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              {campaign && <th className="px-4 py-2.5 font-medium">Call</th>}
              {canManage && <th className="px-4 py-2.5 font-medium text-right">Action</th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={5 + (campaign ? 1 : 0) + (canManage ? 1 : 0)}
                  className="px-4 py-8 text-center text-ink-3"
                >
                  No one here yet.
                </td>
              </tr>
            )}
            {shown.map((e) => {
              const isBusy = busyId === e.attendee_id && pending;
              const target = targetsByAttendee[e.attendee_id];
              const targetBusy = target ? busyId === target.id && pending : false;
              return (
                <tr key={e.attendee_id} className="border-b border-line-1 last:border-0">
                  <td className="px-4 py-2.5 text-ink-1">
                    {e.full_name}
                    {e.text_opt_in && (
                      <span className="ml-2 align-middle font-mono text-[10px] text-lime">
                        opted-in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{e.agency ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">
                    {e.attendance_pct == null ? "—" : `${e.attendance_pct}%`}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-2">
                    {e.phone_e164 ? (
                      <>
                        {e.phone_e164}
                        {e.phone_extension && (
                          <span className="text-ink-4"> x{e.phone_extension}</span>
                        )}
                      </>
                    ) : e.phone_invalid ? (
                      <span className="text-rose" title={`Won't dial: ${e.phone}`}>
                        bad number — won&apos;t call
                      </span>
                    ) : (
                      <span className="text-rose">no phone</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.registration ? (
                      <SourceBadge source={e.registration.source} />
                    ) : e.callable ? (
                      <Badge variant="outline">Callable</Badge>
                    ) : (
                      <Badge variant="ghost">Not callable</Badge>
                    )}
                  </td>
                  {campaign && (
                    <td className="px-4 py-2.5">
                      {target ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-ink-2">
                            {CALL_TARGET_STATUS_LABELS[target.status]}
                          </span>
                          {canManage && CALLABLE_STATUSES.includes(target.status) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={targetBusy}
                              onClick={() => callNow(target.id)}
                              className="h-7 rounded-[8px] border-line-1 bg-surface px-2 text-[12px] text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                            >
                              {targetBusy ? "…" : target.attempts > 0 ? "Re-call" : "Call"}
                            </Button>
                          )}
                        </div>
                      ) : e.callable ? (
                        <span className="text-[12px] text-ink-4">not in list</span>
                      ) : (
                        <span className="text-[12px] text-ink-4">—</span>
                      )}
                    </td>
                  )}
                  {canManage && (
                    <td className="px-4 py-2.5 text-right">
                      {e.registration ? (
                        e.registration.source === "manual" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() =>
                              run(
                                unmarkRegistered,
                                baseFd({ attendeeId: e.attendee_id }),
                                () => "Registration removed",
                                e.attendee_id,
                              )
                            }
                            className="rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                          >
                            {isBusy ? "…" : "Undo"}
                          </Button>
                        ) : (
                          <span className="text-[12px] text-ink-4">—</span>
                        )
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy || !e.phone}
                          onClick={() =>
                            run(
                              markRegistered,
                              baseFd({ attendeeId: e.attendee_id }),
                              () => "Marked as registered",
                              e.attendee_id,
                            )
                          }
                          className="rounded-[9px] border-line-1 bg-surface text-ink-2 hover:bg-bg-2 hover:text-ink-1"
                        >
                          {isBusy ? "…" : "Mark registered"}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
