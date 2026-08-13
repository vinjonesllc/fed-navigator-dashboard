"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const RED = "oklch(0.60 0.23 27)";

/**
 * Live count-up of how long the campaign has been working the list. Ticks every
 * second while running; when stopped, freezes at (stoppedAt − startedAt).
 * Initializes from startedAt so server and client first-render match (no
 * hydration mismatch), then jumps to real elapsed on mount.
 */
export function CampaignTimer({
  startedAt,
  running,
  stoppedAt,
}: {
  startedAt: string;
  running: boolean;
  stoppedAt?: string | null;
}) {
  const start = Date.parse(startedAt);
  // Init from `start` so server/client first render match (no hydration
  // mismatch); the timeout below jumps to real elapsed on the next tick.
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!running) return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      id = setTimeout(tick, 1000);
    };
    id = setTimeout(tick, 0); // async first tick — avoids synchronous setState in the effect body
    return () => clearTimeout(id);
  }, [running]);

  const end = running ? now : stoppedAt ? Date.parse(stoppedAt) : now;
  const secs = Number.isFinite(start) ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const fmt =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return (
    <span className="tabular-nums" title="Time the campaign has been working the call list">
      {fmt}
    </span>
  );
}

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
