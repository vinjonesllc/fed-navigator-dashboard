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
