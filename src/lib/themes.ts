import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Cluster = {
  theme_label: string;
  description?: string;
  count: number;
  example_quotes: string[];
};

export async function clusterQuestions(workshopId: string): Promise<{ created: number }> {
  const apiKey = process.env.FEDNAV_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[themes] FEDNAV_ANTHROPIC_API_KEY not set — skipping clustering");
    return { created: 0 };
  }

  const admin = createSupabaseAdminClient();

  const { data: rows } = await admin
    .from("attendees")
    .select("registration_question")
    .eq("workshop_id", workshopId)
    .not("registration_question", "is", null);

  const questions = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => (r.registration_question ?? "").trim())
        .filter((q) => q.length > 3 && q.length < 800),
    ),
  );

  if (questions.length < 3) return { created: 0 };

  const client = new Anthropic({ apiKey });

  const prompt = `You are clustering free-text questions submitted at registration for a federal-employee retirement-readiness webinar.

Group the questions into 5–12 meaningful themes. For each theme, return:
- theme_label: short (2–6 words)
- description: one sentence describing the theme
- count: how many questions fall in it
- example_quotes: 2–3 verbatim quotes (truncate long ones to ~140 chars)

Output STRICT JSON only (no prose), shape: {"clusters":[{"theme_label":"...","description":"...","count":N,"example_quotes":["...","..."]}]}

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[themes] no JSON in response:", text.slice(0, 200));
    return { created: 0 };
  }

  let parsed: { clusters: Cluster[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[themes] JSON parse failed:", e);
    return { created: 0 };
  }

  const clusters = (parsed.clusters ?? []).filter((c) => c.theme_label && c.count > 0);
  if (clusters.length === 0) return { created: 0 };

  // Replace any prior themes for this workshop.
  await admin.from("question_themes").delete().eq("workshop_id", workshopId);

  const { error } = await admin.from("question_themes").insert(
    clusters.map((c) => ({
      workshop_id: workshopId,
      theme_label: c.theme_label.slice(0, 120),
      description: c.description?.slice(0, 500) ?? null,
      count: c.count,
      example_quotes: c.example_quotes ?? [],
    })),
  );

  if (error) {
    console.error("[themes] insert failed:", error.message);
    return { created: 0 };
  }

  return { created: clusters.length };
}
