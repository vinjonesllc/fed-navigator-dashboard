# Fed Navigator Workshop Report — Content Inventory (contract)

**Target screen:** advisor-facing workshop report, `/dashboard/workshops/[id]`
**Companion to:** `INVENTORY.md` (the Overview screen, items 1–69)

**Source files read in full:**
- `src/app/(client)/dashboard/workshops/[id]/page.tsx` — the advisor route; fixes which props the report gets
- `src/components/workshop-detail.tsx` — the report itself (778 lines)
- `src/components/attendees-table.tsx` — the directory table + sorting
- `src/components/attendee-detail-modal.tsx` — the per-person drill-down
- `src/components/section-help.tsx` — the "?" popovers
- `src/components/charts/retention-chart.tsx` — the curve
- `src/lib/workshop-stats.ts` — funnel, engagement index, totals, retention
- `src/lib/format-date.ts` · `src/lib/supabase/types.ts`
- `src/app/share/workshops/[wid]/page.tsx` — the public variant (see FR3)

**Scope note.** The app shell (logo, co-branding, nav, theme toggle, identity chip, change-password dialog, sign out) is items 1–17 of `INVENTORY.md` and is not renumbered here. This document covers only what the report screen adds.

**Contract rule:** every numbered item below appears in the redesign. Nothing dropped, merged, or simplified away. Flag and ask instead of deleting.

---

## §1 — Breadcrumb

| # | Item | Notes |
|---|---|---|
| R1 | "← Workshops" link → `/dashboard/workshops` | label comes from `backLabel` |
| R2 | Separator `/` | |
| R3 | Workshop date, e.g. "May 20, 2026" | `formatWorkshopDate` |

## §2 — Page head

| # | Item | Notes |
|---|---|---|
| R4 | H1 — workshop title | |
| R5 | Topic suffix "· {topic}", smaller + muted | conditional |
| R6 | Meta "WORKSHOP {date}" | |
| R7 | Meta "PRESENTER {name}" | conditional |
| R8 | Meta "DURATION {n} min" | conditional |
| R9 | "↓ Export All" → `/api/leads/export?workshopId={id}&preset=all` | plain `<a>`, not a client-side link — it streams a CSV |
| R10 | "↓ Export Attendees" → `/api/leads/export?workshopId={id}&preset=live` | primary/solid |

## §3 — KPI row (deliberately ranked, not four equal tiles)

| # | Item | Notes |
|---|---|---|
| R11 | "Attended (live)" label + **KEY** badge | `tone="primary"` — largest, accented, left bar |
| R12 | value = live attendee count | |
| R13 | hint "Participation = Live" | |
| R14 | "% Attended" label | `tone="secondary"` — second largest |
| R15 | value "{n}%" | |
| R16 | hint "Live ÷ registered" | |
| R17 | "Registered" label | neutral, muted |
| R18 | value = total ingested rows | |
| R19 | hint "Total CSV rows ingested" | |
| R20 | "Engaged" label | neutral, muted |
| R21 | value = engaged count | |
| R22 | hint "≥ 1 chat, question, or reaction" | |

## §4 — What attendees said

| # | Item | Notes |
|---|---|---|
| R23 | Eyebrow "Social proof" | |
| R24 | Section title "What attendees said" | |
| R25 | "?" help popover — title + three blocks: **What it is** / **What to click — and what you'll see** / **Use it to book more appointments** | exact copy in `workshop-detail.tsx` |
| R26 | Count pill "{n} quoted" | only when comments exist |
| R27 | "↓ Download evaluations" → `/api/evals/export?workshopId={id}` | only when the client has an eval sheet |
| R28 | Rating value "{avg}" | |
| R29 | Unit "/ 5" | |
| R30 | Five-star row (full / half / 25%-dim, amber), `aria-label` "{avg} out of 5 stars" | |
| R31 | Caption "Average rating · {n} responses" | responses clause only when > 0 |
| R32 | Quote text | |
| R33 | Attribution "— {author}, {agency}" — "Anonymous" when no author | agency clause optional |
| R34 | A quote with an author opens that person's modal; without one it is inert | |
| R35 | "Showing 6 of {n}. Download evaluations for the full set." | only when > 6 |
| R36 | Empty state: "No eval responses linked to this workshop yet. They'll appear here once attendees fill out the evaluation form and the date in the sheet falls within 7 days after the workshop date. Click **Re-fetch evals** to retry." | see **FR2** |

