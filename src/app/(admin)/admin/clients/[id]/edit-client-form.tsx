"use client";

import { useState, useTransition } from "react";
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
} from "@/lib/supabase/types";

const NONE = "__none";
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h % 12 || 12}${h < 12 ? "am" : "pm"}`,
}));

export function EditClientForm({
  client,
  sheetTabs,
}: {
  client: Client;
  sheetTabs: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [brand, setBrand] = useState<ClientBrand>(client.brand ?? "Fed Pilot");
  const [nextDate, setNextDate] = useState<string>(client.next_workshop_date ?? "");
  const [nextHour, setNextHour] = useState<string>(
    client.next_workshop_hour !== null && client.next_workshop_hour !== undefined
      ? String(client.next_workshop_hour)
      : NONE,
  );
  const [nextTz, setNextTz] = useState<string>(client.next_workshop_tz ?? NONE);
  const [nextTab, setNextTab] = useState<string>(
    client.next_workshop_registrant_tab ?? NONE,
  );

  // Always offer the currently-saved tab even if tab listing is unavailable.
  const tabOptions = Array.from(
    new Set([
      ...sheetTabs,
      ...(client.next_workshop_registrant_tab ? [client.next_workshop_registrant_tab] : []),
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
          Tints this client&apos;s overview — the header bar and the accent line/strip on
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
        <div>
          <p className="text-sm font-medium">Next workshop</p>
          <p className="text-xs text-muted-foreground">
            Shown on the client&apos;s overview. Leave the date blank to hide it.
          </p>
        </div>

        <input type="hidden" name="next_workshop_date" value={nextDate} />
        <input
          type="hidden"
          name="next_workshop_hour"
          value={nextHour === NONE ? "" : nextHour}
        />
        <input
          type="hidden"
          name="next_workshop_tz"
          value={nextTz === NONE ? "" : nextTz}
        />
        <input
          type="hidden"
          name="next_workshop_registrant_tab"
          value={nextTab === NONE ? "" : nextTab}
        />

        <div className="space-y-2">
          <Label>Date</Label>
          <DatePicker
            value={nextDate}
            onChange={setNextDate}
            placeholder="No next workshop date"
          />
          {nextDate && (
            <button
              type="button"
              onClick={() => setNextDate("")}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear date
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Time</Label>
            <Select value={nextHour} onValueChange={setNextHour}>
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
          <div className="space-y-2">
            <Label>Time zone</Label>
            <Select value={nextTz} onValueChange={setNextTz}>
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

        <div className="space-y-2">
          <Label>Registrants tab</Label>
          <Select value={nextTab} onValueChange={setNextTab}>
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
          <p className="text-xs text-muted-foreground">
            {sheetTabs.length > 0
              ? "Tabs from this client's evaluations sheet. We count its data rows as the current registrant total."
              : "Add an evaluations sheet URL above (and a GOOGLE_API_KEY) to list tabs. The registrant count reads from the selected tab."}
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
