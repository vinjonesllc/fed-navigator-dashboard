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
const auth = { apikey: key, Authorization: `Bearer ${key}` };

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

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) { const idx = i++; await fn(items[idx]); }
    }),
  );
}

const PAGE = 1000;
let from = 0, total = 0, valid = 0, invalid = 0, ext = 0, errors = 0;

for (;;) {
  const res = await fetch(
    `${url}/rest/v1/attendees?select=id,phone&phone=not.is.null&order=id&offset=${from}&limit=${PAGE}`,
    { headers: auth },
  );
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) break;

  await mapLimit(rows, 25, async (r) => {
    const p = parsePhone(r.phone);
    if (p.e164) { valid++; if (p.extension) ext++; } else invalid++;
    const up = await fetch(`${url}/rest/v1/attendees?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ phone_e164: p.e164, phone_extension: p.extension }),
    });
    if (!up.ok) { errors++; if (errors <= 5) console.error("PATCH failed", r.id, up.status, await up.text()); }
  });

  total += rows.length;
  from += rows.length;
  console.log(`processed ${total} …`);
  if (rows.length < PAGE) break;
}

console.log(`\nDone. ${total} attendees with a phone → valid ${valid} (ext ${ext}), invalid/do-not-call ${invalid}, errors ${errors}.`);
