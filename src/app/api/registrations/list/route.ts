import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchTabCsvForExport } from "@/lib/google-sheets";
import { formatNextWorkshopDate, parseNextWorkshops } from "@/lib/next-workshop";
import type { Client } from "@/lib/supabase/types";

/**
 * The same registration sheet the CSV export serves, but as JSON reduced to the
 * five columns the "View registrations" modal shows. Read-only, live from the
 * client's configured registrant tab.
 */

export type RegistrationRow = {
  first: string;
  last: string;
  email: string;
  phone: string;
  /** As written in the sheet, minus the leading weekday ("May 5, 2026 4:11 PM EDT"). */
  registered: string;
  /** Epoch ms for sorting; null when the cell isn't a parseable date. */
  registeredTs: number | null;
};

type HeaderMap = Partial<
  Record<"email" | "first" | "last" | "name" | "phone" | "registered", string>
>;

/**
 * Match the columns we need by shape, not by exact title — these tabs are hand-
 * maintained and arrive from Zoom exports, Apps Script writes, and manual paste,
 * so the headers vary ("Email"/"Email address", "Phone"/"Mobile", …).
 *
 * Order matters: the Zoom header row carries decoys that a looser test would
 * grab first — "Last registration time" for /last/, "First join time" for
 * /first/, "Registration method"/"Registration source" for /registration/.
 */
function buildHeaderMap(fields: string[]): HeaderMap {
  const map: HeaderMap = {};
  for (const h of fields) {
    const k = h.replace(/^﻿/, "").toLowerCase().trim();
    if (!map.email && /e-?mail/.test(k)) map.email = h;
    else if (!map.first && /first[\s_-]*name|^first$/.test(k)) map.first = h;
    else if (!map.last && /last[\s_-]*name|^last$/.test(k)) map.last = h;
    else if (!map.name && /^(full[\s_-]*)?name$|first\s*(&|and|\/)\s*last/.test(k)) map.name = h;
    else if (!map.phone && /phone|mobile|cell/.test(k)) map.phone = h;
    else if (
      !map.registered &&
      /registration time|date\s*registered|registration date|registered\s*(at|on)?$|^timestamp$|^date$/.test(k)
    )
      map.registered = h;
  }
  return map;
}

const cell = (row: Record<string, string>, header: string | undefined) =>
  header ? (row[header] ?? "").trim() : "";

/** Drop Zoom's leading weekday: "Tue, May 5, 2026 4:11 PM EDT" -> "May 5, 2026 4:11 PM EDT". */
function tidyDate(raw: string): string {
  return raw.replace(/^\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,\s*/i, "");
}

function timestamp(raw: string): number | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export async function GET(request: NextRequest) {
  const session = await requireUser();
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  if (!userCanAccessClient(session, clientId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Which workshop in the client's next_workshops list (defaults to the first).
  const w = Number(request.nextUrl.searchParams.get("w") ?? "0");
  const index = Number.isInteger(w) && w >= 0 ? w : 0;

  const admin = createSupabaseAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("name, eval_sheet_url, next_workshops")
    .eq("id", clientId)
    .maybeSingle<Pick<Client, "name" | "eval_sheet_url" | "next_workshops">>();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  // The tab comes from the saved client config, never from the query string.
  const entry = parseNextWorkshops(client.next_workshops)[index];
  if (!client.eval_sheet_url || !entry?.registrant_tab) {
    return NextResponse.json(
      { error: "No registration sheet is configured for this workshop." },
      { status: 404 },
    );
  }

  const csv = await fetchTabCsvForExport(client.eval_sheet_url, entry.registrant_tab);
  if (csv === null) {
    return NextResponse.json(
      { error: "Could not read the registration sheet. Check that it's shared as link-viewable." },
      { status: 502 },
    );
  }

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  const hmap = buildHeaderMap(parsed.meta.fields ?? []);

  const rows: RegistrationRow[] = [];
  for (const raw of parsed.data) {
    // Same "has any content" test the registrant count uses, so the modal and
    // the "N registered" figure above the button never disagree.
    if (!Object.values(raw).some((v) => (v ?? "").trim() !== "")) continue;

    let first = cell(raw, hmap.first);
    let last = cell(raw, hmap.last);
    // Sheets with a single name column: split on the first space so the two
    // name columns still sort independently.
    if (!first && !last && hmap.name) {
      const whole = cell(raw, hmap.name);
      const sp = whole.indexOf(" ");
      first = sp < 0 ? whole : whole.slice(0, sp);
      last = sp < 0 ? "" : whole.slice(sp + 1).trim();
    }

    const registeredRaw = cell(raw, hmap.registered);
    rows.push({
      first,
      last,
      email: cell(raw, hmap.email),
      phone: cell(raw, hmap.phone),
      registered: tidyDate(registeredRaw),
      registeredTs: timestamp(registeredRaw),
    });
  }

  // Which of the five columns the sheet actually carries, so a missing phone or
  // date column reads as "not in this sheet" instead of a column of blanks.
  const present = {
    first: !!(hmap.first || hmap.name),
    last: !!(hmap.last || hmap.name),
    email: !!hmap.email,
    phone: !!hmap.phone,
    registered: !!hmap.registered,
  };

  return NextResponse.json(
    {
      rows,
      count: rows.length,
      tab: entry.registrant_tab,
      dateLabel: formatNextWorkshopDate(entry.date),
      missing: (Object.keys(present) as (keyof typeof present)[]).filter((k) => !present[k]),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
