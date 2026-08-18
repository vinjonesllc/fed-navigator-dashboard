# Fed Navigator Dashboard — Content Inventory (Phase 1 contract)

**Target screen:** advisor-facing Overview dashboard, `/dashboard`
**Source files read in full:**
- `src/app/(client)/dashboard/page.tsx` — the page itself
- `src/app/(client)/layout.tsx` — nav + shell around it
- `src/components/app-header.tsx` — header chrome
- `src/components/client-overview.tsx` — stats + workshops table
- `src/components/next-workshop-card.tsx` — next-workshop module
- `src/components/change-password-dialog.tsx`, `theme-toggle.tsx`, `clickable-row.tsx`, `fed-nav-logo.tsx`
- `src/app/globals.css`, `src/app/layout.tsx` — tokens + fonts
- `src/lib/queries.ts`, `src/lib/next-workshop.ts`, `src/lib/format-date.ts`, `src/lib/supabase/types.ts` — data + calculations

**Contract rule:** every numbered item below appears in all three Phase 2 redesigns. Nothing dropped, merged, or simplified away.

**Amendments** — the only sanctioned way an item leaves this contract:

| Items | Change | Authorised |
|---|---|---|
| 3, 4, 5 | Client co-branding (separator, client logo, client name) removed product-wide. Fed Navigator branding only. | owner, this session |
| 21, 44, 47 | The accent is no longer per-client (`clients.accent_color`); it is the single Fed Navigator/Fed Pilot brand blue `#3080C2`. The strips and hairlines remain — only their source changes. | owner, this session (included in the cleanup task) |
| 42, 63 | Average rating becomes a **cumulative** average — every response weighted once (`Σ rating × responses ÷ Σ responses`) instead of a mean of per-workshop means. The caption changes from "Across {N} rated workshops" to "Across {N} responses from {M} workshops"; the old wording survives as a fallback when no workshop carries a response count. | owner, this session (flag F3) |

---

## §1 — Header / global chrome

| # | Item | Notes |
|---|---|---|
| 1 | Fed Navigator logo mark (compass app-tile SVG), 32×32, links to `/` | inline SVG, self-contained navy tile |
| 2 | Wordmark text "Fed Navigator" | display font |
| ~~3~~ | ~~Separator glyph `/` between Fed Navigator and the client identity~~ | **RETIRED by decision — co-branding dropped product-wide.** Numbering kept so earlier references stay valid. |
| ~~4~~ | ~~Client logo image (`clients.logo_url`), 28×28, `alt` = client name~~ | **RETIRED** — see above. Leaves `clients.logo_url` + the admin logo-upload UI unused. |
| ~~5~~ | ~~Client name text (`clients.name`)~~ | **RETIRED** — see above. |
| 6 | Nav link "Overview" → `/dashboard` | |
| 7 | Nav link "Workshops" → `/dashboard/workshops` | |
| 8 | Nav link "Leads" → `/dashboard/leads` | |
| 9 | Nav link "Guide" → `/dashboard/guide` | |
| 10 | Nav link "Settings" → `/dashboard/settings` | |
| 11 | Theme toggle control (Moon/Sun icon, `aria-label` "Switch to light mode" / "Switch to dark mode", persists to `localStorage['fednav-theme']`) | |
| 12 | Identity chip — initials avatar (up to 2 letters from the email local-part, uppercased) | gradient green→blue disc |
| 13 | Identity chip — signed-in email address | |
| 14 | Identity chip — role badge: "Advisor" / "Super-Advisor" / "Editor" / "Admin" | lime-tinted pill, mono |
| 15 | Change-password dialog (opened by the identity chip): title "Change password"; description "Signed in as {email}. Enter your current password, then choose a new one."; fields **Current password**, **New password**, **Confirm new password**; helper "At least 8 characters."; submit "Update password" (busy label "Saving…"); messages "New password must be at least 8 characters", "New passwords don't match", "New password must be different from the current one", "Current password is incorrect", "Password updated" | |
| 16 | "Sign out" button (POST to `/auth/sign-out`) | |
| 17 | Content container max-width 1360px | layout constraint, not content |

## §2 — Page title block

| # | Item |
|---|---|
| 18 | H1 "Overview" |
| 19 | Subhead "All-time totals across your workshops." |

## §3 — Next workshop module

| # | Item | Notes |
|---|---|---|
| 20 | Eyebrow label "Next workshop" / "Next workshops" | singular vs plural by count |
| 21 | Client accent strip (3px left rule, `clients.accent_color`) | conditional |
| 22 | Tile — date label, e.g. "Friday, June 5" (weekday, month, day) | |
| 23 | Tile — time label, e.g. "10am Central" (hour + Eastern/Central/Mountain/Pacific) | blank but height-reserved when unset |
| 24 | Tile — registrant count (integer, or "—" when unavailable) | live row count from the client's registrant sheet tab |
| 25 | Tile — caption "registered" | |
| 26 | Tile — "Download registrations" button + download arrow icon → `/api/registrations/export?clientId={id}&w={index}` | only when eval sheet + registrant tab are configured |
| 27 | Empty state headline "No next workshop scheduled yet." | |
| 28 | Empty state body "Contact Kelly to schedule your next workshop." | |
| 29 | "Kelly" mailto link → `kelly@vinjones.com`, subject "Next Workshop Date" | |
| 30 | Ordering rule: past-dated workshops dropped, remaining sorted soonest-first | |

