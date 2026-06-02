import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isContentManager, requireConsoleAccess, userCanAccessClient } from "@/lib/auth";
import { WorkshopDetail } from "@/components/workshop-detail";
import type {
  Attendee,
  Client,
  QuestionTheme,
  Workshop,
  WorkshopEvalComment,
  WorkshopIntent,
  WorkshopQA,
} from "@/lib/supabase/types";
import { DeleteWorkshopButton } from "./delete-workshop-button";
import { ReextractButton } from "./reextract-button";
import { RefetchEvalButton } from "./refetch-eval-button";
import { ReuploadButton } from "./reupload-button";
import { ShareLinkBar } from "@/components/share-link-bar";

export default async function AdminWorkshopDetailPage({
  params,
}: {
  params: Promise<{ id: string; wid: string }>;
}) {
  const { id, wid } = await params;
  const session = await requireConsoleAccess();
  if (!userCanAccessClient(session, id)) redirect("/admin/clients?error=forbidden");

  const admin = createSupabaseAdminClient();

  const [{ data: client }, { data: workshop }] = await Promise.all([
    admin.from("clients").select("*").eq("id", id).maybeSingle<Client>(),
    admin
      .from("workshops")
      .select("*")
      .eq("id", wid)
      .eq("client_id", id)
      .maybeSingle<Workshop>(),
  ]);

  if (!client || !workshop) notFound();

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
      .eq("workshop_id", wid)
      .order("total_time_minutes", { ascending: false }),
    admin
      .from("question_themes")
      .select("*")
      .eq("workshop_id", wid)
      .order("count", { ascending: false }),
    admin.from("workshop_intents").select("*").eq("workshop_id", wid),
    admin
      .from("workshop_qa")
      .select("*")
      .eq("workshop_id", wid)
      .order("submitted_at"),
    admin
      .from("workshop_eval_comments")
      .select("*")
      .eq("workshop_id", wid)
      .order("display_order"),
  ]);

  const role = session.appUser?.role;
  const manager = isContentManager(role);
  // Export All available to everyone except single-client advisors.
  const isAdvisor = role === "advisor" || role === "client";

  return (
    <WorkshopDetail
      workshop={workshop}
      attendees={(attendees ?? []) as Attendee[]}
      themes={(themes ?? []) as QuestionTheme[]}
      intents={(intents ?? []) as WorkshopIntent[]}
      qa={(qa ?? []) as WorkshopQA[]}
      evalComments={(evalComments ?? []) as WorkshopEvalComment[]}
      backHref={`/admin/clients/${id}`}
      backLabel={client.name}
      leadsExportHref={`/api/leads/export?workshopId=${wid}&preset=live`}
      exportAllHref={isAdvisor ? undefined : `/api/leads/export?workshopId=${wid}&preset=all`}
      shareBar={manager ? <ShareLinkBar workshopId={wid} /> : undefined}
      deleteAction={
        manager ? (
          <>
            <ReuploadButton workshopId={wid} kind="chat" label="Re-upload Chat" />
            <ReuploadButton workshopId={wid} kind="qa" label="Re-upload Q&A" />
            <RefetchEvalButton workshopId={wid} />
            <ReextractButton workshopId={wid} />
            <DeleteWorkshopButton workshopId={wid} clientId={id} />
          </>
        ) : undefined
      }
    />
  );
}
