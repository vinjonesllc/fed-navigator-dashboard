"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword } from "./actions";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || !password) return;
    const fd = new FormData(e.currentTarget);
    if (next) fd.set("next", next);

    startTransition(async () => {
      // The action either redirect()s on success (no return) or returns { error }.
      const result = await signInWithPassword(fd);
      if (result?.error) {
        toast.error(result.error);
      }
    });
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
      {error === "no-role" && (
        <p className="rounded border border-amber-bord bg-amber-soft px-3 py-2 text-[13px] text-amber">
          Your account has no role assigned yet. Ask an admin to set one.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink-2">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@agency.gov"
          className="border-line-1 bg-surface"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password" className="text-ink-2">
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-[11.5px] text-ink-3 hover:text-ink-1 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-line-1 bg-surface"
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full rounded-[9px] border border-[oklch(0.10_0.01_260)] bg-[oklch(0.18_0.02_260)] text-white shadow-[0_1px_0_oklch(1_0_0_/_0.15)_inset,0_6px_18px_oklch(0.20_0.02_260/0.20)] hover:bg-[oklch(0.12_0.02_260)]"
      >
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
