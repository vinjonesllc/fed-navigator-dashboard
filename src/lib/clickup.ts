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

  const res = await fetch(
    `${CLICKUP_BASE}/workspaces/${workspaceId}/chat/channels/${chan}/messages`,
    {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", content_format: "text/md", content }),
    },
  );
  if (!res.ok) {
    throw new Error(`ClickUp message → ${res.status} ${await res.text()}`);
  }
}

/** Format + send the "someone booked Part 2" alert. */
export async function notifyPart2Booking(args: {
  name: string;
  agency: string | null;
  workshopTitle: string;
  slotTime: string | null;
  source: "ai_call" | "self_serve" | "manual";
}): Promise<void> {
  const when = args.slotTime
    ? new Date(args.slotTime).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
    : "time TBD";
  const how =
    args.source === "ai_call" ? "via AI call" : args.source === "self_serve" ? "self-registered" : "marked manually";
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
