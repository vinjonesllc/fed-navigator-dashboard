"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClient } from "../actions";
import type { Client } from "@/lib/supabase/types";

export function EditClientForm({ client }: { client: Client }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          try {
            await updateClient(client.id, fd);
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
        <Label htmlFor="accent_color">Accent color (hex)</Label>
        <Input
          id="accent_color"
          name="accent_color"
          defaultValue={client.accent_color ?? ""}
          placeholder="#0F4C81"
        />
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
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
