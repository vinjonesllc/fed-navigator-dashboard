import type { Attendee, Workshop } from "@/lib/supabase/types";

export type Funnel = {
  registered: number;
  attended: number; // participation === "Live"
  attendedPct: number; // attended / registered, 0–1
  engaged: number; // Live AND at least one chat / question / reaction
};

export function isLive(a: Attendee): boolean {
  return a.participation === "Live";
}

/**
 * Workshop Engagement Index — webinar-tuned, 0–10.
 *   duration_pct × 7
 *   + 1.5 if chats_sent > 5
 *   + 1.5 if total_questions_asked > 3
 * Clamped to [0, 10]. Returns null when scheduled_minutes is missing.
 */
export function engagementIndex(
  attendee: Attendee,
  scheduledMinutes: number | null,
): number | null {
  if (!scheduledMinutes || scheduledMinutes <= 0) return null;
  const durationPct = Math.min(1, (attendee.total_time_minutes ?? 0) / scheduledMinutes);
  const chatBonus = (attendee.chats_sent ?? 0) > 5 ? 1.5 : 0;
  const questionBonus = (attendee.total_questions_asked ?? 0) > 3 ? 1.5 : 0;
  const raw = durationPct * 7 + chatBonus + questionBonus;
  return Math.round(Math.min(10, Math.max(0, raw)) * 10) / 10;
}

export function buildFunnel(attendees: Attendee[]): Funnel {
  const registered = attendees.length;
  const live = attendees.filter(isLive);
  const attended = live.length;
  const engaged = live.filter(
    (a) =>
      (a.chats_sent ?? 0) > 0 ||
      (a.total_questions_asked ?? 0) > 0 ||
      (a.reactions_sent ?? 0) > 0,
  ).length;
  const attendedPct = registered > 0 ? attended / registered : 0;
  return { registered, attended, attendedPct, engaged };
}

export type EngagementBreakdown = {
  chats: number;
  questions: number;
  reactions: number;
};

/**
 * Aggregate engagement counts for a workshop.
 *
 * - `chats` and `reactions` are summed from each attendee's Zoom-reported counts.
 * - `questions` should be the count of actual Q&A submissions from the
 *   transcript table (workshop_qa). Zoom's per-attendee `total_questions_asked`
 *   field is unreliable — many workshops show 0 there even when there's a
 *   full Q&A transcript. Pass the non-dismissed Q&A row count via `qaCount`
 *   when available; otherwise we fall back to the attendee-summed value.
 */
export function engagementTotals(attendees: Attendee[], qaCount?: number): EngagementBreakdown {
  const summed = attendees.reduce(
    (acc, a) => ({
      chats: acc.chats + (a.chats_sent ?? 0),
      questions: acc.questions + (a.total_questions_asked ?? 0),
      reactions: acc.reactions + (a.reactions_sent ?? 0),
    }),
    { chats: 0, questions: 0, reactions: 0 },
  );
  return {
    ...summed,
    questions: typeof qaCount === "number" ? qaCount : summed.questions,
  };
}

export type RetentionPoint = { minute: number; attendees: number };

export function buildRetention(workshop: Workshop, attendees: Attendee[]): RetentionPoint[] {
  if (!workshop.scheduled_minutes) return [];
  const live = attendees.filter((a) => a.first_join_time && a.last_exit_time);
  if (live.length === 0) return [];

  const joins = live
    .map((a) => new Date(a.first_join_time as string).getTime())
    .filter((t) => Number.isFinite(t));
  if (joins.length === 0) return [];

  const start = Math.min(...joins);
  const stepMinutes = 5;
  const totalSteps = Math.ceil(workshop.scheduled_minutes / stepMinutes);

  const points: RetentionPoint[] = [];
  for (let i = 0; i <= totalSteps; i++) {
    const tMs = start + i * stepMinutes * 60_000;
    const stillIn = live.filter((a) => {
      const j = new Date(a.first_join_time as string).getTime();
      const x = new Date(a.last_exit_time as string).getTime();
      return j <= tMs && x >= tMs;
    }).length;
    points.push({ minute: i * stepMinutes, attendees: stillIn });
  }
  return points;
}
