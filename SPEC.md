# Fed Navigator Client Dashboard — Spec

A multi-tenant web app where Fed Pilot's workshop clients log in to see attendance, engagement, and lead data from their Zoom Webinar workshops.

## Context

Fed Pilot runs federal-employee retirement-readiness workshops as Zoom Webinars. Each workshop is hosted on behalf of a specific client organization (an agency, association, or partner). Fed Pilot exports the Zoom attendee report CSV after each workshop. The dashboard ingests these CSVs and presents per-client analytics + lead downloads.

- **Cadence**: 8–15 workshops/month, twice-monthly for active clients, quarterly for others
- **Audience**: ~100–170 attendees per workshop
- **Clients today**: 10+ distinct client organizations
- **Backfill target**: Workshops from 2026-01-01 to present
- **Live URL**: `dashboard.fednavigator.com` (DNS controlled by Fed Pilot)

## Stack

- **Frontend / API**: Next.js 16 (App Router, TypeScript, src/ dir, Turbopack) — note `AGENTS.md` flags breaking changes vs. earlier Next; consult `node_modules/next/dist/docs/` before assuming APIs
- **Styling**: Tailwind v4 + shadcn/ui (to be initialized in build session)
- **Database / Auth / Storage**: Supabase (Postgres + Auth + Storage + RLS)
- **Charts**: Recharts
- **CSV parsing**: PapaParse
- **Forms**: react-hook-form + zod
- **Theme clustering**: Anthropic SDK (Claude)
- **Hosting**: Vercel (auto-deploy from GitHub)
- **Domain**: `dashboard.fednavigator.com` via CNAME to Vercel

Installed deps live in `package.json`. shadcn/ui not yet initialized.

## Ingest model: CSV upload (Zoom API deferred)

**Decision**: Manual CSV upload is the primary ingest path for v1. Zoom Server-to-Server OAuth requires admin access on the Zoom account, but Fed Pilot's Zoom seat is a sub-account on the National Speakers Association's parent Zoom and developer features are disabled.