## §4 — Stat tiles

| # | Item | Notes |
|---|---|---|
| 31 | Tile 1 label "Workshops" | |
| 32 | Tile 1 value — workshop count | |
| 33 | Tile 2 label "Total attendees" | |
| 34 | Tile 2 value — sum of live attendees | |
| 35 | Tile 2 hint "{N} registered" | |
| 36 | Tile 3 label "Average attendance" | |
| 37 | Tile 3 value "{N}%" | |
| 38 | Tile 3 hint "Live ÷ registered" | **the only methodology note on the page** |
| 39 | Tile 4 label "Average rating" | |
| 40 | Tile 4 value "{N.N}" + unit "/ 5" | |
| 41 | Tile 4 five-star glyph row (full / half / dimmed, amber), `aria-label` "{N.N} out of 5 stars" | |
| 42 | Tile 4 caption "Across {N} rated workshop" / "workshops" | singular/plural |
| 43 | Tile 4 empty state — "—" plus "No ratings yet" | |
| 44 | Tile top hairline accent gradient (client accent, neutral fallback) | |

## §5 — Workshops table

| # | Item | Notes |
|---|---|---|
| 45 | Card heading "Workshops" | |
| 46 | Count pill — number of workshops (mono) | |
| 47 | Card accent strip (client accent) | |
| 48 | Column head "Date" | left |
| 49 | Column head "Title" | left |
| 50 | Column head "Registered" | right-aligned |
| 51 | Column head "Attended (live)" | right-aligned |
| 52 | Column head "% Attended" | right-aligned |
| 53 | Cell — workshop date, format "May 20, 2026" | |
| 54 | Cell — workshop title | |
| 55 | Cell — registered count | |
| 56 | Cell — live attended count | |
| 57 | Cell — attendance percentage | |
| 58 | Whole-row click → `/dashboard/workshops/{id}`; tooltip "Click to view this workshop" | inner links/buttons keep their own behaviour |
| 59 | Table empty state "No workshops yet." | |

## §6 — Calculations (must remain identical)

| # | Calculation |
|---|---|
| 60 | `totalAttendees` = Σ of each workshop's live attendee count |
| 61 | `totalRegistered` = Σ of each workshop's `registered_count` |
| 62 | `avgAttendancePct` = round(totalAttendees ÷ totalRegistered × 100); **0 when totalRegistered is 0** — pooled, not an average of per-workshop rates |
| 63 | `avgRating` = unweighted mean of each rated workshop's own average rating, rounded to 1 decimal; null when none are rated |
| 64 | `ratedWorkshops` = count of workshops with a non-null average rating |
| 65 | Row `% Attended` = round(live ÷ registered × 100); **0 when registered is 0** |
| 66 | "Attended (live)" = attendees whose participation is `Live`, recomputed from attendee rows — **deliberately not** the stored `attended_count` column, which can be stale |
| 67 | Star fill: full star per whole point; a half-lit star when the fraction is ≥ .25 and < .75; remaining stars dimmed to 25% |
| 68 | Upcoming-workshop registrant count = live data-row count of the configured registrant tab in the client's eval sheet |
| 69 | Dates parsed from the `YYYY-MM-DD` prefix with no timezone conversion. Two formats coexist: "May 20, 2026" (table) and "Friday, June 5" (next-workshop tile) |

---

## Flags — redundancy / gaps I did **not** act on

These are questions, not changes. Everything stays in all three builds until you say otherwise.

- **F1 — "Actions" / Edit column.** The shared `ClientOverview` component can render a sixth "Actions" column with an Edit link, but the advisor dashboard never passes `editHref`, so it is not part of this screen. Not in the contract; not added.
- **F2 — Computed but never shown.** `getClientWorkshops` also computes `avg_engagement` and `opted_in_count` per workshop. Neither surfaces anywhere on Overview. Want either exposed? (Adding is out of scope until you say so.)
- **F3 — Mixed methodology.** Attendance is a *pooled* ratio (#62) while rating is an *unweighted mean of means* (#63). Both are kept exactly as-is; flagging because a client asking "how is this averaged?" gets two different answers, and only one of the two (#38) is explained on screen.
- **F4 — No mobile navigation.** The five nav links (#6–10) are `hidden md:flex`. On a phone there is currently no way to reach Workshops / Leads / Guide / Settings. All three redesigns solve this rather than reproduce it.
- **F5 — Identity chip hidden below `sm`.** Email, role badge, and the change-password entry point disappear on phones today. All three redesigns keep them reachable.
- **F6 — No footer, no data-freshness stamp, no compliance line.** For a client-facing deliverable in financial services there is no "data as of…" timestamp and no disclaimer anywhere on the page. Nothing invented — flagging the gap.
- **F7 — Overlap, harmless.** Stat 2's hint "{N} registered" (#35) is the column-sum of #55. Both kept.
