"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatWorkshopDate } from "@/lib/format-date";

type WorkshopOption = { id: string; title: string; workshop_date: string };

const PRESETS = [
  { value: "hot", label: "Hot leads — text opt-in AND ≥50% duration" },
  { value: "engaged", label: "Engaged attendees — any chat/question/poll" },
  { value: "live", label: "All live attendees" },
  { value: "noshow", label: "Registered no-shows" },
  { value: "all", label: "All attendees" },
];

export function LeadsForm({ workshops }: { workshops: WorkshopOption[] }) {
  const [workshopId, setWorkshopId] = useState<string>(workshops[0]?.id ?? "");
  const [preset, setPreset] = useState<string>("hot");

  const href = workshopId
    ? `/api/leads/export?workshopId=${encodeURIComponent(workshopId)}&preset=${preset}`
    : "#";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Workshop</Label>
        <Select value={workshopId} onValueChange={setWorkshopId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a workshop" />
          </SelectTrigger>
          <SelectContent>
            {workshops.length === 0 && (
              <SelectItem value="__empty" disabled>
                No workshops yet
              </SelectItem>
            )}
            {workshops.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {formatWorkshopDate(w.workshop_date)} · {w.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Preset</Label>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Button asChild disabled={!workshopId}>
          <a href={href}>Download CSV</a>
        </Button>
      </div>
    </div>
  );
}
