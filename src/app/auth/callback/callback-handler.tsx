"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Phase = "starting" | "exchanging" | "bootstrapping" | "redirecting" | "error";

function parseHash(hash: string): Record<string, string> {
  const out: Record<string, string> = {};
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of clean.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

export function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const next = params.get("next") ?? "/";
    const code = params.get("code");
    const errParam = params.get("error_description") ?? params.get("error");

    async function bootstrap() {
      try {
        const res = await fetch("/auth/bootstrap", { method: "POST" });
        if (!res.ok) throw new Error(`bootstrap ${res.status}`);
      } catch (e) {
        console.warn("[auth] bootstrap warning:", e);
      }
    }

    async function go() {
      if (errParam) {
        setPhase("error");
        setMessage(errParam);
        return;
      }

      if (code) {
        setPhase("exchanging");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth] PKCE exchange failed:", error);
          setPhase("error");
          setMessage(error.message);
          return;
        }
      } else if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
        setPhase("exchanging");
        const tokens = parseHash(window.location.hash);
        const access_token = tokens.access_token;
        const refresh_token = tokens.refresh_token;
        if (!access_token || !refresh_token) {
          setPhase("error");
          setMessage("Token missing in callback URL fragment");
          return;
        }
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error("[auth] setSession failed:", error);
          setPhase("error");
          setMessage(error.message);
          return;
        }
      } else {
        setPhase("error");
        setMessage("No code or token in callback URL");
        return;
      }

      setPhase("bootstrapping");
      await bootstrap();

      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }

      setPhase("redirecting");
      // Hard navigation so the destination's RSC pass sees the freshly-set cookies.
      if (typeof window !== "undefined") {
        window.location.href = next;
      } else {
        router.replace(next);
      }
    }

    void go();
  }, [params, router]);

  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <div className="text-center text-sm">
        {phase === "starting" && <p className="text-muted-foreground">Starting…</p>}
        {phase === "exchanging" && (
          <p className="text-muted-foreground">Verifying your sign-in link…</p>
        )}
        {phase === "bootstrapping" && (
          <p className="text-muted-foreground">Setting up your account…</p>
        )}
        {phase === "redirecting" && <p className="text-muted-foreground">Redirecting…</p>}
        {phase === "error" && (
          <div className="space-y-2">
            <p className="font-medium text-destructive">Sign-in failed.</p>
            <p className="text-muted-foreground">{message}</p>
            <a href="/login" className="inline-block underline">
              Back to login
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
