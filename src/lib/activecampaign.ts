import "server-only";

/**
 * Minimal ActiveCampaign v3 REST client.
 *
 * Used to tag workshop attendees on ingest (see `uploadCsv`). MCP is an
 * agent-side protocol and cannot be called from production server code, so we
 * talk to ActiveCampaign's HTTP API directly.
 *
 * Requires two env vars (no-ops gracefully if either is missing, so local dev
 * and non-AC deploys are unaffected):
 *   AC_API_URL  e.g. https://youraccount.api-us1.com   (Settings → Developer)
 *   AC_API_KEY  the API key shown on the same page
 *
 * ActiveCampaign rate-limits the API to ~5 requests/second per account, so all
 * requests funnel through a single throttle gate with one retry on HTTP 429.
 */

const API_URL = process.env.AC_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.AC_API_KEY;

const MIN_REQUEST_INTERVAL_MS = 220; // ~4.5 req/s, comfortably under AC's 5/s cap

export function isActiveCampaignConfigured(): boolean {
  return Boolean(API_URL && API_KEY);
}

// Per-instance throttle: never fire two requests closer than the interval.
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_REQUEST_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function acFetch(path: string, init?: RequestInit): Promise<Response> {
  await throttle();
  const doFetch = () =>
    fetch(`${API_URL}/api/3${path}`, {
      ...init,
      headers: {
        "Api-Token": API_KEY!,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  let res = await doFetch();
  if (res.status === 429) {
    // Backed off harder than the gate; wait a full second and retry once.
    await new Promise((r) => setTimeout(r, 1000));
    res = await doFetch();
  }
  return res;
}

async function findContactIdByEmail(email: string): Promise<string | null> {
  const res = await acFetch(`/contacts?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`contact lookup failed (${res.status})`);
  const body = (await res.json()) as { contacts?: { id: string }[] };
  return body.contacts?.[0]?.id ?? null;
}

async function resolveTagId(tagName: string): Promise<string> {
  const res = await acFetch(`/tags?search=${encodeURIComponent(tagName)}`);
  if (!res.ok) throw new Error(`tag lookup failed (${res.status})`);
  const body = (await res.json()) as { tags?: { id: string; tag: string }[] };
  const existing = body.tags?.find((t) => t.tag === tagName);
  if (existing) return existing.id;

  // The tag itself isn't a contact — create it so the integration works out of
  // the box. (Contacts are never created here; we only tag existing ones.)
  const create = await acFetch(`/tags`, {
    method: "POST",
    body: JSON.stringify({ tag: { tag: tagName, tagType: "contact", description: "" } }),
  });
  if (!create.ok) throw new Error(`tag create failed (${create.status})`);
  const created = (await create.json()) as { tag: { id: string } };
  return created.tag.id;
}

async function applyTag(contactId: string, tagId: string): Promise<void> {
  const res = await acFetch(`/contactTags`, {
    method: "POST",
    body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
  });
  // 422 = contact already has the tag; treat as success (idempotent).
  if (!res.ok && res.status !== 422) {
    throw new Error(`tag apply failed (${res.status})`);
  }
}

export type TagResult = {
  configured: boolean;
  requested: number;
  tagged: number;
  notInAc: number;
  errors: number;
};

/**
 * Apply `tagName` to every email that already exists as a contact in
 * ActiveCampaign. Emails not found in AC are skipped (never created). One bad
 * contact never aborts the rest.
 */
export async function tagExistingContacts(
  emails: string[],
  tagName: string,
): Promise<TagResult> {
  const result: TagResult = {
    configured: isActiveCampaignConfigured(),
    requested: emails.length,
    tagged: 0,
    notInAc: 0,
    errors: 0,
  };
  if (!result.configured || emails.length === 0) return result;

  const tagId = await resolveTagId(tagName);

  // De-dupe + normalize so we never tag the same contact twice.
  const unique = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );

  for (const email of unique) {
    try {
      const contactId = await findContactIdByEmail(email);
      if (!contactId) {
        result.notInAc += 1;
        continue;
      }
      await applyTag(contactId, tagId);
      result.tagged += 1;
    } catch (e) {
      result.errors += 1;
      console.error(`[activecampaign] failed to tag ${email}:`, e);
    }
  }

  return result;
}