## §5 — Engagement & retention

| # | Item | Notes |
|---|---|---|
| R37 | Eyebrow "Participation" | |
| R38 | Section title "Engagement & retention" | |
| R39 | Card label "Engagement breakdown" | |
| R40 | Pill "Totals · {n} live" | |
| R41 | "Chats" + value | |
| R42 | "Questions" + value | |
| R43 | "Reactions" + value | |
| R44 | Footnote "Totals across all live attendees." | |
| R45 | Card label "Retention curve" | |
| R46 | Pill "{n} min session" | conditional |
| R47 | The curve — attendees remaining vs. minutes elapsed | |
| R48 | Empty state "Needs join/exit timestamps + scheduled length on the workshop." | |

## §6 — Buying signals

| # | Item | Notes |
|---|---|---|
| R49 | Eyebrow "Follow-up" | |
| R50 | Section title "Buying signals" | |
| R51 | Count "{n} flagged" = retiring + cliff + worried | |
| R52 | Panel "Retiring within the next 12 months" + "?" help + "{n} person/people" | |
| R53 | Row — name · source badge · email · timing | |
| R54 | Empty "No retirement intent detected." | |
| R55 | Panel "Cliff notes requested" + "?" help + "{n} request/requests" | |
| R56 | Row — name · source badge · email · detail line | |
| R57 | Empty "No cliff-notes requests detected." | |
| R58 | Panel "Worried about current situation" + "?" help + "{n} person/people" | |
| R59 | Card — the person's own quote, then name · source badge · email | |
| R60 | Empty "No worried / confused signals detected." | |
| R61 | Source badges: **Eval** (amber tint) · **Q&A** · **Chat + Q&A** · **Chat**, each with its title tooltip | Eval = post-workshop evaluation; others = live transcript |
| R62 | Every row/card opens that person's modal | |

## §7 — Q&A

| # | Item | Notes |
|---|---|---|
| R63 | Eyebrow "Transcript" | |
| R64 | Section title "Q&A" + "?" help | |
| R65 | Count "{n} question/questions" | dismissed questions excluded |
| R66 | Column "Question" | |
| R67 | Column "Asked by" — name over email | name resolved from the attendee list by email when Zoom omits it |
| R68 | Row opens that person's modal (when name or email is known) | |
| R69 | Empty "No Q&A submitted." | |
| R70 | "↕ Scroll to see all {n} questions." | only when > 7 |

## §8 — Live attendees

| # | Item | Notes |
|---|---|---|
| R71 | Eyebrow "Directory" | |
| R72 | Section title "Live attendees" + "?" help | |
| R73 | Count = live attendees | |
| R74 | "↓ Export All" + "↓ Export Attendees" repeated in the section head | same targets as R9/R10 |
| R75 | Sortable column "Name" | |
| R76 | Sortable column "Agency" | |
| R77 | Sortable column "Time" + "(min)", right-aligned | |
| R78 | Sortable column "Engagement" + "(0–10)" + ⓘ tooltip carrying the formula | |
| R79 | Sort behaviour: default engagement ↓; name/agency default ↑; time/engagement default ↓; re-click flips | |
| R80 | Row — initials avatar (stable colour per person) | |
| R81 | Row — name over email | |
| R82 | Row — agency badge; `.gov` / `.mil` / `.fed.us` domains tinted apart from the rest | falls back to email domain, then "—" |
| R83 | Row — "{time} / {scheduled}" | |
| R84 | Row — "{score} / 10" + proportional bar; "—" when no scheduled length | |
| R85 | Row tooltip "Click for this attendee's chats, questions, time & evaluation" | |
| R86 | Empty "No live attendees yet." | |
| R87 | "Showing first 200 of {n}. Export CSV for the full list." | only when > 200 |
| R88 | Footnote — the engagement formula in words + "Click any attendee to see their chats, questions, time & evaluation." | |

