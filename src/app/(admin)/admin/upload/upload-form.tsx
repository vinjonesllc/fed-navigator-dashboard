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
import { uploadCsv } from "./actions";

type ClientOption = { id: string; name: string; slug: string };

const PRESENTERS = ["Dionne Belk", "Kevin Jones"];

export function UploadForm({
  clients,
  initialClientId,
}: {
  clients: ClientOption[];
  initialClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [attendeeFile, setAttendeeFile] = useState<File | null>(null);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [qaFile, setQaFile] = useState<File | null>(null);
  const [presenter, setPresenter] = useState<string>("");
  const [workshopDate, setWorkshopDate] = useState<string>("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Pick a client");
      return;
    }
    if (!attendeeFile || !qaFile) {
      toast.error("Attendees and Q&A CSVs are required (chat transcript is optional)");
      return;
    }
    if (!workshopDate) {
      toast.error("Pick a workshop date");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("clientId", clientId);
    fd.set("attendeeFile", attendeeFile);
    if (chatFile) fd.set("chatFile", chatFile);
    else fd.delete("chatFile");
    fd.set("qaFile", qaFile);
    fd.set("presenter", presenter);
    fd.set("workshopDate", workshopDate);

    const pendingToast = toast.loading(
      "Ingesting attendees & Q&A… analyzing transcripts (this takes ~15-30s).",
    );
    startTransition(async () => {
      try {
        const result = await uploadCsv(fd);
        toast.success(
          `Ingested ${result.inserted} attendees (${result.attended} live), ${result.chatRows} chats, ${result.qaRows} Q&A.`,
          { id: pendingToast },
        );
        router.push(`/admin/clients/${clientId}/workshops/${result.workshopId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed", { id: pendingToast });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.length === 0 && (
                <SelectItem value="__empty" disabled>
                  No clients — create one first
                </SelectItem>
              )}
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Workshop date</Label>
          <DatePicker value={workshopDate} onChange={setWorkshopDate} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            placeholder="Federal Retirement Benefits Workshop"
          />
        </div>
        <div className="space-y-2">
          <Label>Presenter</Label>
          <Select value={presenter} onValueChange={setPresenter}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a presenter" />
            </SelectTrigger>
            <SelectContent>
              {PRESENTERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" name="topic" placeholder="TSP, FERS, etc." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduledMinutes">Scheduled minutes</Label>
          <Input
            id="scheduledMinutes"
            name="scheduledMinutes"
            type="number"
            min={5}
            max={720}
            defaultValue={180}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">
          Workshop CSV exports{" "}
          <span className="font-normal text-muted-foreground">
            (Attendees &amp; Q&amp;A required — chat transcript optional)
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="attendeeFile" className="text-xs uppercase tracking-wide">
              Attendees
            </Label>
            <Input
              id="attendeeFile"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => setAttendeeFile(e.target.files?.[0] ?? null)}
            />
            {attendeeFile && (
              <p className="text-xs text-muted-foreground">
                {attendeeFile.name}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="chatFile" className="text-xs uppercase tracking-wide">
              Chat transcript{" "}
              <span className="normal-case text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="chatFile"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setChatFile(e.target.files?.[0] ?? null)}
            />
            {chatFile && (
              <p className="text-xs text-muted-foreground">{chatFile.name}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="qaFile" className="text-xs uppercase tracking-wide">
              Q&A
            </Label>
            <Input
              id="qaFile"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => setQaFile(e.target.files?.[0] ?? null)}
            />
            {qaFile && <p className="text-xs text-muted-foreground">{qaFile.name}</p>}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Ingesting…" : "Upload and ingest"}
      </Button>
    </form>
  );
}
