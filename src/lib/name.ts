/**
 * Ensure a first/last name pair is actually split across two fields.
 *
 * Attendee names arrive messy: some registrants type their whole name into
 * Zoom's "first name" box at sign-up, so we store e.g. first_name="Angela
 * O'Neal", last_name="". Exports must always keep first and last in separate
 * columns, so when the last name is empty and the first name holds more than
 * one word, we split on the first space — first token is the first name, the
 * remainder is the last name ("Mary Jo Smith" -> "Mary" / "Jo Smith"). Rows
 * that already have a real last name are returned untouched.
 */
export function splitName(
  first: string | null | undefined,
  last: string | null | undefined,
): { first: string; last: string } {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (l) return { first: f, last: l };
  const sp = f.indexOf(" ");
  if (sp === -1) return { first: f, last: "" };
  return { first: f.slice(0, sp).trim(), last: f.slice(sp + 1).trim() };
}
