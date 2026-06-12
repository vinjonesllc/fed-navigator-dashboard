import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/webhook-verify";
import { postClickUpMessage } from "@/lib/clickup";

// TEMPORARY diagnostic — reports what the deployed runtime sees for ClickUp env
// (lengths/non-secret ids only) and the live result of an actual post. Secret-
// gated with the Vapi webhook secret. REMOVE after debugging.
export async function GET(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const got = request.headers.get("x-debug-secret");
  if (!secret || !got || !timingSafeEqualStr(got, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const env = {
    CLICKUP_API_TOKEN_len: (process.env.CLICKUP_API_TOKEN || "").length,
    CLICKUP_API_TOKEN_prefix: (process.env.CLICKUP_API_TOKEN || "").slice(0, 4),
    CLICKUP_WORKSPACE_ID: process.env.CLICKUP_WORKSPACE_ID || null,
    CLICKUP_DM_CHANNEL_ID: process.env.CLICKUP_DM_CHANNEL_ID || null,
  };

  let postResult: string;
  try {
    await postClickUpMessage("🔧 production debug ping — safe to ignore");
    postResult = "ok";
  } catch (e) {
    postResult = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ env, postResult });
}
