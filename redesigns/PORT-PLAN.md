# Porting the redesign into the app

Prototypes → shipped code. The prototypes in this folder are the visual spec; `INVENTORY.md` and `REPORT-INVENTORY.md` are the acceptance tests.

**Status:** waiting on two background tasks to merge before Phase 1 starts.

---

## Ground rules

1. **Keep existing token names, change their values.** `bg-bg-2` appears 64 times across the app. Renaming `--bg-2` → `--wash` (as the prototypes do) would mean touching every one. Instead `globals.css` keeps the names and repoints the values; the app recolours with almost no component edits.
2. **Port into Tailwind classes on the existing components**, not new CSS files. The prototypes use plain CSS only because they had to stand alone.
3. **Don't port the scaffolding** — the "Sample data" chips, the preview toasts, and the "Empty states" appendices exist only so a static file could show every state at once.
4. **Verify on preview deploys, not locally.** This project's dev server has crashed the machine before. Push the branch, open the Vercel preview, compare against the prototype.
5. **Read `node_modules/next/dist/docs/` first** — per `AGENTS.md`, this Next version differs from training data.

---

## Phase 0 — branch hygiene (blocked until both tasks finish)

Both background tasks ran in the **same checkout**, so cleanup commits are stacking on `harden-public-share-route`. When they finish:

```
# hardening keeps its own branch (f9c910a is already there)
git branch cleanup-cobranding-themes            # mark the tip
git rebase --onto <hardening-base> harden-public-share-route cleanup-cobranding-themes
# then reset the hardening branch back to just its own commit
```

Then two PRs, reviewed and merged independently, plus a third small commit adding `redesigns/` (prototypes + both contracts + this plan).

---

## Phase 1 — tokens (`src/app/globals.css`)

The cleanup task has already added `--brand: #3080C2` and a `--color-brand` mapping. Remaining work:

### Values that change (names stay)

| Token | Now | Becomes | Why |
|---|---|---|---|
| `--background` | `oklch(0.985 0.003 260)` | `oklch(1 0 0)` | white page, no tint |
| `--bg-2` | `oklch(0.970 0.004 260)` | `oklch(0.975 0.008 248)` | blue-tinted wash, hovers + table heads only |
| `--ink-1…4` | hue 260 | hue 250, slightly deeper ink-1 | neutrals carry the anchor |
| `--line-1` | `0.500 0.020 260 / 0.18` | `0.480 0.034 248 / 0.42` | card edge does the work once the page is white |
| `--line-2` | `/ 0.10` | `/ 0.20` | inner rules |
| `--ring` | lime | `--brand` | focus ring follows the brand |

### Tokens to add

`--brand-deep: #295F86` · `--brand-ink: oklch(0.400 0.090 248)` · `--brand-soft` · `--brand-bord` · `--nav-bg: oklch(0.270 0.050 250)` · `--nav-bg-2` · `--nav-line` · `--nav-ink`, `--nav-ink-2`, `--nav-ink-3`

Plus the dark-mode counterparts (all in the prototypes' `.dark` block, already contrast-checked).

### The 13 `lime` usages — decide, don't find-and-replace

`lime` currently means two different things. Classified:

**→ brand blue** (it was standing in for an accent):
- `components/workshop-detail.tsx:200` rating-banner bar · `:384` quote bar · `:385` quote mark · `:525` intent timing text
- `components/attendees-table.tsx:244` engagement bar gradient
- `share/workshops/[token]/page.tsx:226-227` quote bar + mark
- `components/change-password-dialog.tsx:103` role badge

**→ brand blue** (continued):
- `components/attendees-table.tsx:226` `.gov` agency tint. Raised as a judgement call — a federal-domain signal arguably wants its own colour rather than the brand's — and **decided blue by the owner**, matching the prototype. It stays distinguishable from the non-federal badge, which is neutral (`border-line-1 bg-bg-2 text-ink-2`).

**→ keep a semantic colour, do not make it brand blue:**
- `admin/.../part2/page.tsx:42` `text-lime` emphasis on live call counters — a *live/active* state.
- `components/charts/engagement-bar.tsx:15` categorical series colour — belongs to the chart palette, not the brand.
- `app/forgot-password/page.tsx:10`, `app/reset-password/page.tsx:12` — auth-screen icon tiles, outside the redesign's scope.

**Also tokenise two hardcoded reds:** `components/section-help.tsx:62` and `components/guide-content.tsx:60` both carry `border-[#C8102E]`.

`body` in `globals.css:191-194` also paints two radial gradients from `--lime-soft` / `--cyan-soft`. With a white page those should go or become brand-tinted.

---

## Phase 2 — the shell

New rail component replacing `app-header.tsx`; grid in `(client)/layout.tsx` and `(admin)/layout.tsx`. The only genuinely new UI. Needs a client component for the drawer and `usePathname()` for the active item. Covers inventory items 1–2, 6–17.

## Phase 3 — Overview

`client-overview.tsx`, `next-workshop-card.tsx`. White cards, attendance meter, right-hand agenda rail, inline % bars. Covers items 18–59.

## Phase 4 — Report

`workshop-detail.tsx` panels + sticky right rail. `attendees-table.tsx`, `attendee-detail-modal.tsx`, `section-help.tsx` keep their logic entirely — restyle only. Covers R1–R107.

## Phase 5 — Share page

One file, reshaped by the hardening task first. Covers S1–S25.

## Phase 6 — verify

Run both contracts against the deployed preview: every numbered item present, the §6 / R108–R118 calculations still derivable, dark mode, 320 px, contrast.

---

## After it's live and working — raise these

The owner asked to be reminded once the redesign is shipped and stable:

- **F2** — `avg_engagement` and `opted_in_count` are computed per workshop in `lib/queries.ts` and displayed nowhere.
- **F3** — attendance is a pooled ratio while rating is an unweighted mean of means; only the attendance method is explained on screen.
- **F6** — no footer, no "data as of" timestamp, no compliance line anywhere in a client-facing financial-services deliverable.
- **FR4** — "Export All" (`preset=all`) vs "Export Attendees" (`preset=live`): the labels don't say what differs.
- **FR6** — the attendee modal re-fetches `/api/evals/attendee` on every open, uncached.
- **FS3 follow-up** — whether public share links should anonymise quote attributions (currently full name + agency of federal employees).
