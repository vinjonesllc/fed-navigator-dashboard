// Print a sample prefilled Calendly booking link exactly as the agent builds it
// (real open slot + name/email/phone[a2]/location=Zoom prefill) — no test call.
//   node scripts/sample-booking-link.mjs
import { readFileSync } from "node:fs";

const env = {};
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}
const get = (k, d) => env[k] ?? process.env[k] ?? d;

const token = get("CALENDLY_TOKEN");
const eventType = get("CALENDLY_EVENT_TYPE_URI");
const phoneParam = get("CALENDLY_PHONE_PARAM", "a2");
const prefillLocation = get("CALENDLY_PREFILL_LOCATION", "Zoom");
if (!token || !eventType) {
  console.error("Need CALENDLY_TOKEN + CALENDLY_EVENT_TYPE_URI in .env.local");
  process.exit(1);
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const params = new URLSearchParams({
  event_type: eventType,
  start_time: new Date(Date.now() + HOUR).toISOString(),
  end_time: new Date(Date.now() + 7 * DAY - 60_000).toISOString(),
});
const res = await fetch(`https://api.calendly.com/event_type_available_times?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error("Calendly", res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const slot = (data.collection || []).find((s) => s.status === "available" && s.invitees_remaining > 0);
if (!slot) {
  console.error("No open slots in the next 7 days — widen the window or check availability.");
  process.exit(1);
}

const url = new URL(slot.scheduling_url);
url.searchParams.set("name", "Alex Carter");
url.searchParams.set("email", "admin+part2test@vinjones.com");
url.searchParams.set(phoneParam, "+15039292354");
if (prefillLocation) url.searchParams.set("location", prefillLocation);

console.log("Sample slot:", slot.start_time);
console.log("\nPrefilled booking link:\n" + url.toString());
