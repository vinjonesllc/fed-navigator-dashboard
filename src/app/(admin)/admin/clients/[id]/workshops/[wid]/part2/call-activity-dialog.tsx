"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CALL_ACTIVITY_LABELS, HUMAN_CALL_ACTIONS } from "@/lib/supabase/types";
import { getAttendeeActivities, recordActivity } from "./actions";

type Activity = {
  id: string;
  action: string;
  notes: string | null;
  actor_name: string;
  created_at: string;
};

export function CallActivityDialog({
  open,
  onOpenChange,
  clientId,
  workshopId,
  attendeeId,
  attendeeName,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  workshopId: string;
  attendeeId: string | null;
  attendeeName: string;
  onRecorded: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true); // we fetch on open; start in loading
  const [activities, setActivities] = useState<Activity[]>([]);
  const [action, setAction] = useState<string>(HUMAN_CALL_ACTIONS[0]);
  const [notes, setNotes] = useState("");

  function fd(extra: Record<string, string>) {
    const f = new FormData();
    f.set("clientId", clientId);
    f.set("attendeeId", attendeeId ?? "");
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  }

  async function load() {
    if (!attendeeId) return;
    try {
      const r = await getAttendeeActivities(fd({}));
      setActivities(((r as { activities?: Activity[] }).activities ?? []) as Activity[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && attendeeId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attendeeId]);

  function save() {
    if (!attendeeId) return;
    startTransition(async () => {
      try {
        const r = await recordActivity(fd({ workshopId, action, notes }));
        if (r?.error) {
          toast.error(r.error);
          return;
        }
        toast.success("Action recorded");
        setNotes("");
        await load();
        onRecorded();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to record");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{attendeeName}</DialogTitle>
          <DialogDescription>Record a call action, and see the full history below.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-start">
            <div className="space-y-1">
              <Label className="text-[11px] text-ink-3">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HUMAN_CALL_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {CALL_ACTIVITY_LABELS[a] ?? a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-ink-3">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={save} className="rounded-[9px]">
            {pending ? "Saving…" : "Save action"}
          </Button>
        </div>

        <div className="mt-1 border-t border-line-1 pt-3">
          <div className="mb-2 text-[12px] font-medium text-ink-2">History</div>
          {loading ? (
            <div className="text-[13px] text-ink-3">Loading…</div>
          ) : activities.length === 0 ? (
            <div className="text-[13px] text-ink-3">No actions recorded yet.</div>
          ) : (
            <ul className="max-h-[320px] space-y-2 overflow-y-auto">
              {activities.map((a) => (
                <li key={a.id} className="rounded-md border border-line-1 px-3 py-2 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-1">
                      {CALL_ACTIVITY_LABELS[a.action] ?? a.action}
                    </span>
                    <span className="text-[11px] text-ink-4">
                      {new Date(a.created_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-3">by {a.actor_name}</div>
                  {a.notes && <div className="mt-1 whitespace-pre-wrap text-ink-2">{a.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
