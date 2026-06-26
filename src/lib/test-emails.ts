/**
 * Test / internal email filtering.
 *
 * Some addresses in the workshop data are our own test traffic, not real
 * attendees (e.g. Kevin Jones doing QA). They must not count toward attendance,
 * exports, intents, or the ActiveCampaign sync. We drop them at ingest.
 *
 * Matching is Gmail-aware: Gmail ignores dots and `+suffixes`, so
 * `kevin.jones.fam@gmail.com`, `kevinjonesfam+test@gmail.com`, and
 * `kevinjonesfam@gmail.com` are the same inbox and all match.
 *
 * Add more test addresses (comma-separated) via the FEDNAV_TEST_EMAILS env var.
 */

const SEED_TEST_EMAILS = ["kevinjonesfam@gmail.com"];

/** Lowercase, trim, and for Gmail strip dots + `+suffix` from the local part. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at <= 0) return null;
  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain) return null;
  local = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

const TEST_SET: Set<string> = new Set(
  [...SEED_TEST_EMAILS, ...(process.env.FEDNAV_TEST_EMAILS ?? "").split(",")]
    .map((e) => normalizeEmail(e))
    .filter((e): e is string => !!e),
);

/** True when an email is one of our test/internal addresses (to be excluded). */
export function isTestEmail(email: string | null | undefined): boolean {
  const n = normalizeEmail(email);
  return !!n && TEST_SET.has(n);
}
