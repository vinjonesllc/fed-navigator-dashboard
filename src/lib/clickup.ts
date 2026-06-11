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

export async function postClickUpMessage(content: string): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN;
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID;
  const channelId = process.env.CLICKUP_DM_CHANNEL_ID;
  if (!token || !workspaceId || !channelId) {
    throw new Error(
      "ClickUp env not set (CLICKUP_API_TOKEN / CLICKUP_WORKSPACE_ID / CLICKUP_DM_CHANNEL_ID)",
    );
  }

  const res = await fetch(
    `${CLICKUP_BASE}/workspaces/${workspaceId}/chat/channels/${channelId}/messages`,
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
