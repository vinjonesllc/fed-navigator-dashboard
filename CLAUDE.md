@AGENTS.md

# Fed Navigator Client Dashboard

**Read `SPEC.md` first.** It captures every decision from the design conversation: stack, ingest path, CSV schema, field triage, lead presets, auth, RLS model, page list, and status.

## Quick orient

- Multi-tenant Next.js 15 + Supabase dashboard where Fed Pilot's workshop clients see their own Zoom Webinar attendee + engagement data
- Primary ingest: **manual CSV upload** by Fed Pilot admin (Zoom API ingest is deferred — see SPEC §"Ingest model")
- Co-branded: Fed Pilot logo + client name in the header
- 10+ clients today, magic-link auth, multiple users per client, admin role for Fed Pilot

## Important files

- `SPEC.md` — full project spec
- `supabase/migrations/0001_init.sql` — DB schema, RLS policies, agency lookup seeds
- `samples/*.csv` — three real Zoom attendee report exports for parser dev
- `.env.example` — required env vars

## Conventions

- Co-located routes in `src/app` with route groups: `(admin)`, `(client)`, `(auth)`
- Server Components by default; Client Components only when needed for interactivity
- Supabase access:
  - Server: `@supabase/ssr` `createServerClient`
  - Browser: `@supabase/ssr` `createBrowserClient`
  - Admin (bypass RLS): `createClient` with service role key, server-only
- Forms: react-hook-form + zod
- Charts: Recharts
- CSV parsing: PapaParse, server-side in an API route or server action
- Dates: date-fns

## Don't

- Don't hardcode client lists — there are 10+ clients; everything goes through the `clients` table
- Don't bypass RLS in browser code; always use admin client server-side only
- Don't add Zoom API code yet — that's task #9 and gated on a future standalone Zoom account
