"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireContentManager } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestZoomCsv } from "@/lib/ingest";
import { parseChatCsv, parseQACsv } from "@/lib/csv/parse-transcripts";
import { clusterQuestions } from "@/lib/themes";
import { extractIntents } from "@/lib/intents";
import { fetchEvalComments } from "@/lib/eval-comments";
import { tagExistingContacts } from "@/lib/activecampaign";

// Fed Pilot-branded clients get their attendees tagged in ActiveCampaign.
// Feducate / MyFedNav clients are skipped.
const AC_ATTENDED_BRAND = "Fed Pilot";
const AC_ATTENDED_TAG = "FP-Attended";

const Schema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(2),
  workshopDate: z.string().min(8),
  presenter: z.string().optional(),
  topic: z.string().optional(),
  notes: z.string().optional(),
  scheduledMinutes: z.coerce.number().int().positive().max(720),
});

export async function uploadCsv(formData: FormData) {
  await requireContentManager();

  const attendeeFile = formData.get("attendeeFile") as File | null;
  const chatFile = formData.get("chatFile") as File | null;
  const qaFile = formData.get("qaFile") as File | null;

  if (!attendeeFile || attendeeFile.size === 0) {
    throw new Error("Attendee CSV is required");
  }
  if (!qaFile || qaFile.size === 0) {
    throw new Error("Q&A CSV is required");
  }
  // Chat transcript is optional — we sometimes don't have it. All workshop
  // stats come from the attendee + Q&A files; a missing chat just leaves the
  // message-level transcript empty.
  const hasChat = !!chatFile && chatFile.size > 0;
  for (const f of [attendeeFile, qaFile, ...(hasChat ? [chatFile] : [])]) {
    if (f.size > 25 * 1024 * 1024) throw new Error(`File ${f.name} too large (>25MB)`);
  }

  const parsed = Schema.parse({
    clientId: formData.get("clientId"),
    title: formData.get("title"),
    workshopDate: formData.get("workshopDate"),
    presenter: formData.get("presenter") ?? undefined,
    topic: formData.get("topic") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    scheduledMinutes: formData.get("scheduledMinutes"),
  });

  const [attendeeCsv, chatCsv, qaCsv] = await Promise.all([
    attendeeFile.text(),
    hasChat ? chatFile.text() : Promise.resolve(""),
    qaFile.text(),
  ]);

  // 1. Ingest attendees (creates the workshop row + attendee rows).
  const result = await ingestZoomCsv({
    clientId: parsed.clientId,
    title: parsed.title,
    workshopDate: parsed.workshopDate,
    presenter: parsed.presenter ?? null,
    topic: parsed.topic ?? null,
    notes: parsed.notes ?? null,
    scheduledMinutes: parsed.scheduledMinutes,
    csv: attendeeCsv,
  });

  const admin = createSupabaseAdminClient();

  // 2. Ingest chat transcript (optional — skipped entirely if not provided).
  const chatRows = hasChat ? parseChatCsv(chatCsv) : [];
  if (chatRows.length > 0) {
    const { error: chatErr } = await admin
      .from("workshop_chats")
      .insert(chatRows.map((r) => ({ ...r, workshop_id: result.workshopId })));
    if (chatErr) throw new Error(`Chat insert failed: ${chatErr.message}`);
  }

  // 3. Ingest Q&A transcript.
  const qaRows = parseQACsv(qaCsv);
  if (qaRows.length > 0) {
    const { error: qaErr } = await admin
      .from("workshop_qa")
      .insert(qaRows.map((r) => ({ ...r, workshop_id: result.workshopId })));
    if (qaErr) throw new Error(`Q&A insert failed: ${qaErr.message}`);
  }

  // 4. Run Claude-side analyses synchronously so the workshop detail page
  //    renders with intents + themes + eval comments already populated.
  //    Adds ~20-40s to upload.
  const claudeResults = await Promise.allSettled([
    result.registrationQuestionHeader
      ? clusterQuestions(result.workshopId)
      : Promise.resolve({ created: 0 }),
    extractIntents(result.workshopId),
    fetchEvalComments(result.workshopId),
  ]);
  for (const r of claudeResults) {
    if (r.status === "rejected") {
      console.error("[upload] Claude analysis failed:", r.reason);
    }
  }

  // 5. If this client is on the Fed Pilot brand, tag everyone who actually
  //    attended (participation = "Live") in ActiveCampaign. Runs after the
  //    response is sent (`after`) so it never blocks or slows the upload, and
  //    is fully best-effort — a tagging failure is logged, never thrown.
  const { data: client } = await admin
    .from("clients")
    .select("brand")
    .eq("id", parsed.clientId)
    .maybeSingle();

  if (client?.brand === AC_ATTENDED_BRAND) {
    const { data: attended } = await admin
      .from("attendees")
      .select("email")
      .eq("workshop_id", result.workshopId)
      .eq("participation", "Live");

    const emails = (attended ?? [])
      .map((a) => a.email)
      .filter((e): e is string => !!e);

    if (emails.length > 0) {
      after(async () => {
        try {
          const r = await tagExistingContacts(emails, AC_ATTENDED_TAG);
          if (!r.configured) {
            console.warn("[upload] ActiveCampaign not configured; skipped tagging.");
          } else {
            console.log(
              `[upload] ActiveCampaign ${AC_ATTENDED_TAG}: tagged ${r.tagged}/${r.requested} ` +
                `(${r.notInAc} not in AC, ${r.errors} errors).`,
            );
          }
        } catch (e) {
          console.error("[upload] ActiveCampaign tagging failed:", e);
        }
      });
    }
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${parsed.clientId}`);

  return {
    ...result,
    chatRows: chatRows.length,
    qaRows: qaRows.length,
  };
}

// Edit a workshop's metadata. Everything is editable EXCEPT the client and the
// uploaded files (attendees / chat / Q&A) — those require a re-upload flow.
const UpdateSchema = z.object({
  workshopId: z.string().uuid(),
  title: z.string().min(2),
  workshopDate: z.string().min(8),
  presenter: z.string().optional(),
  topic: z.string().optional(),
  notes: z.string().optional(),
  scheduledMinutes: z.coerce.number().int().positive().max(720),
});

export async function updateWorkshop(formData: FormData) {
  await requireContentManager();
  const parsed = UpdateSchema.parse({
    workshopId: formData.get("workshopId"),
    title: formData.get("title"),
    workshopDate: formData.get("workshopDate"),
    presenter: formData.get("presenter") ?? undefined,
    topic: formData.get("topic") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    scheduledMinutes: formData.get("scheduledMinutes"),
  });

  const admin = createSupabaseAdminClient();
  const { data: ws, error } = await admin
    .from("workshops")
    .update({
      title: parsed.title,
      workshop_date: parsed.workshopDate,
      presenter: parsed.presenter?.trim() || null,
      topic: parsed.topic?.trim() || null,
      notes: parsed.notes?.trim() || null,
      scheduled_minutes: parsed.scheduledMinutes,
    })
    .eq("id", parsed.workshopId)
    .select("client_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!ws) throw new Error("Workshop not found");

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${ws.client_id}`);
  revalidatePath(`/admin/clients/${ws.client_id}/workshops/${parsed.workshopId}`);
  revalidatePath(`/dashboard/workshops/${parsed.workshopId}`);

  return { ok: true as const, clientId: ws.client_id as string };
}

