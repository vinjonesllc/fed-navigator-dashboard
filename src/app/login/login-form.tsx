"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSending(true);

    const supabase = createSupabaseBrowserClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const callback = new URL("/auth/callback", appUrl);
    if (next) callback.searchParams.set("next", next);

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback.toString() },
    });

    setSending(false);

    if (err) {
      toast.error(err.message);
      return;
    }
    setSent(true);
    toast.success("Magic link sent. Check your email.");
  }

  if (sent) {
    return (
      <div className="rounded-[14px] border border-line-1 bg-surface p-6 text-center shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
        <p className="font-display font-semibold text-ink-1">Magic link sent.</p>
        <p className="mt-2 text-[13px] text-ink-3">
          Check <span className="font-medium text-ink-1">{email}</span> and click the link to sign in.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-[14px] border border-line-1 bg-surface p-6 shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]"
    >
      {error === "no-client" && (
        <p className="rounded border border-amber-bord bg-amber-soft px-3 py-2 text-[13px] text-amber">
          Your account is not linked to a client. Contact Fed Pilot to be added.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink-2">
          Work email
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@agency.gov"
          className="border-line-1 bg-surface"
        />
      </div>
      <Button
        type="submit"
        disabled={sending || !email}
        className="w-full rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_6px_18px_oklch(0.20_0.02_260/0.20)] hover:bg-[oklch(0.12_0.02_260)]"
      >
        {sending ? "Sending..." : "Send magic link"}
      </Button>
    </form>
  );
}
