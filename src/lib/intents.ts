import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ExtractedIntent = {
  intent_type: "retiring_soon" | "cliff_notes_request";
  attendee_name?: string;
  attendee_email?: string;
  detail?: string;
  source?: "chat" | "qa" | "both";
  source_quote?: string;
};

export async function extractIntents(
  workshopId: string,
): Promise<{ inserted: number; error?: string }> {
  const apiKey = process.env.FEDNAV_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[intents] FEDNAV_ANTHROPIC_API_KEY not set — skipping");
    return { inserted: 0, error: "FEDNAV_ANTHROPIC_API_KEY not set" };
  }

  const admin = createSupabaseAdminClient();

  const [{ data: workshop }, { data: attendees }, { data: chats }, { data: qa }] =
    await Promise.all([
      admin
        .from("workshops")
        .select("workshop_date, presenter")
        .eq("id", workshopId)
        .maybeSingle(),
      admin
        .from("attendees")
        .select("email, first_name, last_name")
        .eq("workshop_id", workshopId),
      admin
        .from("workshop_chats")
        .select("sender_name, sender_email, message, sent_at")
        .eq("workshop_id", workshopId)
        .order("sent_at"),
      admin
        .from("workshop_qa")
        .select("sender_name, sender_email, question, submitted_at, dismissed")
        .eq("workshop_id", workshopId)
        .order("submitted_at"),
    ]);

  if (!workshop) throw new Error("workshop not found");
  if (!chats?.length && !qa?.length) return { inserted: 0 };

  const attendeeEmails = new Set(
    (attendees ?? [])
      .map((a) => (a.email ?? "").toLowerCase())
      .filter(Boolean),
  );

  type Line = {
    src: "chat" | "qa";
    role: "PRESENTER" | "ATTENDEE";
    name: string;
    email: string;
    text: string;
    ts: string;
  };
  const lines: Line[] = [];
  for (const c of chats ?? []) {
    const email = (c.sender_email ?? "").toLowerCase();
    lines.push({
      src: "chat",
      role: email && attendeeEmails.has(email) ? "ATTENDEE" : "PRESENTER",
      name: c.sender_name ?? "",
      email,
      text: c.message ?? "",
      ts: c.sent_at ?? "",
    });
  }
  for (const q of qa ?? []) {
    if (q.dismissed) continue;
    const email = (q.sender_email ?? "").toLowerCase();
    lines.push({
      src: "qa",
      role: email && attendeeEmails.has(email) ? "ATTENDEE" : "PRESENTER",
      name: q.sender_name ?? "",
      email,
      text: q.question ?? "",
      ts: q.submitted_at ?? "",
    });
  }

  // Sort by timestamp so Claude sees the full conversational context
  // (presenter prompts followed by attendee answers).
  lines.sort((a, b) => a.ts.localeCompare(b.ts));

  const workshopDate = workshop.workshop_date as string;
  const addMonthsISO = (n: number) => {
    const d = new Date(workshopDate);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  };
  const cutoff6 = addMonthsISO(6);
  const cutoff12 = addMonthsISO(12);

  const prompt = `You are analyzing the full transcript (chat + Q&A, chronological) of a federal retirement-readiness workshop held on ${workshopDate}.

Below, each line is tagged [PRESENTER] (Fed Pilot staff or guest presenter) or [ATTENDEE] (a federal employee participant). Presenter lines are included so you can see the questions being asked. **Only output ATTENDEE rows** in your final answer.

The workshop date is **${workshopDate}**. "Within 12 months" means a retirement date between ${workshopDate} and **${cutoff12}**. The 6-month mark is **${cutoff6}** — used only to label HOW SOON someone is retiring.

# Task 1 — retiring_soon (retiring within the next 12 months)

Identify ATTENDEES who indicate they are retiring on or before ${cutoff12} (the next 12 months). Be GENEROUS, not strict — **tentative answers COUNT**. Include anyone whose chat or Q&A reasonably implies retiring within the year.

IMPORTANT conversational pattern: roughly 30 minutes into the workshop, after attendees type their AGENCY (e.g. "VA", "IRS", "EPA", "NPS"), the presenter asks something like "Who is going to retire in the next 6 months / next year?" The attendee messages that immediately follow are answers to that question. Treat each such answer as a candidate:
- Affirmatives: "yes", "me", "meeeee", "yepper", "absolutely", "that's me", "👍"
- **TENTATIVE affirmatives (INCLUDE these)**: "possibly", "maybe", "probably", "hopefully", "looking to", "planning to", "I think so"
- Durations / dates: "8 weeks", "a few months", "end of this year", "December", "May 30", "12/31"

Catch all of these patterns anywhere in the transcript:
- **Explicit date** on or before ${cutoff12}: "May 30", "June 1", "8/31/2026", "Dec 2026", "next June" (if within 12 months)
- **Countdown / short horizon**: "8 weeks", "33-day countdown", "retiring in a few weeks/months", "next month", "later this year", "end of this year"
- **Retirement application activity**: "submitting my retirement application", "my last day is …" within the window
- **Yes / tentative answer** following the presenter's "retire in the next 6 months / next year?" question — possibly / maybe / hopefully all COUNT

EXCLUDE:
- Clearly more than 12 months out: "2 years out", "6 years!!!", "2028", "Jan 2030", "at age 67" (with no near-term date)
- Single-digit numbers ("1", "2", "5") that are years-until-retirement (only include if context clearly means months/weeks)
- Anyone whose role is PRESENTER

For each match, return:
- attendee_name (from the line)
- attendee_email (lowercase)
- detail — an indication of WHEN they retire. Use, in order of preference: (1) a specific date normalized to YYYY-MM-DD if one is stated; (2) the stated month or phrase ("December", "end of this year", "8 weeks", "next June"); (3) if only a yes/tentative answer with no timing, output "Within 6 months" when it sounds imminent or is on/before ${cutoff6}, otherwise "Within 12 months". For TENTATIVE answers (possibly/maybe/hopefully), prefix the detail with "Possibly " (e.g. "Possibly December", "Possibly within 12 months").
- source ("chat" or "qa")
- source_quote — exact text, ≤140 chars

# Task 2 — cliff_notes_request

Identify ATTENDEES who want the workshop's "cliff notes" / written summary / handout / link. Be GENEROUS — any reasonable indication counts:

- **Can't get / can't open / can't access** the cliff notes ("It blocks me downloading the cliff notes", "I can't open them")
- **Asking for the link** ("Can you provide cliff notes link again?", "where will I find the cliff notes?", "where can we find the cliff notes?")
- **Asking it be emailed** ("can I have the cliff notes emailed", "please send cliff notes")
- **Providing email so cliff notes can be sent** to them ("crystal.wilkinson@va.gov please send cliff notes")
- **Asking for the recording or materials to be sent**
- **Saying they had to drop / will miss the rest** and asking where to find materials

For each match, return same fields as above. detail = a short summary of the ask ("Couldn't open link", "Wants link re-sent", "Gave email for delivery").

# Output format

Return STRICT JSON only — no prose, no markdown — exactly:
{"retiring_soon": [...], "cliff_notes_request": [...]}

If a person matches multiple lines, return them ONCE per intent_type using the most informative quote. The same person can appear in both lists if they expressed both intents.

# Transcript (chronological)

${lines
  .map(
    (l, i) =>
      `${i + 1}. [${l.role}][${l.src.toUpperCase()}] ${l.name} <${l.email}> @ ${l.ts}: ${l.text.replace(/\s+/g, " ").slice(0, 400)}`,
  )
  .join("\n")}`;

  const client = new Anthropic({ apiKey });
  console.log(
    `[intents] calling Claude — ${lines.length} lines, ${attendeeEmails.size} attendees`,
  );

  let text: string;
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system:
        "You output JSON only. Your entire response must be a single JSON object starting with { and ending with }. Never include preamble, explanation, markdown fences, or commentary. No text before or after the JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    console.log(`[intents] Claude response ${text.length} chars`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[intents] Claude API call failed:", msg);
    return { inserted: 0, error: `Claude API: ${msg}` };
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[intents] no JSON in response:", text.slice(0, 300));
    return { inserted: 0, error: "Claude returned no JSON" };
  }

  let parsed: { retiring_soon?: ExtractedIntent[]; cliff_notes_request?: ExtractedIntent[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[intents] JSON parse failed:", e, "text:", jsonMatch[0].slice(0, 300));
    return { inserted: 0, error: "Claude JSON malformed" };
  }

  const rawRetiring = parsed.retiring_soon?.length ?? 0;
  const rawCliff = parsed.cliff_notes_request?.length ?? 0;
  console.log(`[intents] Claude returned ${rawRetiring} retiring + ${rawCliff} cliff-notes`);

  const rows: ExtractedIntent[] = [];
  let droppedRetiring = 0;
  let droppedCliff = 0;
  for (const r of parsed.retiring_soon ?? []) {
    if (r.attendee_email && !attendeeEmails.has(r.attendee_email.toLowerCase())) {
      droppedRetiring++;
      continue;
    }
    rows.push({ ...r, intent_type: "retiring_soon" });
  }
  for (const r of parsed.cliff_notes_request ?? []) {
    if (r.attendee_email && !attendeeEmails.has(r.attendee_email.toLowerCase())) {
      droppedCliff++;
      continue;
    }
    rows.push({ ...r, intent_type: "cliff_notes_request" });
  }
  if (droppedRetiring + droppedCliff > 0) {
    console.log(
      `[intents] dropped ${droppedRetiring} retiring + ${droppedCliff} cliff (email not in attendees)`,
    );
  }

  if (rows.length === 0) return { inserted: 0 };

  // Race guard: workshop may have been deleted while Claude was running.
  const { data: stillExists } = await admin
    .from("workshops")
    .select("id")
    .eq("id", workshopId)
    .maybeSingle();
  if (!stillExists) {
    console.warn("[intents] workshop deleted before insert; skipping");
    return { inserted: 0, error: "Workshop no longer exists" };
  }

  await admin.from("workshop_intents").delete().eq("workshop_id", workshopId);

  const { error } = await admin.from("workshop_intents").insert(
    rows.map((r) => ({
      workshop_id: workshopId,
      intent_type: r.intent_type,
      attendee_name: r.attendee_name?.slice(0, 200) ?? null,
      attendee_email: r.attendee_email?.toLowerCase().slice(0, 200) ?? null,
      detail: r.detail?.slice(0, 500) ?? null,
      source: r.source ?? null,
      source_quote: r.source_quote?.slice(0, 800) ?? null,
    })),
  );

  if (error) {
    console.error("[intents] insert failed:", error.message);
    return { inserted: 0 };
  }

  return { inserted: rows.length };
}
