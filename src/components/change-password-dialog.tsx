"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Lets a signed-in user change their own password. The trigger is the header
 * identity chip (email + role + initials). The current password is verified via
 * a re-auth before the new one is set, so an unattended session can't be hijacked.
 */
export function ChangePasswordDialog({
  email,
  roleLabel,
  initials,
}: {
  email: string;
  roleLabel: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords don't match");
      return;
    }
    if (next === current) {
      toast.error("New password must be different from the current one");
      return;
    }

    setSaving(true);
    const supabase = createSupabaseBrowserClient();

    // Verify the current password by re-authenticating first.
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (authErr) {
      setSaving(false);
      toast.error("Current password is incorrect");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          title="Change password"
          className="flex w-full items-center gap-2.5 rounded-full border border-line-1 bg-surface py-1 pl-1.5 pr-3 text-left transition hover:bg-bg-2"
        >
          <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep font-display text-[11px] font-bold text-white">
            {initials || "?"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-ink-2">{email}</span>
            <span className="block font-mono text-[9.5px] uppercase tracking-wide text-brand">
              {roleLabel}
            </span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Signed in as {email}. Enter your current password, then choose a new one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current password</Label>
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">New password</Label>
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-[11.5px] text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !current || !next || !confirm}>
              {saving ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
