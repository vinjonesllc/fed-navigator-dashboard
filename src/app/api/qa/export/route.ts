import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqualStr } from "@/lib/webhook-verify";
import type { WorkshopQA } from "@/lib/supabase/types";

/**
 * Read-only Q&A feed for automation (cloud agents, scripts) that can't hold a
 * user session. Token-gated with AGENT_API_TOKEN — the same shared-secret shape
 * as /api/calls/cron, but scoped to this one table so the caller never needs the
 * service role key. GET only: nothing here writes.
 *
 *   GET /api/qa/export?list=1                     -> recent workshops to pick from
 *   GET /api/qa/export?workshopId=<uuid>          -> that workshop's Q&A
 *   GET /api/qa/export?client=feducate&date=2026-08-21
 *   GET /api/qa/export?client=feducate            -> that client's most recent
 *
 * Extras: &format=csv (default json), &includeDismissed=1, &limit=N (list mode).
 *
 * The rows carry attendee names and emails, so the token is as sensitive as the
 * dashboard login — rotate it in Vercel to revoke an agent's access.
 */

const LIST_DEFAULT = 25;
const LIST_MAX = 100;

/** Returns an error response when the caller isn't authorised, else null. */
function unauthorized(request: NextRequest): NextResponse | null {
  // Trimmed: a value pasted into the Vercel env editor often carries a trailing
  // newline, and the length check inside timingSafeEqualStr would reject every
  // otherwise-correct token because of it.
  const expected = process.env.AGENT_API_TOKEN?.trim();
  // Distinct from 401 on purpose: this one means "nobody can call this yet",
  // which is a deploy-config problem, not a bad credential.
  if (!expected) {
    return NextResponse.json(
      { error: "AGENT_API_TOKEN is not set on this deployment." },
      { status: 503 },
    );
  }
  // Accept either header: agents reach for Authorization: Bearer by habit, and
  // x-agent-token matches the x-cron-secret convention used elsewhere here.
  const auth = request.headers.get("authorization");
  const got = /^bearer /i.test(auth ?? "")
    ? auth!.slice(7).trim()
    : request.headers.get("x-agent-token")?.trim();
  if (!got || !timingSafeEqualStr(got, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

type WorkshopRow = {
  id: string;
  client_id: string;
  title: string;
  workshop_date: string;
};

type ClientRow = { id: string; name: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Q&A counts for a set of workshops, in one round trip. */
async function qaCounts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workshopIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (workshopIds.length === 0) return counts;
  const { data } = await admin
    .from("workshop_qa")
    .select("workshop_id")
    .in("workshop_id", workshopIds)
    .eq("dismissed", false);
  for (const row of (data ?? []) as { workshop_id: string }[]) {
    counts.set(row.workshop_id, (counts.get(row.workshop_id) ?? 0) + 1);
  }
  return counts;
}

export async function GET(request: NextRequest) {
  const denied = unauthorized(request);
  if (denied) return denied;

  const params = request.nextUrl.searchParams;
  const admin = createSupabaseAdminClient();

  // ---- Discovery mode: which workshops exist, and which have Q&A. ----------
  if (params.get("list") === "1" || params.get("list") === "true") {
    const asked = Number(params.get("limit"));
    const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, LIST_MAX) : LIST_DEFAULT;

    const { data: workshops } = await admin
      .from("workshops")
      .select("id, client_id, title, workshop_date")
      .order("workshop_date", { ascending: false })
      .limit(limit);
    const rows = (workshops ?? []) as WorkshopRow[];

    const { data: clients } = await admin.from("clients").select("id, name");
    const nameById = new Map(
      ((clients ?? []) as ClientRow[]).map((c) => [c.id, c.name]),
    );
    const counts = await qaCounts(admin, rows.map((w) => w.id));

    return NextResponse.json(
      {
        workshops: rows.map((w) => ({
          workshopId: w.id,
          client: nameById.get(w.client_id) ?? null,
          title: w.title,
          date: w.workshop_date,
          qaCount: counts.get(w.id) ?? 0,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ---- Resolve the workshop: by id, or by client (+ optional date). --------
  const workshopId = params.get("workshopId")?.trim();
  const clientQuery = params.get("client")?.trim();
  const date = params.get("date")?.trim();

  if (!workshopId && !clientQuery) {
    return NextResponse.json(
      {
        error:
          "Pass workshopId, or client (optionally with date=YYYY-MM-DD). Use ?list=1 to see the options.",
      },
      { status: 400 },
    );
  }
  if (date && !ISO_DATE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  let workshop: WorkshopRow | null = null;

  if (workshopId) {
    const { data } = await admin
      .from("workshops")
      .select("id, client_id, title, workshop_date")
      .eq("id", workshopId)
      .maybeSingle<WorkshopRow>();
    workshop = data ?? null;
  } else {
    // Substring match so callers can say "feducate" rather than the exact
    // registered client name. Ambiguity is reported, never guessed at.
    const { data: matches } = await admin
      .from("clients")
      .select("id, name")
      .ilike("name", `%${clientQuery}%`);
    const clients = (matches ?? []) as ClientRow[];
    if (clients.length === 0) {
      return NextResponse.json(
        { error: `No client matches "${clientQuery}".` },
        { status: 404 },
      );
    }
    if (clients.length > 1) {
      return NextResponse.json(
        {
          error: `"${clientQuery}" matches more than one client — narrow it or use workshopId.`,
          matches: clients.map((c) => c.name),
        },
        { status: 400 },
      );
    }

    let query = admin
      .from("workshops")
      .select("id, client_id, title, workshop_date")
      .eq("client_id", clients[0].id);
    // No date given: the most recent workshop is what people mean by "the last
    // one". With a date, it's an exact match — never the nearest.
    if (date) query = query.eq("workshop_date", date);
    const { data } = await query
      .order("workshop_date", { ascending: false })
      .limit(1)
      .maybeSingle<WorkshopRow>();
    workshop = data ?? null;
  }

  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }

  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("id", workshop.client_id)
    .maybeSingle<ClientRow>();

  // ---- The Q&A itself. ----------------------------------------------------
  const includeDismissed =
    params.get("includeDismissed") === "1" || params.get("includeDismissed") === "true";

  let qaQuery = admin
    .from("workshop_qa")
    .select(
      "id, question, sender_name, sender_email, submitted_at, answer, responder_name, responded_at, dismissed",
    )
    .eq("workshop_id", workshop.id);
  // Dismissed rows are the ones an admin hid in the dashboard; the UI's counts
  // exclude them, so the default here matches what the dashboard shows.
  if (!includeDismissed) qaQuery = qaQuery.eq("dismissed", false);

  const { data: qaRows, error } = await qaQuery.order("submitted_at", {
    ascending: true,
    nullsFirst: false,
  });
  if (error) {
    console.error("[qa/export] query failed:", error.message);
    return NextResponse.json({ error: "Could not read Q&A" }, { status: 502 });
  }

  const qa = ((qaRows ?? []) as WorkshopQA[]).map((r) => ({
    id: r.id,
    question: r.question,
    askedBy: r.sender_name,
    askedByEmail: r.sender_email,
    submittedAt: r.submitted_at,
    answer: r.answer,
    answeredBy: r.responder_name,
    answeredAt: r.responded_at,
    ...(includeDismissed ? { dismissed: r.dismissed } : {}),
  }));

  const meta = {
    workshopId: workshop.id,
    client: client?.name ?? null,
    title: workshop.title,
    date: workshop.workshop_date,
  };

  if (params.get("format") === "csv") {
    const columns = [
      "Question",
      "Asked by",
      "Email",
      "Submitted",
      "Answer",
      "Answered by",
      "Answered at",
    ];
    const csv = Papa.unparse(
      qa.map((r) => ({
        Question: r.question,
        "Asked by": r.askedBy ?? "",
        Email: r.askedByEmail ?? "",
        Submitted: r.submittedAt ?? "",
        Answer: r.answer ?? "",
        "Answered by": r.answeredBy ?? "",
        "Answered at": r.answeredAt ?? "",
      })),
      { columns },
    );
    const safeTitle = workshop.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qa_${safeTitle}_${workshop.workshop_date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    { workshop: meta, count: qa.length, qa },
    { headers: { "Cache-Control": "no-store" } },
  );
}
