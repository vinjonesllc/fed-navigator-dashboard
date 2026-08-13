"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const RED = "oklch(0.60 0.23 27)";

/**
 * Shown only while the campaign is actively calling. Flashes a red "live" dot
 * and re-pulls the server data (call results + call list) on an interval via
 * router.refresh(), so the numbers update without a manual reload. Renders
 * nothing — and runs no timer — when calling isn't in progress.
 */
export function LiveIndicator({
  active,
  intervalMs = 60_000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  if (!active) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title="Calling in progress — updating every 60s"
    >
      <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
        <span
          className="fp-live-ping absolute inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: RED, animation: "fp-ping 1.4s cubic-bezier(0,0,0.2,1) infinite" }}
        />
        <span
          className="fp-live-blink relative inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: RED, animation: "fp-blink 1.2s ease-in-out infinite" }}
        />
      </span>
      <span
        className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: RED }}
      >
        Live
      </span>
    </span>
  );
}
