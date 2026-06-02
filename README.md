# Fed Navigator Client Dashboard

Multi-tenant Next.js + Supabase dashboard where Fed Pilot workshop clients log in to see attendance, engagement, and lead data from their Zoom Webinar workshops.

**Authoritative design doc:** see [`SPEC.md`](./SPEC.md). Working notes for agents: [`CLAUDE.md`](./CLAUDE.md), [`AGENTS.md`](./AGENTS.md).

## Stack

- Next.js 16 (App Router, TypeScript, Turbopack — note: middleware is renamed `proxy.ts`)
- Supabase (Postgres + Auth + Storage + RLS)
- Tailwind v4 + shadcn/ui (radix base, Nova preset)
- Recharts, PapaParse, react-hook-form + zod
- Anthropic SDK for registration-question theme clustering

## First-time setup

1. **Environment variables** — copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `FEDNAV_ANTHROPIC_API_KEY` (required for theme clustering + intent extraction; intentionally prefixed to avoid colliding with shell-level `ANTHROPIC_API_KEY` that Next.js will not override)
   - `NEXT_PUBLIC_APP_URL` (e.g. `https://dashboard.fednavigator.com` in production)
2. **Apply the migration** — `supabase/migrations/0001_init.sql` to the Supabase project.
3. **Create the `client-logos` Storage bucket** in the Supabase dashboard: Storage → New bucket → name `client-logos`, public read enabled.
4. **Seed the first admin** — invite any email via the Supabase Auth dashboard, then in SQL Editor:
   ```sql
   update app_users set role = 'admin', client_id = null where email = 'you@fedpilot.com';
   ```
5. **Run the dev server** — `npm run dev`. Open <http://localhost:3000>, sign in via magic link.

## Routes

- `/login`, `/auth/callback`, `/auth/sign-out` — magic-link auth
- `/admin/clients`, `/admin/clients/[id]` — manage client orgs + logos
- `/admin/team` — invite users, assign roles + client
- `/admin/upload` — drop a Zoom CSV; parser maps cols 1–36 + detects custom registration questions
- `/admin/agency-lookup` — edit email-domain → agency name table
- `/dashboard` — client overview + trends
- `/dashboard/workshops`, `/dashboard/workshops/[id]` — workshop list + detail (funnel, engagement, retention, themes, attendees)
- `/dashboard/leads` — preset filter CSV export
- `/dashboard/settings` — team + branding (read-only for clients)
- `/api/leads/export` — CSV download endpoint

## Key files

- `src/lib/supabase/{server,browser,admin}.ts` — three Supabase client factories
- `src/lib/csv/parse-zoom.ts` — Zoom attendee report parser
- `src/lib/ingest.ts` — full ingest pipeline (parse → agency resolve → lead-score → insert)
- `src/lib/themes.ts` — Claude-powered registration-question clustering
- `src/lib/workshop-stats.ts` — funnel / engagement / retention computations
- `src/proxy.ts` — auth session refresh + route gating (Next 16 renamed middleware)
- `supabase/migrations/0001_init.sql` — schema, RLS policies, agency seeds

## Develop

```bash
npm run dev     # turbopack dev server
npm run build   # production build
npm run lint    # eslint
```
