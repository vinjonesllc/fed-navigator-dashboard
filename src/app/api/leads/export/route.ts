import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { requireUser, userCanAccessClient } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Attendee, Workshop } from "@/lib/supabase/types";

type Preset = "hot" | "engaged" | "live" | "noshow" | "all";

function presetFilter(rows: Attendee[], workshop: Workshop, preset: Preset): Attendee[] {
  switch (preset) {
    case "hot": {
      const target = workshop.scheduled_minutes ?? 60;
      return rows.filter(
        (r) => r.text_opt_in && (r.total_time_minutes ?? 0) >= target * 0.5,
      );
    }
    case "engaged":
      return rows.filter(
        (r) =>
          (r.chats_sent ?? 0) > 0 ||
          (r.total_questions_asked ?? 0) > 0 ||
          (r.poll_quiz_responses ?? 0) > 0,
      );
    case "live":
      return rows.filter((r) => r.participation === "Live");
    case "noshow":
      return rows.filter((r) => r.attendance_bucket === "no_show");
    case "all":
    default:
      return rows;
  }
}

export async function GET(request: NextRequest) {
  const session = await requireUser();
  const workshopId = request.nextUrl.searchParams.get("workshopId");
  const preset = (request.nextUrl.searchParams.get("preset") as Preset | null) ?? "all";
  if (!workshopId) {
    return NextResponse.json({ error: "workshopId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: workshop } = await admin
    .from("workshops")
    .select("*")
    .eq("id", workshopId)
    .maybeSingle<Workshop>();

  if (!workshop) {
    return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
  }
  // Authorization: must be able to access this client.
  // Additionally, the "all" preset (which includes non-attendees and an
  // attended Y/N column) is restricted to admin + editor + super_advisor —
  // not single-client advisors.
  if (!userCanAccessClient(session, workshop.client_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role = session.appUser?.role;
  const isAdvisor = role === "advisor" || role === "client";
  if (preset === "all" && isAdvisor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: attendees } = await admin
    .from("attendees")
    .select("*")
    .eq("workshop_id", workshopId);

  const rows = presetFilter((attendees ?? []) as Attendee[], workshop, preset);

  const includeAttended = preset === "all";
  const csvRows = rows.map((r) => {
    const base = {
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      agency: r.agency ?? "",
      state: r.state_province ?? "",
      age: r.age ?? "",
      registration_question: r.registration_question ?? "",
    };
    return includeAttended
      ? { ...base, attended: r.participation === "Live" ? "Yes" : "No" }
      : base;
  });

  const csv = Papa.unparse(csvRows);
  const safeTitle = workshop.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const filename = `leads_${safeTitle}_${preset}_${workshop.workshop_date}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
