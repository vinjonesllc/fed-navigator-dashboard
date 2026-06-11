import "server-only";
import crypto from "node:crypto";

// ----------------------------------------------------------------------------
// Verification helpers for our public webhook routes. Both verifiers FAIL CLOSED
// when their secret env var IS set (reject anything that doesn't match), and are
// skipped only when the secret is absent (local dev before secrets are wired).
// Set the secrets in production so the routes can't be spoofed.
// ----------------------------------------------------------------------------

/** Constant-time string compare (length-safe). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a Calendly webhook signature header of the form "t=<ts>,v1=<hmac>".
 * HMAC-SHA256 over `${t}.${rawBody}` with the subscription's signing key.
 */
export function verifyCalendlySignature(
  header: string | null,
  rawBody: string,
  signingKey: string,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  if (!timingSafeEqualStr(expected, v1)) return false;

  // Reject stale signatures (replay protection).
  const ts = Number(t);
  if (Number.isFinite(ts) && toleranceSeconds > 0) {
    const ageSec = Math.abs(Date.now() / 1000 - ts);
    if (ageSec > toleranceSeconds) return false;
  }
  return true;
}
