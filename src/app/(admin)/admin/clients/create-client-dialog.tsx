"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLIENT_BRANDS, type ClientBrand } from "@/lib/supabase/types";
import { createClient } from "./actions";

export function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [brand, setBrand] = useState<ClientBrand>("Fed Pilot");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New client</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create client</DialogTitle>
          <DialogDescription>
            An organization that hosts workshops with Fed Navigator.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            startTransition(async () => {
              try {
                const res = await createClient(fd);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Client created");
                setBrand("Fed Pilot");
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to create");
              }
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="National Speakers Association" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (optional)</Label>
            <Input id="slug" name="slug" placeholder="auto-generated from name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_email">Contact email</Label>
            <Input id="contact_email" name="contact_email" type="email" placeholder="hr@agency.gov" />
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
