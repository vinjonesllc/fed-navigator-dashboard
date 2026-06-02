# Fed Navigator Client Dashboard

Multi-tenant Next.js + Supabase dashboard for Fed Pilot's workshop attendance, engagement, and lead data from Zoom Webinar exports. Production at **<https://dashboard.fednavigator.com>**.

**Authoritative design doc:** [`SPEC.md`](./SPEC.md). Agent working notes: [`CLAUDE.md`](./CLAUDE.md), [`AGENTS.md`](./AGENTS.md).

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack — middleware is renamed `proxy.ts` in Next 16)
- **Supabase** — Postgres + Auth + Storage + RLS
- **Tailwind v4** + shadcn/ui, Space Grotesk / IBM Plex Sans / JetBrains Mono fonts, OKLCH palette with manual dark-mode toggle
- **Recharts** (charts), **PapaParse** (CSVs), **react-hook-form + zod**, **date-fns**
- **Anthropic SDK** for question theme clustering, intent extraction, and eval testimonial selection
- **Resend** SMTP for password-reset emails
- **Vercel** hosting, auto-deploys from GitHub `main`

## Roles

| Role | Sign-in landing | Powers |
|---|---|---|
| **admin** | `/admin/clients` (all) | Full CRUD, team management |
| **editor** | `/admin/clients` (all) | Same as admin minus team page |
| **super_advisor** | `/admin/clients` (their grants) | View multiple advisor pages read-only |
| **advisor** | `/admin/clients/<their-client-id>` | View own client page only, read-only |

Read-only means: no New workshop, no Settings tab, no Re-extract/Re-upload/Delete buttons.

## Auth

Email + password (no magic links — switched to passwords because of SMTP rate-limit pain). Forgot-password flow is wired to Supabase's `resetPasswordForEmail`. Admin invites new users with an initial password (no invitation email — admin shares the password securely).

## Routes

- `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/auth/sign-out`, `/auth/bootstrap` — auth
- `/admin/clients` — list (filtered by role)
- `/admin/clients/[id]` — overview tab + (admin/editor only) settings tab
- `/admin/clients/[id]/workshops/[wid]` — workshop detail
- `/admin/team` — admin only, invite users with role + password
- `/admin/upload` — admin/editor, drag the three Zoom CSVs (attendees + chat + Q&A)
- `/admin/agency-lookup` — admin/editor, edit email-domain → agency table
- `/api/leads/export?workshopId=…&preset=live|all|engaged|hot|noshow` — CSV download
- `/share/workshops/[wid]` — **public**, no auth required; streamlined overview + copy-link from admin workshop page

## First-time setup (local dev)

1. **Environment** — copy `.env.example` to `.env.local` and fill in the values from Supabase Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `FEDNAV_ANTHROPIC_API_KEY` — prefixed to avoid shell-injected `ANTHROPIC_API_KEY` collision (Claude Code, IDEs, Anthropic CLI tools all set the unprefixed name; Next.js does NOT override an env var that's already in `process.env`)
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
2. **Apply migrations in order** to your Supabase project (Database → SQL Editor or `psql`):
   `0001_init.sql` → `0002_transcripts.sql` → `0003_eval_sheets.sql` → `0004_eval_agency.sql` → `0005_workshop_rating.sql` → `0006_extended_roles.sql`
3. **Create the `client-logos` Supabase Storage bucket** (Storage → New bucket → name `client-logos`, public read enabled). Only needed if you upload client logos.
4. **Seed your first admin** — sign up at `/login` to create the auth user, then in Supabase SQL Editor:
   ```sql
   update app_users set role = 'admin' where email = 'you@example.com';
   ```
5. **Dev** — `npm run dev`, open <http://localhost:3000>.

## Production deploy

The live production app is at https://dashboard.fednavigator.com, deployed automatically from this repo's `main` branch via Vercel.

To replicate from scratch:

1. **Push to GitHub** — `git push origin main`
2. **Vercel** — import the repo, set the env vars listed in `.env.example` (use prod values, set `NEXT_PUBLIC_APP_URL` to the production URL), Deploy
3. **Custom domain** — Vercel project → Settings → Domains → add `dashboard.<yourdomain>`; add the CNAME at your DNS host
4. **Supabase Auth → URL Configuration** — set Site URL to the production URL; add the same URL + `/auth/callback` and `/**` to Redirect URLs
5. **Supabase Auth → SMTP Settings** — point at Resend (or another SMTP) so password-reset emails work. Free Supabase SMTP rate-limits to ~4 emails/hr per address which will bite you the first time you test
6. **Resend domain verification** — add the DKIM CNAME + return-path MX records Resend shows you to your DNS host; status must read "verified" before password-reset emails will leave

## Key files

- `src/lib/auth.ts` — role-aware session helpers (`requireConsoleAccess`, `requireContentManager`, `requireAdmin`, `userCanAccessClient`)
- `src/lib/supabase/{server,browser,admin}.ts` — three Supabase client factories
- `src/lib/csv/{parse-zoom,parse-transcripts}.ts` — Zoom export parsers (attendees, chat, Q&A)
- `src/lib/ingest.ts` — full ingest pipeline
- `src/lib/themes.ts` — registration-question theme clustering
- `src/lib/intents.ts` — retiring-soon + cliff-notes-request extraction (presenter context preserved, attendee-email gated)
- `src/lib/eval-comments.ts` — fetches per-client Google Sheet, code-level date prefilter (workshop_date → +5d), Claude picks best 7 testimonials + computes aggregate rating
- `src/lib/workshop-stats.ts` — funnel / engagement / retention
- `src/lib/format-date.ts` — `formatWorkshopDate` (TZ-stable YYYY-MM-DD → "May 20, 2026")
- `src/proxy.ts` — auth session refresh + route gating (Next 16 renamed middleware → proxy)
- `src/components/workshop-detail.tsx` — admin + client workshop report (single component, role-gated bits passed as props)
- `src/app/share/workshops/[wid]/page.tsx` — public share page
- `supabase/migrations/` — all schema changes in order

## Develop

```bash
npm run dev     # turbopack dev server (port 3000)
npm run build   # production build
npm run lint    # eslint
```
