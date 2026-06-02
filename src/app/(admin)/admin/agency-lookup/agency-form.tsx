"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertAgency } from "./actions";

export function AgencyForm() {
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await upsertAgency(fd);
        toast.success("Saved");
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="domain">Domain</Label>
        <Input id="domain" name="domain" placeholder="dhs.gov" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agency_name">Agency name</Label>
        <Input
          id="agency_name"
          name="agency_name"
          placeholder="Department of Homeland Security"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agency_short">Short label</Label>
        <Input id="agency_short" name="agency_short" placeholder="DHS" />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
