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
import {
  AC_FIELD_TITLES,
  getCustomFieldMap,
  isActiveCampaignConfigured,
  missingFieldTitles,
  resolveAutomationId,
  resolveListId,
  uploadContactsToAc,
  type AcContactInput,
} from "@/lib/activecampaign";
import {
  formatNextWorkshopDateOrdinal,
  formatNextWorkshopTime,
  isFutureWorkshopDate,
  toUsDate,
} from "@/lib/next-workshop";

// Only Fed Pilot-branded advisors get the optional ActiveCampaign upload.
const AC_BRAND = "Fed Pilot";
const AC_ATTENDED_TAG = "FP-Attended";
// Every uploaded contact is enrolled in this post-event automation.
const AC_AUTOMATION = "FP-ZOOM EVENT MASTER (POST-EVENT)";
// ...and subscribed to this list.
const AC_LIST = "Federal Employees";

const Schema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(2),
  workshopDate: z.string().min(8),
  presenter: z.string().optional(),
  topic: z.string().optional(),
  notes: z.string().optional(),
  uploadToAc: z.coerce.boolean().optional(),
});

export async function uploadCsv(formData: FormData) {
  await requireContentManager();

  const attendeeFile = formData.get("attendeeFile") as File | null;
  const chatFile = formData.get("chatFile") as File | null;
  const qaFile = formData.get("qaFile") as File | null;

  if (!attendeeFile || attendeeFile.size === 0) {
    throw new Error("Attendee CSV is required");
  }
  // Q&A and chat transcripts are both optional — we sometimes don't have them.
  // All core workshop stats come from the attendee file; a missing Q&A leaves
  // the Q&A transcript (and Q&A-derived intents) empty, and a missing chat
  // leaves the message-level transcript empty.
  const hasQa = !!qaFile && qaFile.size > 0;
  const hasChat = !!chatFile && chatFile.size > 0;
  for (const f of [attendeeFile, ...(hasQa ? [qaFile] : []), ...(hasChat ? [chatFile] : [])]) {
    if (f.size > 25 * 1024 * 1024) throw new Error(`File ${f.name} too large (>25MB)`);
  }

  const parsed = Schema.parse({
    clientId: formData.get("clientId"),
    title: formData.get("title"),
    workshopDate: formData.get("workshopDate"),
    presenter: formData.get("presenter") ?? undefined,
    topic: formData.get("topic") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    uploadToAc: formData.get("uploadToAc") === "true",
  });

  const [attendeeCsv, chatCsv, qaCsv] = await Promise.all([
    attendeeFile.text(),
    hasChat ? chatFile.text() : Promise.resolve(""),
    hasQa ? qaFile.text() : Promise.resolve(""),
  ]);

  // 1. Ingest attendees (creates the workshop row + attendee rows).
  const result = await ingestZoomCsv({
    clientId: parsed.clientId,
    title: parsed.title,
    workshopDate: parsed.workshopDate,
    presenter: parsed.presenter ?? null,
    topic: parsed.topic ?? null,
    notes: parsed.notes ?? null,
    // scheduledMinutes omitted → ingest derives it from the attendee data.
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

  // 5. Optional ActiveCampaign upload — only when "Upload to AC?" was checked
  //    AND the advisor is on the Fed Pilot brand. Creates-or-updates each
  //    attendee as a contact with their workshop info + custom fields, and tags
  //    live attendees FP-Attended. Heavy syncing runs after the response
  //    (`after`) so it never blocks the upload; a field-existence pre-check runs
  //    synchronously so we can flag any missing AC fields in the result.
  let ac:
    | {
        enabled: boolean;
        requested: number;
        missingFields: string[];
        automationMissing: boolean;
        listMissing: boolean;
      }
    | undefined;

  const { data: client } = await admin
    .from("clients")
    .select(
      "brand, name, slug, next_workshop_date, next_workshop_hour, next_workshop_tz",
    )
    .eq("id", parsed.clientId)
    .maybeSingle();

  if (parsed.uploadToAc && client?.brand === AC_BRAND) {
    const { data: attRows } = await admin
      .from("attendees")
      .select(
        "first_name, last_name, email, phone, age, registration_question, agency, organization, text_opt_in, participation",
      )
      .eq("workshop_id", result.workshopId);

    // Next Workshop fields only when the advisor has a *future* date set.
    const nextDate = client.next_workshop_date as string | null;
    const futureNext = isFutureWorkshopDate(nextDate)
      ? {
          date: toUsDate(nextDate),
          text: formatNextWorkshopDateOrdinal(nextDate as string),
          time:
            formatNextWorkshopTime(
              client.next_workshop_hour as number | null,
              client.next_workshop_tz as string | null,
            ) ?? "",
        }
      : null;

    const workshopDateUs = toUsDate(parsed.workshopDate);
    const advInfoUrl = client.slug ? `https://fedpilot.com/info-${client.slug}` : "";
    const advisorName = (client.name as string) ?? "";

    const contacts: AcContactInput[] = (attRows ?? [])
      .filter((a) => !!a.email)
      .map((a) => {
        const fields: { title: string; value: string }[] = [
          { title: AC_FIELD_TITLES.workshopDate, value: workshopDateUs },
          { title: AC_FIELD_TITLES.advisorNames, value: advisorName },
          { title: AC_FIELD_TITLES.advInfoUrl, value: advInfoUrl },
          { title: AC_FIELD_TITLES.oneQuestion, value: a.registration_question ?? "" },
          { title: AC_FIELD_TITLES.age, value: a.age != null ? String(a.age) : "" },
          { title: AC_FIELD_TITLES.agency, value: a.agency ?? a.organization ?? "" },
          { title: AC_FIELD_TITLES.textUpdates2, value: a.text_opt_in ? "YES" : "" },
        ];
        if (futureNext) {
          fields.push(
            { title: AC_FIELD_TITLES.nextWorkshopDate, value: futureNext.date },
            { title: AC_FIELD_TITLES.nextWorkshopText, value: futureNext.text },
            { title: AC_FIELD_TITLES.nextWorkshopTime, value: futureNext.time },
          );
        }
        return {
          email: a.email as string,
          firstName: a.first_name,
          lastName: a.last_name,
          phone: a.phone,
          attended: a.participation === "Live",
          fields,
        };
      });

    // Synchronous pre-check: which target fields are missing in AC and whether
    // the post-event automation exists (so the upload toast can flag them).
    // Best-effort; never blocks the upload.
    let fieldMap: Awaited<ReturnType<typeof getCustomFieldMap>> | undefined;
    let missingFields: string[] = [];
    let automationMissing = false;
    if (isActiveCampaignConfigured()) {
      try {
        fieldMap = await getCustomFieldMap();
        const usedTitles = Array.from(
          new Set(contacts.flatMap((c) => c.fields.map((f) => f.title))),
        );
        missingFields = missingFieldTitles(fieldMap, usedTitles);
      } catch (e) {
        console.error("[upload] AC field pre-check failed:", e);
      }
      try {
        automationMissing = (await resolveAutomationId(AC_AUTOMATION)) === null;
      } catch (e) {
        console.error("[upload] AC automation pre-check failed:", e);
      }
    }

    let listMissing = false;
    if (isActiveCampaignConfigured()) {
      try {
        listMissing = (await resolveListId(AC_LIST)) === null;
      } catch (e) {
        console.error("[upload] AC list pre-check failed:", e);
      }
    }

    ac = {
      enabled: true,
      requested: contacts.length,
      missingFields,
      automationMissing,
      listMissing,
    };

    if (contacts.length > 0) {
      after(async () => {
        try {
          const r = await uploadContactsToAc(
            contacts,
            AC_ATTENDED_TAG,
            AC_AUTOMATION,
            AC_LIST,
            fieldMap,
          );
          if (!r.configured) {
            console.warn("[upload] ActiveCampaign not configured; skipped contact upload.");
          } else {
            console.log(
              `[upload] AC upload: synced ${r.synced}/${r.requested}, tagged ${r.tagged}, ` +
                `list ${r.listAdded} (found=${r.listFound}), ` +
                `automation ${r.automationAdded} (found=${r.automationFound}), ` +
                `${r.errors} errors. Missing fields: ${r.missingFields.join(", ") || "none"}.`,
            );
          }
        } catch (e) {
          console.error("[upload] ActiveCampaign upload failed:", e);
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
    ac,
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
