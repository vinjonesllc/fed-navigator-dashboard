import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { WorkshopDetail } from "@/components/workshop-detail";
import type {
  Attendee,
  QuestionTheme,
  Workshop,
  WorkshopEvalComment,
  WorkshopIntent,
  WorkshopQA,
} from "@/lib/supabase/types";

export default async function WorkshopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser();
  const clientId = session.appUser?.client_id;
  if (!clientId) redirect("/login?error=no-client");

  const admin = createSupabaseAdminClient();
  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("id", id)
    .eq("client_id", clientId)
    .maybeSingle<Workshop>();

  if (!workshop) notFound();

  const { data: client } = await admin
    .from("clients")
    .select("eval_sheet_url")
    .eq("id", clientId)
    .maybeSingle<{ eval_sheet_url: string | null }>();

  const [
    { data: attendees },
    { data: themes },
    { data: intents },
    { data: qa },
    { data: evalComments },
  ] = await Promise.all([
    admin
      .from("attendees")
      .select("*")
      .eq("workshop_id", id)
      .order("total_time_minutes", { ascending: false }),
    admin
      .from("question_themes")
      .select("*")
      .eq("workshop_id", id)
      .order("count", { ascending: false }),
    admin.from("workshop_intents").select("*").eq("workshop_id", id),
    admin
      .from("workshop_qa")
      .select("*")
      .eq("workshop_id", id)
      .order("submitted_at"),
    admin
      .from("workshop_eval_comments")
      .select("*")
      .eq("workshop_id", id)
      .order("display_order"),
  ]);

  return (
    <WorkshopDetail
      workshop={workshop}
      attendees={(attendees ?? []) as Attendee[]}
      themes={(themes ?? []) as QuestionTheme[]}
      intents={(intents ?? []) as WorkshopIntent[]}
      qa={(qa ?? []) as WorkshopQA[]}
      evalComments={(evalComments ?? []) as WorkshopEvalComment[]}
      backHref="/dashboard/workshops"
      backLabel="Workshops"
      leadsExportHref={`/api/leads/export?workshopId=${id}&preset=live`}
      exportAllHref={`/api/leads/export?workshopId=${id}&preset=all`}
      evalsExportHref={client?.eval_sheet_url ? `/api/evals/export?workshopId=${id}` : undefined}
    />
  );
}