const ReextractSchema = z.object({ workshopId: z.string().uuid() });

export async function refetchEvalComments(formData: FormData) {
  await requireContentManager();
  const parsed = ReextractSchema.parse({ workshopId: formData.get("workshopId") });

  const result = await fetchEvalComments(parsed.workshopId);

  const admin = createSupabaseAdminClient();
  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", parsed.workshopId)
    .maybeSingle();

  if (ws?.client_id) {
    revalidatePath(`/admin/clients/${ws.client_id}/workshops/${parsed.workshopId}`);
    revalidatePath(`/dashboard/workshops/${parsed.workshopId}`);
  }
  return result;
}

export async function reextractIntents(formData: FormData) {
  await requireContentManager();
  const parsed = ReextractSchema.parse({ workshopId: formData.get("workshopId") });

  const result = await extractIntents(parsed.workshopId);

  const admin = createSupabaseAdminClient();
  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", parsed.workshopId)
    .maybeSingle();

  if (ws?.client_id) {
    revalidatePath(`/admin/clients/${ws.client_id}/workshops/${parsed.workshopId}`);
    revalidatePath(`/dashboard/workshops/${parsed.workshopId}`);
  }

  return result;
}

const TranscriptUploadSchema = z.object({ workshopId: z.string().uuid() });

