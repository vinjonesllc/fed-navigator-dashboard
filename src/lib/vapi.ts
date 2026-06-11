import "server-only";

// Thin server-side Vapi REST client. Outbound calls + assistant config are
// driven from here; the browser never sees the private key.
const VAPI_BASE = "https://api.vapi.ai";

function vapiKey(): string {
  const k = process.env.VAPI_PRIVATE_KEY;
  if (!k) throw new Error("VAPI_PRIVATE_KEY is not set");
  return k;
}

export async function vapiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${vapiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi ${init?.method ?? "GET"} ${path} → ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export type VapiCall = { id: string; status?: string };

/** Place an outbound call from the Fed Pilot number to a customer, using an
 *  inline assistant config. `metadata` round-trips back on every webhook so we
 *  can tie events to the originating call_target. */
export async function placeOutboundCall(args: {
  customerNumber: string;
  assistant: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<VapiCall> {
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("VAPI_PHONE_NUMBER_ID is not set");
  return vapiFetch<VapiCall>("/call", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId,
      customer: { number: args.customerNumber },
      assistant: args.assistant,
      metadata: args.metadata ?? {},
    }),
  });
}
