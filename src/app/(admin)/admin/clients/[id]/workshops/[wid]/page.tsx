import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isContentManager, requireConsoleAccess, userCanAccessClient } from "@/lib/auth";
import { WorkshopDetail } from "@/components/workshop-detail";
import type {
  Attendee,
  Client,
  QuestionTheme,
  Workshop,
  WorkshopChat,
  WorkshopEvalComment,
  WorkshopIntent,
  WorkshopQA,
} from "@/lib/supabase/types";
import { DeleteWorkshopButton } from "./delete-workshop-button";
import { ReextractButton } from "./reextract-button";
import { RefetchEvalButton } from "./refetch-eval-button";
import { ReuploadButton } from "./reupload-button";
import { Part2ToggleButton } from "./part2-toggle-button";
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
    { data: chats },
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
      .from("workshop_chats")
      .select("*")
      .eq("workshop_id", wid)
      .order("sent_at"),
    admin
      .from("workshop_eval_comments")
      .select("*")
      .eq("workshop_id", wid)
      .order("display_order"),
  ]);

  const role = session.appUser?.role;
  const manager = isContentManager(role);

  return (
    <WorkshopDetail
      workshop={workshop}
      attendees={(attendees ?? []) as Attendee[]}
      themes={(themes ?? []) as QuestionTheme[]}
      intents={(intents ?? []) as WorkshopIntent[]}
      qa={(qa ?? []) as WorkshopQA[]}
      chats={(chats ?? []) as WorkshopChat[]}
      evalComments={(evalComments ?? []) as WorkshopEvalComment[]}
      backHref={`/admin/clients/${id}`}
      backLabel={client.name}
      leadsExportHref={`/api/leads/export?workshopId=${wid}&preset=live`}
      exportAllHref={`/api/leads/export?workshopId=${wid}&preset=all`}
      evalsExportHref={client.eval_sheet_url ? `/api/evals/export?workshopId=${wid}` : undefined}
      shareBar={manager ? <ShareLinkBar workshopId={wid} /> : undefined}
      deleteAction={
        manager ? (
          <>
            {workshop.part2_enabled ? (
              <Link
                href={`/admin/clients/${id}/workshops/${wid}/part2`}
                className="inline-flex items-center gap-1 rounded-[7px] border border-line-1 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
              >
                Part 2 Booking
              </Link>
            ) : (
              <Part2ToggleButton clientId={id} workshopId={wid} enabled={false} />
            )}
            <Link
              href={`/admin/clients/${id}/workshops/${wid}/edit`}
              className="inline-flex items-center gap-1 rounded-[7px] border border-line-1 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 hover:text-ink-1"
            >
              Edit
            </Link>
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
