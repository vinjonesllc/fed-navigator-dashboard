"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/date-picker";
import { updateClient } from "../actions";
import {
  CLIENT_BRANDS,
  NEXT_WORKSHOP_TIMEZONES,
  type Client,
  type ClientBrand,
  type NextWorkshopEntry,
} from "@/lib/supabase/types";

const NONE = "__none";
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h % 12 || 12}${h < 12 ? "am" : "pm"}`,
}));

// A next-workshop row in local form state. `_key` is a stable React key only
// (stripped before saving).
type Row = NextWorkshopEntry & { _key: number };

function toRow(e: Partial<NextWorkshopEntry>, key: number): Row {
  return {
    _key: key,
    date: e.date ?? "",
    hour: e.hour ?? null,
    tz: e.tz ?? null,
    registrant_tab: e.registrant_tab ?? null,
    reg_url: e.reg_url ?? null,
  };
}

export function EditClientForm({
  client,
  sheetTabs,
}: {
  client: Client;
  sheetTabs: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [brand, setBrand] = useState<ClientBrand>(client.brand ?? "Fed Pilot");

  // Initial rows keyed by position; the ref hands out fresh keys for added rows.
  const initial = client.next_workshops ?? [];
  const keyRef = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((e, i) => toRow(e, i)));

  const updateRow = (key: number, patch: Partial<NextWorkshopEntry>) =>
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, toRow({}, keyRef.current++)]);
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r._key !== key));

  // Only rows with a date are saved; strip the local-only _key.
  const serialized = JSON.stringify(
    rows
      .filter((r) => r.date)
      .map((r) => ({
        date: r.date,
        hour: r.hour,
        tz: r.tz,
        registrant_tab: r.registrant_tab,
        reg_url: r.reg_url,
      })),
  );

  // Always offer any currently-saved tabs even if live tab listing is unavailable.
  const tabOptions = Array.from(
    new Set([
      ...sheetTabs,
      ...rows.map((r) => r.registrant_tab).filter((t): t is string => !!t),
    ]),
  );

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          try {
            const res = await updateClient(client.id, fd);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("Saved");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={client.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" defaultValue={client.slug} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_email">Contact email</Label>
        <Input
          id="contact_email"
          name="contact_email"
          type="email"
          defaultValue={client.contact_email ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label>Brand</Label>
        <input type="hidden" name="brand" value={brand} />
        <Select value={brand} onValueChange={(v) => setBrand(v as ClientBrand)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLIENT_BRANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="accent_color">Accent color (hex)</Label>
        <Input
          id="accent_color"
          name="accent_color"
          defaultValue={client.accent_color ?? ""}
          placeholder="#0F4C81"
        />
        <p className="text-xs text-muted-foreground">
          Tints this advisor&apos;s overview — the header bar and the accent line/strip on
          each card. Leave blank for the default.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="eval_sheet_url">Evaluations Google Sheet URL</Label>
        <Input
          id="eval_sheet_url"
          name="eval_sheet_url"
          type="url"
          defaultValue={client.eval_sheet_url ?? ""}
          placeholder="https://docs.google.com/spreadsheets/d/…"
        />
        <p className="text-xs text-muted-foreground">
          Share the sheet as &quot;Anyone with the link can view&quot;. Must include a tab named
          <code className="mx-1">EVAL</code>or<code className="ml-1">EVALUATION</code>. We
          pull top attendee comments dated to the workshop and feature them on the report.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-line-1 bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Next workshops</p>
            <p className="text-xs text-muted-foreground">
              Shown on the advisor&apos;s overview, one tile each. The soonest future one
              also feeds ActiveCampaign and the AI calls.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            + Add workshop
          </Button>
        </div>

        <input type="hidden" name="next_workshops" value={serialized} />

        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No upcoming workshops. Click “Add workshop” to schedule one.
          </p>
        )}

        {rows.map((row, i) => (
          <div
            key={row._key}
            className="space-y-3 rounded-md border border-line-1 bg-surface p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Workshop {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeRow(row._key)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Remove
              </button>
            </div>

            {/* Row 1: date · time · time zone */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <DatePicker
                  value={row.date}
                  onChange={(d) => updateRow(row._key, { date: d })}
                  onClear={() => updateRow(row._key, { date: "" })}
                  placeholder="Pick a date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Time</Label>
                <Select
                  value={row.hour !== null ? String(row.hour) : NONE}
                  onValueChange={(v) =>
                    updateRow(row._key, { hour: v === NONE ? null : Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Hour" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {HOURS.map((h) => (
                      <SelectItem key={h.value} value={h.value}>
                        {h.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Time zone</Label>
                <Select
                  value={row.tz ?? NONE}
                  onValueChange={(v) =>
                    updateRow(row._key, {
                      tz: v === NONE ? null : (v as NextWorkshopEntry["tz"]),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Time zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {NEXT_WORKSHOP_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: registrations tab · registration page URL */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Registrations tab</Label>
                <Select
                  value={row.registrant_tab ?? NONE}
                  onValueChange={(v) =>
                    updateRow(row._key, { registrant_tab: v === NONE ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a tab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {tabOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Registration page URL</Label>
                <Input
                  value={row.reg_url ?? ""}
                  onChange={(e) => updateRow(row._key, { reg_url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          {sheetTabs.length > 0
            ? "Tabs come from this advisor's evaluations sheet; we count a tab's data rows as its registrant total. The registration page URL syncs to ActiveCampaign (%ADVISOR_REG_PAGE_URL%)."
            : "Add an evaluations sheet URL above (and a GOOGLE_API_KEY) to list tabs. The registrant count still reads from a selected tab."}
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
