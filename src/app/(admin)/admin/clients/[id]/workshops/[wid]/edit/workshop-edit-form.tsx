"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/date-picker";
import { updateWorkshop } from "@/app/(admin)/admin/upload/actions";
import type { Workshop } from "@/lib/supabase/types";

const PRESENTERS = ["Dionne Belk", "Kevin Jones"];

export function WorkshopEditForm({
  workshop,
  clientName,
  backHref,
}: {
  workshop: Workshop;
  clientName: string;
  backHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [workshopDate, setWorkshopDate] = useState<string>(workshop.workshop_date ?? "");
  const [presenter, setPresenter] = useState<string>(workshop.presenter ?? "");

  // Include the current presenter as an option even if it's not in the canned
  // list, so editing a workshop never silently drops an existing value.
  const presenterOptions = Array.from(
    new Set([...PRESENTERS, ...(workshop.presenter ? [workshop.presenter] : [])]),
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workshopDate) {
      toast.error("Pick a workshop date");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("workshopId", workshop.id);
    fd.set("workshopDate", workshopDate);
    fd.set("presenter", presenter);

    const pendingToast = toast.loading("Saving workshop…");
    startTransition(async () => {
      try {
        await updateWorkshop(fd);
        toast.success("Workshop updated", { id: pendingToast });
        router.push(backHref);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed", { id: pendingToast });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Advisor</Label>
        <Input value={clientName} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          The advisor can&apos;t be changed. To move a workshop, delete and re-upload it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={workshop.title}
            placeholder="Federal Retirement Benefits Workshop"
          />
        </div>
        <div className="space-y-2">
          <Label>Workshop date</Label>
          <DatePicker value={workshopDate} onChange={setWorkshopDate} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Presenter</Label>
          <Select value={presenter} onValueChange={setPresenter}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a presenter" />
            </SelectTrigger>
            <SelectContent>
              {presenterOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Input
            id="topic"
            name="topic"
            defaultValue={workshop.topic ?? ""}
            placeholder="TSP, FERS, etc."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="scheduledMinutes">Scheduled minutes</Label>
        <Input
          id="scheduledMinutes"
          name="scheduledMinutes"
          type="number"
          min={5}
          max={720}
          required
          defaultValue={workshop.scheduled_minutes ?? 180}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={workshop.notes ?? ""} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(backHref)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
