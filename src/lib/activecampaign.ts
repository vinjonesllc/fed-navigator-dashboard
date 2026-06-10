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

// ---------------------------------------------------------------------------
// Contact sync (create-or-update) with custom fields — used by the optional
// "Upload to AC?" flow on Fed Pilot workshop uploads.
// ---------------------------------------------------------------------------

// Exact custom-field titles we write to in ActiveCampaign. Matched against the
// account's field list by title (case-insensitive). We never create fields —
// missing titles are reported back so the user can add them in AC.
export const AC_FIELD_TITLES = {
  oneQuestion: "1 Question",
  age: "Age",
  agency: "Agency",
  advisorNames: "Advisor NAMES",
  workshopDate: "Workshop Date",
  nextWorkshopDate: "Next Workshop Date",
  nextWorkshopText: "Next Workshop (text)",
  nextWorkshopTime: "Next Workshop Time",
  advInfoUrl: "ADV Info URL",
  textUpdates2: "Text Updates 2",
} as const;

type FieldInfo = { id: string; type: string };
export type AcFieldMap = Map<string, FieldInfo>;

const titleKey = (t: string) => t.trim().toLowerCase();

/**
 * Map every custom field title → {id, type}. Paginated (AC caps at 100/page).
 * Keyed by lowercased/trimmed title.
 */
export async function getCustomFieldMap(): Promise<AcFieldMap> {
  const map: AcFieldMap = new Map();
  let offset = 0;
  for (;;) {
    const res = await acFetch(`/fields?limit=100&offset=${offset}`);
    if (!res.ok) throw new Error(`field list failed (${res.status})`);
    const body = (await res.json()) as {
      fields?: { id: string; title: string; type: string }[];
      meta?: { total?: string };
    };
    const fields = body.fields ?? [];
    for (const f of fields) map.set(titleKey(f.title), { id: f.id, type: f.type });
    offset += fields.length;
    const total = Number(body.meta?.total ?? fields.length);
    if (fields.length === 0 || offset >= total) break;
  }
  return map;
}

/** Of the given titles, which ones are NOT present in the account. */
export function missingFieldTitles(map: AcFieldMap, titles: string[]): string[] {
  return titles.filter((t) => !map.has(titleKey(t)));
}

export type AcContactInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  /** Custom fields keyed by their AC title. Empty/blank values are skipped. */
  fields: { title: string; value: string }[];
  /** When true, apply the attended tag after syncing. */
  attended: boolean;
};

export type AcUploadResult = {
  configured: boolean;
  requested: number;
  synced: number;
  tagged: number;
  automationAdded: number;
  /** false when the named automation couldn't be found in the account. */
  automationFound: boolean;
  errors: number;
  missingFields: string[];
};

/** Find an automation id by exact name (case-insensitive). null if not found. */
export async function resolveAutomationId(name: string): Promise<string | null> {
  const res = await acFetch(`/automations?filters[name]=${encodeURIComponent(name)}&limit=100`);
  if (!res.ok) throw new Error(`automation lookup failed (${res.status})`);
  const body = (await res.json()) as { automations?: { id: string; name: string }[] };
  const want = name.trim().toLowerCase();
  return body.automations?.find((a) => a.name.trim().toLowerCase() === want)?.id ?? null;
}

async function addContactToAutomation(contactId: string, automationId: string): Promise<void> {
  const res = await acFetch(`/contactAutomations`, {
    method: "POST",
    body: JSON.stringify({ contactAutomation: { contact: contactId, automation: automationId } }),
  });
  // 422 = already in the automation; treat as success (idempotent).
  if (!res.ok && res.status !== 422) {
    throw new Error(`automation add failed (${res.status})`);
  }
}

/**
 * Create-or-update each contact by email (AC `/contact/sync`), writing the
 * custom fields that exist in the account. Every synced contact is added to
 * the `automationName` automation (when found); attended contacts also get
 * `attendedTag`. Only non-empty values are sent, so we never blank an existing
 * field we have no value for. Best-effort: one bad contact never aborts the
 * rest. Pass a pre-fetched `fieldMap` to avoid re-listing fields.
 */
export async function uploadContactsToAc(
  contacts: AcContactInput[],
  attendedTag: string,
  automationName: string | null,
  fieldMap?: AcFieldMap,
): Promise<AcUploadResult> {
  const result: AcUploadResult = {
    configured: isActiveCampaignConfigured(),
    requested: contacts.length,
    synced: 0,
    tagged: 0,
    automationAdded: 0,
    automationFound: true,
    errors: 0,
    missingFields: [],
  };
  if (!result.configured || contacts.length === 0) return result;

  const map = fieldMap ?? (await getCustomFieldMap());
  const usedTitles = Array.from(new Set(contacts.flatMap((c) => c.fields.map((f) => f.title))));
  result.missingFields = missingFieldTitles(map, usedTitles);

  let tagId: string | null = null;
  try {
    tagId = await resolveTagId(attendedTag);
  } catch (e) {
    console.error("[activecampaign] tag resolve failed:", e);
  }

  let automationId: string | null = null;
  if (automationName) {
    try {
      automationId = await resolveAutomationId(automationName);
      result.automationFound = automationId !== null;
      if (!automationId) {
        console.warn(`[activecampaign] automation not found: "${automationName}"`);
      }
    } catch (e) {
      result.automationFound = false;
      console.error("[activecampaign] automation resolve failed:", e);
    }
  }

  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (!email) continue;
    try {
      const fieldValues = c.fields
        .map((f) => {
          const info = map.get(titleKey(f.title));
          const value = (f.value ?? "").trim();
          return info && value ? { field: info.id, value } : null;
        })
        .filter((x): x is { field: string; value: string } => x !== null);

      const contact: Record<string, unknown> = { email };
      if (c.firstName?.trim()) contact.firstName = c.firstName.trim();
      if (c.lastName?.trim()) contact.lastName = c.lastName.trim();
      if (c.phone?.trim()) contact.phone = c.phone.trim();
      if (fieldValues.length > 0) contact.fieldValues = fieldValues;

      const res = await acFetch(`/contact/sync`, {
        method: "POST",
        body: JSON.stringify({ contact }),
      });
      if (!res.ok) {
        result.errors += 1;
        console.error(`[activecampaign] sync failed for ${email} (${res.status})`);
        continue;
      }
      result.synced += 1;
      const body = (await res.json()) as { contact?: { id?: string } };
      const contactId = body.contact?.id;
      if (contactId) {
        if (c.attended && tagId) {
          try {
            await applyTag(contactId, tagId);
            result.tagged += 1;
          } catch (e) {
            result.errors += 1;
            console.error(`[activecampaign] tag failed for ${email}:`, e);
          }
        }
        if (automationId) {
          try {
            await addContactToAutomation(contactId, automationId);
            result.automationAdded += 1;
          } catch (e) {
            result.errors += 1;
            console.error(`[activecampaign] automation add failed for ${email}:`, e);
          }
        }
      }
    } catch (e) {
      result.errors += 1;
      console.error(`[activecampaign] sync error for ${email}:`, e);
    }
  }

  return result;
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
