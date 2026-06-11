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
import { classifyCsv, CSV_KIND_LABEL, type CsvKind } from "@/lib/csv/classify";

type ClientOption = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  next_workshop_date?: string | null;
};

const PRESENTERS = ["Dionne Belk", "Kevin Jones"];
const AC_BRAND = "Fed Pilot";

type DetectedFiles = Partial<Record<CsvKind, File>>;
type UnknownFile = { name: string };

// Strictly after today (local). Mirrors isFutureWorkshopDate on the server.
function isFutureDate(date: string | null | undefined): boolean {
  if (!date) return false;
  const iso = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso > today;
}

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
  const [detected, setDetected] = useState<DetectedFiles>({});
  const [unknownFiles, setUnknownFiles] = useState<UnknownFile[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [presenter, setPresenter] = useState<string>("");
  const [workshopDate, setWorkshopDate] = useState<string>("");
  const [uploadToAc, setUploadToAc] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const isFedPilot = selectedClient?.brand === AC_BRAND;
  const hasFutureNext = isFutureDate(selectedClient?.next_workshop_date);

  const attendeeFile = detected.attendees ?? null;
  const qaFile = detected.qa ?? null;
  const chatFile = detected.chat ?? null;

  async function onFilesChosen(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    setClassifying(true);
    try {
      // Read just enough of each file to read its header row, then classify.
      const next: DetectedFiles = { ...detected };
      const unknown: UnknownFile[] = [];
      const dupes: string[] = [];

      for (const file of files) {
        // 64KB is far more than a header row but cheap; classifyCsv only reads
        // the first line.
        const sample = await file.slice(0, 64 * 1024).text();
        const kind = classifyCsv(sample);
        if (!kind) {
          unknown.push({ name: file.name });
          continue;
        }
        if (next[kind]) dupes.push(`${CSV_KIND_LABEL[kind]} (kept ${next[kind]!.name})`);
        else next[kind] = file;
      }

      setDetected(next);
      setUnknownFiles(unknown);

      const recognized = files.length - unknown.length - dupes.length;
      if (recognized > 0) {
        toast.success(
          `Detected ${recognized} file${recognized === 1 ? "" : "s"}: ` +
            (["attendees", "qa", "chat"] as CsvKind[])
              .filter((k) => next[k])
              .map((k) => CSV_KIND_LABEL[k])
              .join(", "),
        );
      }
      if (dupes.length > 0) {
        toast.warning(`Ignored duplicate: ${dupes.join("; ")}`);
      }
      if (unknown.length > 0) {
        toast.error(
          `Couldn't recognize ${unknown.length} file${unknown.length === 1 ? "" : "s"}: ` +
            unknown.map((u) => u.name).join(", "),
        );
      }
    } finally {
      setClassifying(false);
    }
  }

  function clearFiles() {
    setDetected({});
    setUnknownFiles([]);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Pick an advisor");
      return;
    }
    if (!attendeeFile) {
      toast.error("Attendees CSV is required (Q&A and chat transcript are optional)");
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
    if (qaFile) fd.set("qaFile", qaFile);
    else fd.delete("qaFile");
    fd.set("presenter", presenter);
    fd.set("workshopDate", workshopDate);
    fd.set("uploadToAc", isFedPilot && uploadToAc ? "true" : "false");

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
        if (result.ac?.enabled) {
          toast.success(
            `ActiveCampaign: uploading ${result.ac.requested} contact${result.ac.requested === 1 ? "" : "s"} in the background.`,
          );
          if (result.ac.missingFields.length > 0) {
            toast.warning(
              `AC fields not found (skipped — create them in ActiveCampaign): ${result.ac.missingFields.join(", ")}`,
              { duration: 12000 },
            );
          }
          if (result.ac.automationMissing) {
            toast.warning(
              'AC automation "FP-ZOOM EVENT MASTER (POST-EVENT)" not found — contacts were uploaded but not enrolled.',
              { duration: 12000 },
            );
          }
          if (result.ac.listMissing) {
            toast.warning(
              'AC list "Federal Employees" not found — contacts were uploaded but not subscribed.',
              { duration: 12000 },
            );
          }
        }
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
          <Label>Advisor</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick an advisor" />
            </SelectTrigger>
            <SelectContent>
              {clients.length === 0 && (
                <SelectItem value="__empty" disabled>
                  No advisors — create one first
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

      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <Input id="topic" name="topic" placeholder="TSP, FERS, etc." />
        <p className="text-xs text-muted-foreground">
          Duration is detected automatically from the attendee data — no need to enter it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">
            Workshop CSV exports{" "}
            <span className="font-normal text-muted-foreground">
              (drop in your 1–3 files at once — we detect which is which)
            </span>
          </p>
          {(attendeeFile || qaFile || chatFile || unknownFiles.length > 0) && (
            <button
              type="button"
              onClick={clearFiles}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="csvFiles" className="text-xs uppercase tracking-wide">
            Choose files
          </Label>
          <Input
            id="csvFiles"
            type="file"
            accept=".csv,text/csv"
            multiple
            className="w-fit min-w-fit"
            onChange={(e) => {
              void onFilesChosen(e.target.files);
              // Reset so re-selecting the same file fires onChange again.
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">
            Attendees required · Q&amp;A and chat transcript optional · any order
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { kind: "attendees", required: true },
              { kind: "qa", required: false },
              { kind: "chat", required: false },
            ] as { kind: CsvKind; required: boolean }[]
          ).map(({ kind, required }) => {
            const file = detected[kind];
            return (
              <div
                key={kind}
                className={`rounded-md border px-3 py-2 text-xs ${
                  file
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-dashed border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium uppercase tracking-wide">
                  <span aria-hidden>{file ? "✓" : "○"}</span>
                  {CSV_KIND_LABEL[kind]}
                  {!required && (
                    <span className="normal-case text-muted-foreground">(optional)</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-muted-foreground" title={file?.name}>
                  {file ? file.name : classifying ? "detecting…" : "not detected"}
                </p>
              </div>
            );
          })}
        </div>

        {unknownFiles.length > 0 && (
          <p className="text-xs text-destructive">
            Unrecognized (ignored): {unknownFiles.map((u) => u.name).join(", ")}
          </p>
        )}
      </div>

      {isFedPilot && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={uploadToAc}
              onChange={(e) => setUploadToAc(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">Upload to ActiveCampaign?</span>
              <span className="block text-xs text-muted-foreground">
                Create/update each attendee as a contact (name, email, phone, agency, age,
                workshop date, &amp; next-workshop info) and tag live attendees{" "}
                <code>FP-Attended</code>.
              </span>
            </span>
          </label>

          {uploadToAc && !hasFutureNext && (
            <p className="rounded border border-amber-bord bg-amber-soft px-3 py-2 text-[13px] text-amber">
              ⚠ This advisor has no <b>future</b> next-workshop date set (it&apos;s missing or set
              to today). The <b>Next Workshop</b> fields will be left blank in ActiveCampaign. Set a
              future date on the advisor&apos;s Settings page to include them.
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={pending || classifying}>
        {pending ? "Ingesting…" : "Upload and ingest"}
      </Button>
    </form>
  );
}
