# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FCFC '26 is a private World Cup 2026 prediction game (in Turkish, slang "aga") for a fixed group of 6 friends. It is a single-page Next.js App Router PWA backed by Firebase Firestore with realtime sync. There is no signup — players are hardcoded and "log in" with a 4-character code.

## Commands

```bash
npm run dev      # dev server at http://localhost:3000
npm run build    # production build
npm start        # serve production build
npm run lint     # eslint (eslint-config-next)

# One-time: seed the 72-match WC 2026 group stage into Firestore
# (after filling NEXT_PUBLIC_FIREBASE_* in .env.local)
node --env-file=.env.local scripts/seed.mjs
```

There is no test suite. `@/*` resolves to the repo root (tsconfig paths).

## Backend setup (Firebase)

The app needs a Firebase project (free Spark plan, no card). `.env.local` holds the `NEXT_PUBLIC_FIREBASE_*` web-app config (public client keys — access is gated by Firestore rules, not by hiding them). Publish `firestore.rules` in the console (Firestore → Rules); they are intentionally open read/write because there is no server-side identity to check (see "Players are hardcoded" below). Then run the seed command above once.

## Architecture

**Single-screen, four-tab app.** `app/page.tsx` (`'use client'`) is the entire UI shell and owns nearly all state: the active tab (`next` | `upcoming` | `past` | `table`), the current user, the players/matches/bets caches, `isArbiter`, and `nowMs` (a clock ticked every 60s). Tabs: **Up Next** (bettable `MatchCard`s), **Upcoming** (future fixtures, not yet bettable), **Past** (finished cards with outcome coloring), **Table** (`Leaderboard`). Almost everything is a client component — Firestore realtime listeners and localStorage require it.

**Betting window & tab partitioning** (`lib/data.ts` helpers): a match's kickoff is `kickoffMs(m)` (parses the Turkey-time `date`/`time` strings → UTC ms). Non-finished matches split by kickoff vs `nowMs + BET_WINDOW_MS` (48h):
- *Up Next* (`next`) = `kickoff <= now + 48h` — the bettable window. A card is `locked` (betting closed, shows "CLOSED"/"LOCK") once `nowMs >= kickoff` but still awaiting a result.
- *Upcoming* = `kickoff > now + 48h` — future fixtures, passed `notYetOpen` (betting not open, shows "SOON"; arbiter entry suppressed via `showArbiter`).
- *Past* = `FINISHED` only.

So a match flows Upcoming → Up Next → (locked) → Past, the last step driven by the arbiter finalizing it. The arbiter can also reverse it: the "Reopen Match" button on a finished card calls `handleReopenResult`, which sets `status: 'UPCOMING'` and `deleteField()`s both scores, dropping the match back into the flow (bets are kept).

**Data flow is Firestore-direct, no API layer.** `lib/firebase.ts` initializes one browser app (HMR-safe via `getApps()`) and exports `db`. Components import `db` and the modular `firebase/firestore` functions directly. `page.tsx` opens two `onSnapshot` listeners — on the `matches` and `bets` collections — which both backfill and stream live updates (no separate initial fetch). Writes optimistically update local state, then `setDoc`/`updateDoc`; the snapshot listener reconciles with what other clients write. `isLoading` clears on the first `matches` snapshot.

**Firestore collections:**
- `matches/{id}` — doc id is the stringified numeric `id`. Fields: `id, home, away, date, time, stadium, status, result_home?, result_away?` (the `Match` interface in `lib/data.ts`). Times are stored in Turkey time (the seed converts from ET). Sorted client-side by `id`. Seeded by `scripts/seed.mjs`.
- `bets/{user_id}_{match_id}` — **the doc id IS the client bet key** (`` `${user_id}_${match_id}` ``). Fields: `user_id, match_id, pick` (`'HOME' | 'DRAW' | 'AWAY'`), `locked` (bool). Outcome-only — no scoreline. `handlePick` upserts the pick (`locked: false`); `handleLockIn` flips `locked: true`. Legacy score-based bet docs (no `pick`) are ignored on read.
- `players/{uuid}` — self-registered roster. Fields: `id, name, avatar, pin` (the `Player` interface). `id` is a `crypto.randomUUID()`.

**Players self-register; the roster lives in Firestore, not in code.** `page.tsx` streams the `players` collection live. The user switcher renders it plus a "+ New" button that opens `RegisterModal` (username + emoji avatar — `AVATARS` quick-picks or any typed emoji — + 4-char PIN → writes a `players` doc and logs in). Clicking an existing player opens `AuthModal`, which checks the typed code against `player.pin`. The logged-in player id persists to `localStorage['pitch_club_user']`. PINs are plaintext and world-readable — this is identity, not security (consistent with the open Firestore rules); fine for a private pool.

**Arbiter mode** (the `⚖` button in the header) is gated by `ArbiterModal`, which checks `ARBITER_CODE` (`317098` in `lib/data.ts`). On success `isArbiter` flips on (client-only — it's a shared code, not real auth). It swaps every `MatchCard` into result-entry mode (writes `status: 'FINISHED'` + scores to `matches`); finished cards also get a "Reopen Match" button to de-finalize. Click `⚖` again to exit.

**Betting UX (`MatchCard`).** Outcome-only: the player taps the home flag, away flag, or center **Draw** chip to set `pick`; the selection is ringed gold. The pick is editable until **Lock In** (sets `locked`) or kickoff (auto-locks via the time-based `locked` prop — `canPick` goes false). Once a bet is committed (`locked` || kicked off || finished), the card shows **See Bets**, which lists other players whose bets are *also* committed and how they picked (gated so you must commit before you can peek). On finished cards the pick ring and the See Bets entries turn green/red by outcome.

**Scoring / bet outcome.** `resultOutcome(rh, ra)` reduces a result to `HOME`/`AWAY`/`DRAW`; `betOutcome(pick, rh, ra)` returns `win` (pick matches), `loss`, or `none`. Correct pick = **1 point**, no exact-score tier. `Leaderboard.tsx` sums wins over finished matches (1 pt each), sorted by points.

**Team flags** are rendered from country name via `TEAM_ISO` (`lib/data.ts`) → `https://flagcdn.com`. England/Scotland use special `gb-eng`/`gb-sct` codes; unmapped names fall back to a `?` swatch. `TEAM_ISO` keys must match the team names in `scripts/seed.mjs` exactly — both cover the same 48 WC-2026 teams (e.g. `Türkiye`, `Czechia`, `DR Congo`, `Bosnia and Herzegovina`).

## Design constraints (from `.cursorrules` — these are intentional, do not "modernize" away)

The aesthetic is deliberately anti-startup: "1970s Match Programme meets Swiss Editorial." Custom theme colors live in `tailwind.config.ts` — `pitch` (greens), `paper` (bone text), `gold`, `signal` (alert orange), `chalk` (borders). Fonts: `font-serif` = Fraunces (headers), `font-mono` = Chivo Mono (data), wired up as CSS variables in `app/layout.tsx`.

- No flat backgrounds — layer noise/grain.
- No blue buttons, drop shadows, or `rounded-full` "startup" buttons; use the gold/signal palette and tactile controls. Score entry uses the custom `ScoreDial`, never standard number inputs.
- Functional components, meaningful names (`matchData`, not `data`), Framer Motion for staggered/smooth motion.
