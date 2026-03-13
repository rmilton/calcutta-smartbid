# HEARTBEAT.md

This is the current-state handoff document. Update it when behavior, architecture, or deployment assumptions materially change.

## Last Known Good State

As of `2026-03-12`:

- app runs locally against Supabase via `.env.local`
- local smoke test passed:
  - create session
  - update live board
  - record purchase
  - refresh and confirm persistence
- production deployment on `Vercel + Supabase` has been confirmed working
- redesigned UI is live across landing, setup, live session, viewer board, and admin surfaces
- dark/light theme toggle is live; theme persists to `localStorage` and initialises via an inline `<script>` in `<head>` to avoid flash of wrong theme
- platform-admin login routes to `/admin`
- admin center supports:
  - org users
  - syndicate catalog
  - data sources
  - session list
- session admin supports:
  - access assignment
  - shared code rotation
  - tracked syndicates
  - analysis settings
  - payout structure editing
  - active data source selection
  - import history
  - session archive and permanent delete
- live board supports:
  - role-driven admin/viewer access
  - searchable single-control `Active Team for Bidding`
  - automatic board update on team selection
  - purchase recording and persistence
  - in-room `Analysis` workspace backed by the same recommendation payload as `Auction`
- live-room recommendation math now derives from Mothership automatically instead of a selectable focus syndicate
- live dashboard now refreshes on session syndicate changes in addition to purchases and session meta changes
- runtime config now fails fast if Vercel is missing required Supabase variables or tries to use local storage

## Surface Status

Current product surfaces and their roles:

- `Landing/login`
  - public entrypoint
  - accepts assigned email plus shared code
  - routes platform admins to `/admin`
  - routes session members into their assigned live room
- `Admin center`
  - platform-level setup and operations
  - manages org users, tracked syndicates, data sources, and session list
- `Session admin`
  - per-session configuration
  - manages access, shared code, payout structure, tracked syndicates, and data imports
- `Live room`
  - operator and viewer share the same persisted Mothership room state
  - operator can update nomination, current bid, and purchases
  - viewer is read-only

## Current Financial / Auction Model

- payout structure is stored as round percentages plus `projectedPot`
- `projectedPot` drives payout/EV forecasting
- `house take %` has been removed from the model
- per-syndicate `remainingBankroll` is currently derived as:
  - `projectedPot / syndicateCount - spend`
- this is still an assumption layer, not the final real-pot model
- shared analysis settings are:
  - `targetTeamCount`
  - `maxSingleTeamPct`

## State Truth Rules

- completed purchases are the authoritative auction record unless superseded by a deliberate correction workflow
- active nominated team and current bid are live operational state, not the primary historical record
- viewer state must always derive from the same persisted session truth as operator state
- viewer mode intentionally does not display current bid; it centers the active team and room outcomes instead
- `projectedPot` is provisional model input
- a future `actual pot locked` state should override projected assumptions once the room closes
- Mothership is the fixed recommendation lens for every session
- Mothership purchases are the owned-portfolio truth for live analysis and bid planning
- `Auction` and `Analysis` must remain consistent because they share one analysis snapshot

## Deployment Shape

- frontend/app hosting: `Vercel`
- data/backend: `Supabase`
- production backend mode: `supabase`

Key files:

- [src/lib/config.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/config.ts)
- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)

## Core User Flows Working

- platform admin login
- landing-page login routing
- admin center load
- org user management
- syndicate catalog management
- data source management
- session creation from admin center
- session admin configuration
- session member login
- live board load
- in-room analysis load
- active-team selection with automatic board update
- current bid entry
- purchase recording
- persistence across refresh

## Current Product Guarantees

- platform-admin session creation is not exposed on the public landing page
- session users authenticate with assigned email plus shared code
- viewer mode remains read-only
- viewers are trusted internal teammates and see the same Mothership-centered guidance as operators
- the standalone `/csv-analysis` page is legacy compatibility only and should redirect into the live room
- validation errors should resolve to domain-language messages instead of raw schema failures where feasible
- production-like deployment must run with `CALCUTTA_STORAGE_BACKEND=supabase`

## Important Recent Changes

