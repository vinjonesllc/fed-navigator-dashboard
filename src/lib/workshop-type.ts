/**
 * Workshop type — a full workshop runs a post-event evaluation, a Lunch & Learn
 * doesn't. Chosen at upload (and editable afterwards) on `workshops.workshop_type`.
 *
 * Everything eval-shaped keys off `hasEvaluations`: the report's "What attendees
 * said" section, the "Download evaluations" button, the eval columns on the
 * attendee export, the per-attendee eval lookup, and the post-upload eval fetch.
 */

export type WorkshopType = "full" | "lnl";

export const WORKSHOP_TYPES: { value: WorkshopType; label: string }[] = [
  { value: "full", label: "Full Workshop" },
  { value: "lnl", label: "L&L" },
];

export const DEFAULT_WORKSHOP_TYPE: WorkshopType = "full";

export function workshopTypeLabel(type: string | null | undefined): string {
  return WORKSHOP_TYPES.find((t) => t.value === type)?.label ?? "Full Workshop";
}

/**
 * Only L&Ls opt out. Written as "not lnl" rather than "is full" on purpose:
 * rows read before migration 0032 is applied have no `workshop_type` at all,
 * and those are full workshops that must keep their evaluations.
 */
export function hasEvaluations(
  workshop: { workshop_type?: string | null } | null | undefined,
): boolean {
  return workshop?.workshop_type !== "lnl";
}