export async function reuploadChat(formData: FormData) {
  await requireContentManager();
  const parsed = TranscriptUploadSchema.parse({ workshopId: formData.get("workshopId") });
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Chat CSV is required");
  if (file.size > 25 * 1024 * 1024) throw new Error("File too large (>25MB)");

  const csv = await file.text();
  const rows = parseChatCsv(csv);

  const admin = createSupabaseAdminClient();
  await admin.from("workshop_chats").delete().eq("workshop_id", parsed.workshopId);
  if (rows.length > 0) {
    const { error } = await admin
      .from("workshop_chats")
      .insert(rows.map((r) => ({ ...r, workshop_id: parsed.workshopId })));
    if (error) throw new Error(`Chat insert failed: ${error.message}`);
  }

  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", parsed.workshopId)
    .maybeSingle();
  if (ws?.client_id) {
    revalidatePath(`/admin/clients/${ws.client_id}/workshops/${parsed.workshopId}`);
  }

  return { chatRows: rows.length };
}

export async function reuploadQA(formData: FormData) {
  await requireContentManager();
  const parsed = TranscriptUploadSchema.parse({ workshopId: formData.get("workshopId") });
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Q&A CSV is required");
  if (file.size > 25 * 1024 * 1024) throw new Error("File too large (>25MB)");

  const csv = await file.text();
  const rows = parseQACsv(csv);

  const admin = createSupabaseAdminClient();
  await admin.from("workshop_qa").delete().eq("workshop_id", parsed.workshopId);
  if (rows.length > 0) {
    const { error } = await admin
      .from("workshop_qa")
      .insert(rows.map((r) => ({ ...r, workshop_id: parsed.workshopId })));
    if (error) throw new Error(`Q&A insert failed: ${error.message}`);
  }

  // Q&A drives intent extraction — re-run since signals changed.
  const intentResult = await extractIntents(parsed.workshopId).catch((e) => {
    console.error("[reuploadQA] intent re-extract failed:", e);
    return { inserted: 0 };
  });

  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", parsed.workshopId)
    .maybeSingle();
  if (ws?.client_id) {
    revalidatePath(`/admin/clients/${ws.client_id}/workshops/${parsed.workshopId}`);
  }

  return { qaRows: rows.length, intentInserted: intentResult.inserted };
}

const DeleteSchema = z.object({ workshopId: z.string().uuid() });

export async function deleteWorkshop(formData: FormData) {
  await requireContentManager();
  const parsed = DeleteSchema.parse({ workshopId: formData.get("workshopId") });

  const admin = createSupabaseAdminClient();
  const { data: ws } = await admin
    .from("workshops")
    .select("client_id")
    .eq("id", parsed.workshopId)
    .maybeSingle();

  const { error } = await admin.from("workshops").delete().eq("id", parsed.workshopId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/clients");
  if (ws?.client_id) revalidatePath(`/admin/clients/${ws.client_id}`);
}