## §9 — Attendee detail modal (opens from R34, R62, R68, R85)

| # | Item | Notes |
|---|---|---|
| R89 | Title = full name, or "Attendee" | |
| R90 | Description = email (or "—") + " · {agency}" | |
| R91 | Stat chip ⏱ "{time}/{scheduled}" + "min" — or "—" + "not a live attendee" | |
| R92 | Stat chip 💬 count + "chat/chats" | |
| R93 | Stat chip ❓ count + "question/questions" | |
| R94 | Stat chip 📊 "{score}/10" + "engagement" | only when a score exists |
| R95 | Section "Chat messages ({n})" | |
| R96 | Chat rows, with "(reply)" marker on replies | |
| R97 | "No chat transcript was uploaded for this workshop." | |
| R98 | "No chat messages from this person." | |
| R99 | Section "Questions asked ({n})" | |
| R100 | Question rows, each with an optional "Answer: {…}" sub-line | |
| R101 | "No questions from this person." | |
| R102 | Section "Evaluation" | |
| R103 | "Looking up evaluation…" | loading |
| R104 | "Couldn't load evaluation: {message}" | error |
| R105 | "No evaluations sheet configured for this client." | |
| R106 | "No evaluation found for this person (matched by email, then name)." | |
| R107 | Evaluation field rows — label / value pairs | 40/60 split |

## §10 — Calculations (must remain identical)

| # | Calculation |
|---|---|
| R108 | `registered` = every attendee row ingested for the workshop |
| R109 | `attended` = rows where `participation === "Live"` |
| R110 | `engaged` = live **and** (chats > 0 **or** questions > 0 **or** reactions > 0) |
| R111 | `attendedPct` = attended ÷ registered, **0 when registered is 0**; displayed as `round(pct × 100)%` |
| R112 | **Engagement index (0–10)** = `min(1, time ÷ scheduled) × 7` + `1.5` if chats > 5 + `1.5` if questions > 3, clamped to 0–10, one decimal. **Null when the workshop has no scheduled length** — the column then shows "—" |
| R113 | Engagement totals: chats and reactions are summed per attendee; **questions is the Q&A row count**, not the per-attendee sum — Zoom's per-attendee figure is unreliable and often 0 despite a full transcript |
| R114 | Retention: 5-minute steps from the earliest join to the scheduled length; each point counts attendees whose join ≤ t ≤ exit. Requires join + exit timestamps **and** a scheduled length |
| R115 | Star fill: full per whole point; half when the fraction is ≥ .25 and < .75; remainder at 25% opacity |
| R116 | Caps: quote wall shows 6; attendee table shows 200 |
| R117 | Person matching (quote → profile, Q&A → profile): email first, case- and whitespace-normalised; then name |
| R118 | Intent timing: rendered as a date when the value is ISO, otherwise as free text ("8 weeks", "Possibly December"); "Within 12 months" when empty |

---

---

# Public share page — `/share/workshops/[wid]`

Approved for inclusion (FR3). Logged-out, read-only. It is **not** a subset of the private report: the stat ranking, the rating treatment and several strings differ, so it gets its own numbering.

**Source:** `src/app/share/workshops/[wid]/page.tsx` + `src/app/share/layout.tsx`
**Build:** `share-b-console.html`

