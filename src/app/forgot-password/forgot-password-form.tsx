"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSending(true);

    const supabase = createSupabaseBrowserClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    });

    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-[14px] border border-line-1 bg-surface p-6 text-center shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
        <p className="font-display font-semibold text-ink-1 dark:text-white">Check your email.</p>
        <p className="mt-2 text-[13px] text-ink-3">
          If <span className="font-medium text-ink-1 dark:text-white">{email}</span> exists,
          a password-reset link is on the way.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-[13px] text-ink-3 underline hover:text-ink-1"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-[14px] border border-line-1 bg-surface p-6 shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]"
    >
      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink-2">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@agency.gov"
          className="border-line-1 bg-surface"
        />
      </div>
      <Button
        type="submit"
        disabled={sending || !email}
        className="w-full rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_6px_18px_oklch(0.20_0.02_260/0.20)] hover:bg-[oklch(0.12_0.02_260)]"
      >
        {sending ? "Sending..." : "Send reset link"}
      </Button>
      <p className="text-center text-[12.5px] text-ink-3">
        <Link href="/login" className="hover:text-ink-1 hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
