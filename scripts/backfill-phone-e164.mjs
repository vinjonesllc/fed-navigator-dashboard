// Backfill attendees.phone_e164 / phone_extension for existing rows, using the
// same parsePhone logic as upload. Run AFTER migration 0017 is applied.
//   node scripts/backfill-phone-e164.mjs
import { readFileSync } from "node:fs";

const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// Mirror of src/lib/phone.ts parsePhone.
function parsePhone(raw) {
  if (!raw) return { e164: null, extension: null };
  const s = String(raw).trim();
  let base = s, extension = null;
  const m = s.match(/[\s,;]*(?:x|ext\.?|extension|#)\s*\.?\s*(\d{1,7})\s*$/i);
  if (m && m.index !== undefined) { extension = m[1]; base = s.slice(0, m.index).trim(); }
  let d = base.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  const e164 = d.length === 10 ? `+1${d}` : null;
  return { e164, extension: e164 ? extension : null };
}

const PAGE = 1000;
let from = 0, total = 0, valid = 0, invalid = 0, ext = 0;

for (;;) {
  const res = await fetch(`${url}/rest/v1/attendees?select=id,phone&phone=not.is.null&order=id&offset=${from}&limit=${PAGE}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) break;

  const updates = rows.map((r) => {
    const p = parsePhone(r.phone);
    if (p.e164) { valid++; if (p.extension) ext++; } else invalid++;
    return { id: r.id, phone_e164: p.e164, phone_extension: p.extension };
  });

  // Bulk upsert (merge on id) in chunks.
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const up = await fetch(`${url}/rest/v1/attendees?on_conflict=id`, {
      method: "POST",
      headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(chunk),
    });
    if (!up.ok) { console.error("upsert failed:", up.status, await up.text()); process.exit(1); }
  }

  total += rows.length;
  from += rows.length;
  console.log(`processed ${total} …`);
  if (rows.length < PAGE) break;
}

console.log(`\nDone. ${total} attendees with a phone → valid ${valid} (ext ${ext}), invalid/do-not-call ${invalid}.`);
