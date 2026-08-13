import "server-only";

// ----------------------------------------------------------------------------
// ClickUp notifier — DMs the user when the AI books someone into Part 2.
//
// Requires:
//   CLICKUP_API_TOKEN      — personal API token (Settings → Apps)
//   CLICKUP_WORKSPACE_ID   — numeric workspace id (digits in the app URL)
//   CLICKUP_DM_CHANNEL_ID  — the 1:1 DM channel id to post into
//                            (resolved/test-sent when we wire the token)
// ----------------------------------------------------------------------------

const CLICKUP_BASE = "https://api.clickup.com/api/v3";

export async function postClickUpMessage(content: string, channelId?: string): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN;
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID;
  const chan = channelId || process.env.CLICKUP_DM_CHANNEL_ID;
  if (!token || !workspaceId || !chan) {
    throw new Error(
      "ClickUp env not set (CLICKUP_API_TOKEN / CLICKUP_WORKSPACE_ID / CLICKUP_DM_CHANNEL_ID)",
    );
  }

  const url = `${CLICKUP_BASE}/workspaces/${workspaceId}/chat/channels/${chan}/messages`;
  const body = JSON.stringify({ type: "message", content_format: "text/md", content });

  // Retry transient failures (429 rate limit, 5xx) with short backoff — a burst
  // of near-simultaneous bookings was the failure mode that dropped alerts. A
  // 4xx other than 429 is a real error and rethrows immediately (no point
  // retrying a bad request). The durable ledger + reconciler is still the
  // backstop if every attempt here fails.
  const MAX_ATTEMPTS = 3;
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return;
    lastErr = `${res.status} ${await res.text()}`;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) break;
    await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  throw new Error(`ClickUp message → ${lastErr}`);
}

/** Format + send the "someone booked Part 2" alert. */
export async function notifyPart2Booking(args: {
  name: string;
  agency: string | null;
  workshopTitle: string;
  slotTime: string | null;
  source: "ai_call" | "self_serve" | "manual" | "reconciled";
}): Promise<void> {
  const when = args.slotTime
    ? new Date(args.slotTime).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
    : "time TBD";
  const how =
    args.source === "ai_call"
      ? "via AI call"
      : args.source === "self_serve"
        ? "self-registered"
        : args.source === "reconciled"
          ? "self-registered · recovered"
          : "marked manually";
  const lines = [
    `✅ *Part 2 booked* (${how})`,
    `• ${args.name}${args.agency ? ` — ${args.agency}` : ""}`,
    `• Workshop: ${args.workshopTitle}`,
    `• Time: ${when}`,
  ];
  await postClickUpMessage(lines.join("\n"));
}

/** Alert the Part 2 calling group that someone needs a human callback — they
 *  asked to be called back / were busy / wanted a person, or the call dropped
 *  early. Posts to CLICKUP_HANDOFF_CHANNEL_ID (falls back to the booking channel). */
export async function notifyPart2Handoff(args: {
  name: string | null;
  phone: string | null;
  agency: string | null;
  reason: string;
}): Promise<void> {
  const lines = [
    `📞 *Part 2 — needs a human callback*`,
    `• ${args.name || "(name unknown)"}${args.agency ? ` — ${args.agency}` : ""}`,
    `• Phone: ${args.phone || "n/a"}`,
    `• Why: ${args.reason}`,
  ];
  await postClickUpMessage(
    lines.join("\n"),
    process.env.CLICKUP_HANDOFF_CHANNEL_ID || process.env.CLICKUP_DM_CHANNEL_ID,
  );
}

/** Flag a call the agent felt was "off" or couldn't cleanly categorize, so a
 *  human can review the transcript and we can refine the rules. */
export async function notifyPart2Review(args: {
  name: string | null;
  phone: string | null;
  agency: string | null;
  status: string;
  reason: string | null;
}): Promise<void> {
  const lines = [
    `🔎 *Part 2 — call to review* (logged as ${args.status})`,
    `• ${args.name || "(name unknown)"}${args.agency ? ` — ${args.agency}` : ""}`,
    `• Phone: ${args.phone || "n/a"}`,
    `• What felt off: ${args.reason || "(agent didn't say)"}`,
  ];
  await postClickUpMessage(
    lines.join("\n"),
    process.env.CLICKUP_HANDOFF_CHANNEL_ID || process.env.CLICKUP_DM_CHANNEL_ID,
  );
}
