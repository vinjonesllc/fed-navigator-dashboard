// Normalize a US/NANP phone number to E.164 (+1XXXXXXXXXX). Vapi and Twilio both
// require E.164, but CSV-imported attendee numbers arrive in many shapes
// ("6156956145", "(605) 206-0299", "605-433-5281", "915 757 5582", "+1…").
// Returns null when it can't form a plausible number.
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }
  const d = trimmed.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`; // bare US 10-digit
  if (d.length === 11 && d.startsWith("1")) return `+${d}`; // US with leading 1
  if (d.length >= 11 && d.length <= 15) return `+${d}`; // already has a country code
  return null;
}

export type ParsedPhone = {
  /** Dialable US number in E.164 (+1XXXXXXXXXX), or null if not callable. */
  e164: string | null;
  /** Extension digits (from "x123", "ext. 123", "#123"), if any. */
  extension: string | null;
};

/**
 * Parse a raw phone for storage at upload time. STRICT US/NANP: the base must be
 * exactly 10 digits (or 11 with a leading 1) → +1XXXXXXXXXX. Anything else — too
 * short, too long, or foreign — yields e164=null, meaning DO NOT CALL. A trailing
 * extension ("x1234", "Ext. 1234", "#1234") is pulled off and kept separately;
 * we dial the base line, not the extension.
 */
export function parsePhone(raw: string | null | undefined): ParsedPhone {
  if (!raw) return { e164: null, extension: null };
  const s = String(raw).trim();
  let base = s;
  let extension: string | null = null;
  const m = s.match(/[\s,;]*(?:x|ext\.?|extension|#)\s*\.?\s*(\d{1,7})\s*$/i);
  if (m && m.index !== undefined) {
    extension = m[1];
    base = s.slice(0, m.index).trim();
  }
  let d = base.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  const e164 = d.length === 10 ? `+1${d}` : null;
  // Only keep an extension when the base is itself callable.
  return { e164, extension: e164 ? extension : null };
}