API ingest is captured as a future task (#9) — when Fed Pilot stands up a standalone Zoom account, the same dashboard wires a `webinar.ended` webhook + API pulls without schema changes.

## CSV schema observations (from 3 sample workshops in `samples/`)

**Columns 1–36 are stable across all Zoom webinar attendee reports.** Hard-map them to typed DB columns:

| # | Column | Notes |
|---|---|---|
| 1 | First name | |
| 2 | Last name | |
| 3 | Email | Source of derived `agency` via domain lookup |
| 4 | Authentication status | Almost always "Authenticated" |
| 5 | Engagement score | 0.0–10.0 float, Zoom-computed |
| 6 | Participation | `Live` / `Lobby only` / `Recording only` / no-show |
| 7 | Ticket type | Always "Webinar Participant Ticket" — constant, ignore |
| 8 | Sessions attended | Always 1 for single-session events |
| 9 | Sessions registered | Always 1 |
| 10 | Total time spent(Minutes) | Integer minutes |
| 11 | Lobby attendance | Almost always "Yes" |
| 12 | Last registration time | Timestamp string with TZ — parse to UTC |
| 13 | Registration method | e.g. "Self-registration by email", "Group join link" |
| 14 | Authentication method | e.g. "Fast join without upfront authentication" |
| 15 | External ID | Always N/A — store but don't surface |
| 16 | Marketing opt-in | Zoom-side opt-in, always N/A in this account |
| 17 | Marketing consent pre-checked? | Always N/A |
| 18 | Registration source | Often N/A; useful if UTM-tagged campaigns are run |
| 19–22 | Organization, Job title, Industry, Organization size | Always N/A — Fed Pilot doesn't collect via Zoom |
| 23–25 | Country/Region, State/Province, ZIP/Postal code | Always N/A |
| 26 | Phone | Critical — lead capture |
| 27 | First join time | Timestamp string with TZ |
| 28 | Last exit time | Timestamp string with TZ |
| 29 | Total recording watch time(Minutes) | For replays |
| 30 | Chats sent | |
| 31 | Total questions asked | |
| 32 | Poll & quiz responses | |
| 33 | Reactions sent | |
| 34 | Clicks/CTA | |
| 35 | Resource downloads | |
| 36 | Registered session(s) | Always 1 |

**Columns 37+ are custom registration questions.** They vary per workshop:
- Workshop "Federal Retirement Benefits" had: text-opt-in, AGE, "most important question"
- Workshop "Your TSP in 2026" had: text-opt-in (different wording), "one question to answer"
- Workshop "Feducate" had: none

**Parser strategy**:
1. Map columns 1–36 to fixed DB columns by header match.
2. Treat any remaining column header as a custom question. Store responses as JSONB on each attendee row: `custom_responses: { "Would you like text updates?": "[\"YES\"]", "AGE": "54", "<question>": "<answer>" }`.
3. The text-opt-in column has many name variants (`Would you like text updates?`, `Text you updates? (in case your agency junks the registration confirmation)`, etc.). Detect via regex on the header (`/text.*update/i`) and normalize into a dedicated `text_opt_in` boolean column.
4. The age column (`AGE`) is similarly variable in casing. Detect and store as integer in dedicated `age` column.
5. The "most important question / one question to answer" free-text column also has variants. Detect via regex (`/most important question|one question/i`) and store in dedicated `registration_question` text column.

## Field triage for the dashboard

### High-signal (lead with these)
- Identity: First/Last name, Email
- **Derived: Agency** (from email domain via lookup table)
- Engagement score
- Participation bucket
- Total time spent
- First join / Last exit
- Phone
- All engagement actions (chats, questions, polls, reactions, CTAs, downloads)
- Custom: text-opt-in, age, registration question

### Medium-signal (show but don't lead)
- Last registration time → derive "lead time to event" (days before workshop)
- Authentication method → "guest vs signed-in" count
- Registration source → for paid campaigns later
- Total recording watch time → for replays

### Low-signal (store, don't surface)
- External ID, Marketing opt-in/pre-checked, Org/Job/Industry/Size, Country/State/ZIP, Ticket type, Sessions attended/registered, Lobby attendance, Registered session(s)

### Derived fields the dashboard computes
- **Agency** — email domain → agency name via lookup table (DHS, VA, IRS, State, DOL, DOJ, DOI, etc.)
- **Attendance bucket** — No-show / Lobby-only / Partial (<50%) / Full (≥50%) / Full + Engaged (≥1 chat/question/poll)
- **Lead score** — weighted: `duration_pct * 0.4 + engagement_score * 0.3 + text_opt_in * 0.3` (tune later)
- **Retention curve** — % of attendees still in session at each 5-min mark, computed from join/exit times

## Multi-tenancy model

- `clients` — agency/org being served. Has logo, contact, etc.
- `workshops` — belongs to one client. Has date, title, presenter, topic, notes.
- `attendees` — belongs to one workshop (and transitively one client). All parsed CSV fields.
- `users` — login record. Belongs to either: one client (client user) or no client (Fed Pilot admin).

**Row-Level Security (RLS)** enforces isolation:
- A client user can `SELECT` workshops/attendees only `WHERE client_id = (SELECT client_id FROM users WHERE id = auth.uid())`
- Fed Pilot admin (`role = 'admin'`) bypasses the client filter

## Auth

- **Supabase Auth, magic link only** (no passwords)
- Each client can have multiple users (team access)
- Admin role for Fed Pilot internal users
- Invite flow: admin enters email → Supabase sends magic link → user lands logged in, scoped to their client

## Pages

### Admin (Fed Pilot internal, `/admin/*`)
- **Clients** — list, create, edit clients (name, logo upload, contact email)
- **Team** — list/invite users per client, set admin role
- **Upload** — drag-and-drop CSV → pick client → set workshop metadata (date, title, presenter, topic, notes) → parse + ingest
- **Agency lookup** — edit email-domain → agency name dictionary

### Client (`/c/[client-slug]/*` or scoped to logged-in client)
1. **Overview** — all-time totals (workshops run, total attendees, avg engagement, total opted-in leads), trend lines across workshops
2. **Workshop list** — table of their workshops, sortable, click into one
3. **Workshop detail**
   - Header: title, date, presenter, attendee count
   - Attendance funnel: registered → live → engaged
   - Engagement breakdown (chats/questions/polls/reactions/CTAs)
   - Retention curve (% in session by minute)
   - Question theme clusters (from Claude)
   - Attendee table (sortable, paginated)
4. **Leads export** — 4 preset filters + custom:
   - **Hot leads** — text-opt-in AND duration ≥50% of workshop length
   - **Engaged attendees** — any (chats > 0 OR questions > 0 OR polls > 0)
   - **All live attendees** — participation = Live
   - **Registered no-shows** — registered but no participation
   - **Custom** — pick any fields and conditions
   - Export: CSV with name, email, phone, agency, duration, engagement score, text-opt-in, custom responses
5. **Settings** — team members (invite/remove), branding (logo upload)

### Branding
- Co-branded: Fed Pilot logo on the left of the header, client name + their logo on the right
- Client-level color accent (optional, post-MVP)

## Theme clustering

On each CSV ingest, if the workshop has a `registration_question` column with free-text:
1. Collect all responses (deduped, trimmed)
2. Send to Claude with a prompt like: "Cluster these federal-retirement workshop registration questions into 5–12 themes. Return JSON: `[{theme, count, example_quotes: [...]}, ...]`"
3. Store the clusters in a `question_themes` table keyed to `workshop_id`
4. Display as a card on the workshop detail page + an aggregate themes view on the client Overview

Use Claude Sonnet 4.6 (default) or Opus 4.7 for higher-quality clustering. Cost is minor (one call per workshop, ~150 questions).

## DB schema (sketch)

See `supabase/migrations/0001_init.sql`. Tables:
- `clients` — id, slug, name, logo_url, contact_email, created_at
- `workshops` — id, client_id, title, date, presenter, topic, notes, scheduled_minutes, created_at
- `attendees` — id, workshop_id, all 36 fixed CSV columns + text_opt_in (bool) + age (int) + registration_question (text) + custom_responses (jsonb) + computed agency (text) + engagement_score_local (float, our computed one if we want)
- `question_themes` — id, workshop_id, theme_label, count, example_quotes (jsonb)
- `agency_lookup` — id, domain (text, pk), agency_name (text)
- `app_users` — id (= auth.uid()), client_id (nullable), role ('admin'|'client'), created_at

RLS policies enforce client-isolation everywhere.

## Status

- [x] Sample CSVs analyzed (3 workshops, schema confirmed stable)
- [x] Decisions locked (stack, branding, ingest path, lead presets, auth)
- [x] Next.js scaffolded (this directory)
- [x] Deps installed (Supabase, Anthropic, PapaParse, Recharts, etc.)
- [ ] shadcn/ui init
- [ ] Supabase project created (manual — Fed Pilot to do)
- [ ] Migration applied
- [ ] Auth scaffolded
- [ ] Admin UI built
- [ ] Client dashboard pages built
- [ ] Theme clustering wired
- [ ] Lead export built
- [ ] First client onboarded
- [ ] DNS + Vercel deploy

## Hand-off note to the next session

Start with:
1. Read this SPEC.md top-to-bottom
2. Read `supabase/migrations/0001_init.sql` to see the schema
3. Inspect `samples/` to see real CSV inputs
4. Confirm with user: did you create the Supabase project? Share URL + anon key + service role key
5. `npx shadcn@latest init` to set up shadcn/ui
6. Build order: schema → auth → admin clients UI → admin upload UI → parser → client overview page → workshop detail page → leads export → theme clustering
