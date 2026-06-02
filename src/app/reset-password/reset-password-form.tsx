"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Phase = "loading" | "ready" | "saving" | "saved" | "error";

function parseHash(hash: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of clean.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

export function ResetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // The reset email lands here with tokens in either the query (?code=) or
  // the hash (#access_token=). Establish a session, then let the user set a new password.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    async function establish() {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (window.location.hash.includes("access_token")) {
          const tokens = parseHash(window.location.hash);
          if (!tokens.access_token || !tokens.refresh_token) {
            throw new Error("Reset link is missing tokens");
          }
          const { error } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
          if (error) throw error;
        } else {
          throw new Error("This reset link is invalid or expired");
        }
        // Strip the URL so a refresh doesn't re-trigger.
        window.history.replaceState(null, "", window.location.pathname);
        setPhase("ready");
      } catch (e) {
        setPhase("error");
        setErrorMsg(e instanceof Error ? e.message : "Could not validate reset link");
      }
    }
    void establish();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setPhase("saving");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPhase("ready");
      toast.error(error.message);
      return;
    }
    setPhase("saved");
  }

  if (phase === "loading") {
    return (
      <div className="rounded-[14px] border border-line-1 bg-surface p-6 text-center text-sm text-ink-3 shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
        Validating reset link…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-[14px] border border-line-1 bg-surface p-6 text-center shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
        <p className="font-medium text-destructive">Reset failed.</p>
        <p className="mt-2 text-[13px] text-ink-3">{errorMsg}</p>
        <Link
          href="/forgot-password"
          className="mt-3 inline-block text-[13px] text-ink-3 underline hover:text-ink-1"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (phase === "saved") {
    return (
      <div className="rounded-[14px] border border-line-1 bg-surface p-6 text-center shadow-[0_1px_2px_oklch(0.20_0.02_260/0.04),0_8px_24px_oklch(0.20_0.02_260/0.04)]">
        <p className="font-display font-semibold text-ink-1 dark:text-white">
          Password updated.
        </p>
        <p className="mt-2 text-[13px] text-ink-3">You can now sign in with the new password.</p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[oklch(0.12_0.02_260)]"
        >
          Sign in →
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
        <Label htmlFor="password" className="text-ink-2">
          New password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-line-1 bg-surface"
        />
        <p className="text-[11.5px] text-ink-4">At least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm" className="text-ink-2">
          Confirm new password
        </Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border-line-1 bg-surface"
        />
      </div>
      <Button
        type="submit"
        disabled={phase === "saving" || !password || !confirm}
        className="w-full rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] text-white hover:bg-[oklch(0.12_0.02_260)]"
      >
        {phase === "saving" ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