- visual design overhauled to a premium minimal token system using CSS custom properties; all surfaces use `--bg`, `--panel`, `--panel-muted`, and semantic vars instead of hardcoded colours
- dark/light theme toggle added via `ThemeToggle` component; toggle appears in session, admin center, and session admin headers; theme written to `data-theme` on `<html>` and persisted to `localStorage`
- Inter + JetBrains Mono loaded via `next/font/google`; FOUC eliminated via inline bootstrap script in `<head>`
- border-radius tightened from 28 px to 12 px max; `color-mix(in srgb, ...)` used for all semantic derived colours
- purchase route now returns a clean message when price is `<= 0`
- operator local form state no longer resets while polling/realtime refresh is active
- live dashboard now refreshes when session syndicates change
- live-room `Analysis` now shares the same recommendation engine as `Auction`
- admin pages no longer rely on the legacy panel shell for primary layouts
- runtime config errors no longer masquerade as missing-session 404s
- production deployments are guarded from running on local storage
- session creation is no longer exposed on the public landing page
- session users authenticate by assigned email plus shared code
- session creation and session manage no longer expose a configurable focus syndicate
- likely bidders were removed
- `Nominated team` became `Active Team for Bidding`
- the team selector is now a single searchable control
- `Update live board` was removed
- manual overrides UI was removed from the live board
- payout structure moved into session admin
- `startingBankroll` was replaced with `projectedPot`
- `house take %` was removed

## Known Gaps

- no undo/correction workflow for mistaken purchases
- no final `actual pot locked` workflow after all teams are sold
- recommendation math still uses a simplified bankroll/headroom assumption
- recommendation explanations are still lighter than the target product standard
- no full audit trail UI in admin center
- old sessions created before the Mothership-first rule may need admin correction if Mothership is not in the room
- lint still uses deprecated `next lint`

## Manual Regression Checklist

Use this after changing auth, admin center, live controls, or payout/simulation behavior:

1. Log in as platform admin at `/`.
2. Confirm redirect to `/admin`.
3. Create a session or open an existing one.
4. On session admin, save access, rotate the code, and save payout structure.
5. Save analysis settings and confirm they persist.
5. Log in as a session user with assigned email plus shared code.
6. Confirm the live board loads with the right role.
7. Change `Active Team for Bidding` and confirm the board updates immediately.
8. Open `Analysis` and confirm the selected team matches `Auction` on target/max bid.
9. Change current bid and confirm it persists.
10. Record a purchase with a valid bid.
11. Try recording a purchase with `0` and confirm the friendly validation error.
12. Refresh and confirm persistence.
13. Open `/csv-analysis?sessionId=<id>` and confirm redirect into the live-room `Analysis` tab.
14. Log in as a viewer and confirm the room is synchronized but not editable.
15. Archive a session and confirm it is hidden by default in the admin sessions list.
16. Show archived sessions and confirm the archived session appears with archived state.
17. Confirm permanent delete is blocked until the exact session name is entered.
18. Permanently delete an archived session and confirm the session no longer loads in admin or live-room routes.

## Operational Notes

- local development can still use `CALCUTTA_STORAGE_BACKEND=local`, but do not treat that path as deployable
- if dev runtime gets strange after large route/component changes, clear `.next` and restart
- old stored sessions may still contain legacy payout keys; the repository normalizes them
- `MOTHERSHIP_SYNDICATE_NAME` defaults to `Mothership` and is now the canonical strategy subject
- the clearest visible signal that configuration is correct is the session badge reading `Backend supabase`
- the winner picker on the live board is driven by the session's participating syndicates, not the global syndicate catalog
- if a live-room mutation cannot be safely corrected or audited, treat that as a product gap rather than operator error
- any future work that changes bankroll/headroom language should update UI copy, recommendation logic, and this document together
- any future work that changes analysis scoring or bid allocation should update both `src/lib/session-analysis.ts` and `src/lib/engine/recommendations.ts` together

## Backlog References

Azure DevOps items already created:

- Feature `81767`: Supabase persistence and realtime
- Feature `81768`: Projection ingestion and bid intelligence
- User Stories `81769` to `81774`