| # | Item | Notes |
|---|---|---|
| S1 | Fed Navigator mark → `/` | |
| S2 | "Fed Navigator" wordmark | |
| S3 | Kicker "Workshop Summary" | uppercase, tracked |
| S4 | Theme toggle | the only control on the page |
| S5 | H1 — workshop title | |
| S6 | Topic suffix "· {topic}" | conditional |
| S7 | "WORKSHOP {date}" | |
| S8 | "PRESENTER {name}" | conditional |
| S9 | Stat "Registered" + hint "Total registrants" — **this is the accented card here**, not Attended | inverted emphasis vs. the private report |
| S10 | Stat "Attended (live)" + hint "Joined the live session" | wording differs from the private report's "Participation = Live" |
| S11 | Stat "% Attended" + hint "Live ÷ registered" | |
| S12 | Section "What attendees said" — rendered **only** when there is ≥ 1 comment or a rating; otherwise the whole section is omitted | |
| S13 | Up to **7** quote cards | private report caps at 6 |
| S14 | Attribution "— {author}, {agency}" / "Anonymous" — uppercase mono here | private report uses sentence case |
| S15 | Rating tile — "Average rating" / {avg} / "/ 5" / five stars / "From {n} responses" | centred tile inside the quote grid; private report uses a full-width banner reading "Average rating · {n} responses" |
| S16 | Card "Engagement breakdown" — Chats · Questions · Reactions | no "Totals · {n} live" pill here |
| S17 | Card "Retention curve" | no "{n} min session" pill here |
| S18 | Empty state "No timing data available." | **differs** from the private report's "Needs join/exit timestamps + scheduled length on the workshop." |
| S19 | Next-workshop tiles — date, time, registrant count, "registered" | **no download button** — `exportHrefFor` is deliberately not passed |
| S20 | Next-workshop empty state + "Kelly" mailto | same as Overview items 27–29 |
| S21 | CTA line "Want the full report — Q&A, attendees, leads?" | |
| S22 | Button "Sign in for full details →" → `/login?next=%2Fdashboard` | **FS2 fixed** — was `/admin/clients`; `/dashboard` is right for advisors and self-corrects for admins |
| S23 | Document title "Workshop summary — Fed Navigator" | |
| S24 | Questions total = count of non-dismissed Q&A rows (a `count`-only query, not the transcript) | same rule as R113 |
| S25 | Funnel, retention, and star-fill rules identical to R108–R115 | |

**Deliberately absent** (and should stay absent): Q&A transcript, attendee directory, buying signals, exports, breadcrumb, client nav, identity chip.

## Share-page flags

- **FS1 — no client co-branding.** The private product is co-branded (Fed Pilot + client logo and name), but the public summary shows only Fed Navigator. A recipient can't tell whose workshop it was. Add the client's logo/name here?
- **FS2 — the CTA points at an admin route.** "Sign in for full details" links to `/login?next=/admin/clients`. For an advisor that's not their destination; `/dashboard` would be. Worth confirming what a non-admin actually lands on.
- **FS3 — the URL is the access control.** Anyone with the link sees the summary; it 404s only on an unknown workshop id. That looks intentional, but it means quotes, agencies and attendee names in comments are public to anyone holding the URL.

## Flags — noted, not acted on

- **FR1 — RESOLVED: drop it.** (owner, this session) The route fetched `question_themes` and passed `themes` into `WorkshopDetail`, which discarded it (`void _themes`). The whole path — the Claude clustering call on every upload, the table, the queries and the prop — is being removed. No redesign impact: no build ever rendered it.
- **FR2 — Empty state names a button the advisor doesn't have.** R36 tells the reader to "Click **Re-fetch evals** to retry", but that control is admin-only — it isn't rendered on the advisor route. As written, the instruction is a dead end for your clients. Reword, or expose the action?
- **FR3 — A third variant exists.** `/share/workshops/[wid]` is a public, logged-out version of this report: KPIs, rating, engagement, retention and next-workshop only — no Q&A, no attendee directory, no buying signals. It words the rating caption differently ("From {n} responses" vs "Average rating · {n} responses") and ends with "Sign in for full details →". Should the redesign carry through to it?
- **FR4 — Two exports, unlabelled difference.** "Export All" is `preset=all` (every ingested row) and "Export Attendees" is `preset=live` (live attendees only). Nothing on screen says so. Worth a hint?
- **FR5 — Admin-only affordances excluded by scope.** Delete workshop, Re-extract, Re-upload, Re-fetch evals and the share-link bar live on the admin route only, and are deliberately absent here.
- **FR6 — Per-open fetch.** The modal calls `/api/evals/attendee` every time it opens, with no caching — opening ten profiles is ten round trips.
