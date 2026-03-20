# HEARTBEAT.md

This is the current-state handoff document. Update it when behavior, architecture, or deployment assumptions materially change.

## Last Known Good State

As of `2026-03-20`:

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
  - session-managed bracket and analysis imports
  - room-readiness status for merged imports
  - active data source selection
  - import history
  - session archive and permanent delete
- live board supports:
  - role-driven admin/viewer access
  - searchable single-control `Active Team for Bidding`
  - automatic board update on team selection
  - purchase recording and persistence
  - undo for the most recent purchase
  - in-room `Bracket` workspace with ownership markers and winner advancement
  - in-room `Analysis` workspace backed by the same recommendation payload as `Auction`
  - analysis team selector now mirrors the active auction team by default while remaining locally overridable inside `Analysis`
  - consolidated `Auction` workspace with live decision board, syndicate board, Mothership position, and decision context
  - viewer `Auction` now uses the same live decision board, call, rationale, ownership-conflict, recent-sales, and ownership-ledger structure as the operator board without exposing controls
  - operator and viewer `Auction` boards now flip into an `Auction Complete` finish state once every asset is sold
  - live dashboard refresh is now realtime-first with adaptive fallback polling, duplicate refresh coalescing, and hidden-tab stale catch-up behavior
  - operators still receive the full live dashboard while viewers now receive a slimmer server-computed payload without raw simulation and analysis blobs
  - once the room is sold out, operators and platform admins can explicitly mark the auction complete, reopen it, or enter tournament mode
  - completed auctions stop interval polling and block live bidding mutations until reopened
  - `tournament_active` state transitions the room from auction recap into live tournament tracking mode
  - tournament mode shows the Mothership Portfolio Results tracker with per-asset round progress, cost/return/net per share, and ESPN-sourced next-game schedule
  - bracket cards and tournament tracker rows auto-populate with game date, time, and network from the ESPN public scoreboard API (no key required); fetched server-side on each dashboard load with a 5-minute cache
  - ESPN team name normalization handles common NCAA naming differences (A&M suffix, St/State abbreviations, punctuation, parenthetical state identifiers, play-in group name splitting)
  - viewer board in tournament mode hides the live decision board, team highlights, recent sales, and rooting guide in favor of the portfolio tracker
  - nav pill updates to reflect "Tournament mode active" vs "Auction marked complete"
  - grouped auction teams for unresolved play-ins and regional `13-16` packages
  - grouped-team context in `Auction`, `Analysis`, and viewer surfaces
  - extracted live-room controller and dedicated operator/viewer auction workspace components
- live-room recommendation math now derives from Mothership automatically instead of a selectable focus syndicate
- live dashboard now refreshes on session syndicate changes in addition to purchases and session meta changes
- runtime config now fails fast if Vercel is missing required Supabase variables or tries to use local storage
- Supabase schema now includes persisted auction completion fields on `auction_sessions`

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
  - manages access, shared code, payout structure, tracked syndicates, bracket/analysis imports, and room readiness
- `Live room`
  - operator and viewer share the same persisted Mothership room state
  - operator can update active selection, current bid, purchases, and bracket winners
  - operator can undo the most recent purchase
  - operator portfolio context is embedded in `Auction` rather than a separate room workspace
  - viewer is read-only and limited to `Auction` plus `Bracket`

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
- active selected team and current bid are live operational state, not the primary historical record
- the UI still says `team`, but the live selection can now represent:
  - one school
  - one unresolved play-in team
  - one regional `13-16` package
- viewer state must always derive from the same persisted session truth as operator state
- viewer mode is read-only, but it does display the live current bid and the same Mothership decision context as the operator surface
- viewer transport is intentionally slimmer than operator transport; viewers should not require raw `simulationSnapshot` or full `analysis` payloads to render the live board
- `projectedPot` is provisional model input
- a future `actual pot locked` state should override projected assumptions once the room closes
- once the room is fully sold, `Auction` should present a closed-books finish state rather than an awaiting-selection idle state
- once the sold-out room is explicitly marked complete, live bidding mutations should remain blocked until reopened
- Mothership is the fixed recommendation lens for every session
- Mothership purchases are the owned-position truth for live analysis and bid planning
- `Auction` and `Analysis` must remain consistent because they share one analysis snapshot
- `Bracket` must reflect the same session truth as purchases and imported field structure

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
- separate bracket + analysis import workflow
- session member login
- live board load
- in-room analysis load
- in-room bracket load
- active-team selection with automatic board update
- grouped-team selection for `13-16` and play-ins
- current bid entry
- purchase recording
- undo most recent purchase
- bracket winner advancement
- persistence across refresh

## Current Product Guarantees

- platform-admin session creation is not exposed on the public landing page
- session users authenticate with assigned email plus shared code
- viewer mode remains read-only
- viewers are trusted internal teammates and see the same Mothership-centered guidance as operators
- viewer live-room access is limited to `Auction` and `Bracket`
- the standalone `/csv-analysis` page is legacy compatibility only and should redirect into the live room
- validation errors should resolve to domain-language messages instead of raw schema failures where feasible
- production-like deployment must run with `CALCUTTA_STORAGE_BACKEND=supabase`

## Important Recent Changes

- `tournament_active` auction status added; operators can enter tournament mode from the auction-complete state, exit back to complete, and the `auction_status` column is now correctly deserialized for all three values in both read paths of the Supabase repository
- Mothership Portfolio Results tracker added to operator and viewer `Auction` boards in tournament mode; shows per-asset round progress pills (green=win, red=loss, gray=not yet played), cost/return/net per share, % of spend, and next scheduled game from ESPN
- `src/lib/results.ts` computes portfolio results from bracket state; `src/lib/espn.ts` fetches NCAA game schedule from the ESPN public scoreboard API
- `buildDashboardWithSchedule` wraps `buildDashboard` and fetches ESPN data when status is `tournament_active`; broadcast info is injected into bracket games via `broadcastIsoDate` and `broadcastNetwork` fields on `BracketGame`
- `MothershipAssetResult` extended with `nextGameIsoDate` and `nextGameNetwork`; tournament tracker rows show the next unplayed game for still-alive teams
- bracket game cards now show date/time/network from ESPN; TBD shown when no data is available
- ESPN team name normalization (`normalizeTeamName` in `espn.ts`) handles A&M suffix removal, St/State abbreviation, punctuation, parenthetical state names, and play-in group names like "Prairie View A&M / Lehigh" split into individual variants for matching
- status-change buttons (mark complete, reopen, enter/exit tournament) moved into the live controls box with `window.confirm` guards on all four
- viewer board hides the live decision board, team highlights, recent sales, and rooting guide when in tournament mode
- nav pill updated: "Tournament mode active" in `tournament_active`, "Auction marked complete" in `complete`
- summary stats grid on tournament tracker includes cost per half share in addition to per-share values
- visual design overhauled to a premium minimal token system using CSS custom properties; all surfaces use `--bg`, `--panel`, `--panel-muted`, and semantic vars instead of hardcoded colours
- dark/light theme toggle added via `ThemeToggle` component; toggle appears in session, admin center, and session admin headers; theme written to `data-theme` on `<html>` and persisted to `localStorage`
- Inter + JetBrains Mono loaded via `next/font/google`; FOUC eliminated via inline bootstrap script in `<head>`
- border-radius tightened from 28 px to 12 px max; `color-mix(in srgb, ...)` used for all semantic derived colours
- purchase route now returns a clean message when price is `<= 0`
- operator local form state no longer resets while polling/realtime refresh is active
- live dashboard now refreshes when session syndicates change
- live-room dashboard refresh is now realtime-first, falls back to `30s` polling when healthy, and only uses `2.5s` polling while realtime is degraded
- duplicate poll/broadcast/Postgres/manual refresh triggers now collapse into one trailing dashboard fetch instead of fanning out
- hidden tabs no longer fetch on realtime events; they mark the board stale and refresh once visible again
- viewer live-room reads now use a slim `ViewerDashboard` with server-computed `viewerAuction` fields instead of raw simulation and analysis payloads
- session admins and operators can mark a sold-out auction complete or reopen it later
- completed auctions stop interval polling, hide the live operator controls, and reject purchase/live-state mutations until reopened
- live-room `Analysis` now shares the same recommendation engine as `Auction`
- the separate `Portfolio` room tab was retired and folded into the main `Auction` surface
- Selection Sunday imports are now split into bracket structure and team analysis
- live room now derives grouped auction teams from the imported bracket
- `13-16` regional packages are sold as one grouped team in the live room
- unresolved play-ins are preserved in bracket import and exposed as grouped teams where appropriate
- analysis now surfaces grouped-team package context alongside team-level scouting detail
- `Analysis` now opens with a searchable team picker above the hero and follows the active auction team until the operator inspects another team locally
- admin pages no longer rely on the legacy panel shell for primary layouts
- runtime config errors no longer masquerade as missing-session 404s
- production deployments are guarded from running on local storage
- session creation is no longer exposed on the public landing page
- session users authenticate by assigned email plus shared code
- session creation and session manage no longer expose a configurable focus syndicate
- session admin now supports separate bracket and analysis CSV imports with readiness gating
- live room now includes a `Bracket` workspace backed by a session-native 64-team view model
- operators can advance bracket winners; viewers can open the same bracket in read-only mode
- the bracket surface shows syndicate ownership markers for purchased teams
- the live room now supports undoing the most recent purchase, restoring that team as active with its last bid
- feedback notices now auto-dismiss and use one shared feedback hook across admin and live surfaces
- live-room controller/state orchestration now lives in `src/components/dashboard-shell/use-live-room-controller.ts`
- operator and viewer `Auction` surfaces now live in dedicated workspace components under `src/components/dashboard-shell/`
- shared matchup and live-room selector helpers now live in `src/lib/live-room.ts` with focused unit coverage
- after recording a purchase, the live board now stays in an awaiting-selection state until the operator explicitly chooses the next team
- when the final asset is sold, the live board now swaps to an `Auction Complete` recap for both operator and viewer surfaces
- likely bidders were removed
- `Nominated team` became `Active Team for Bidding`
- the team selector is now a single searchable control
- `Update live board` was removed
- manual overrides UI was removed from the live board
- payout structure moved into session admin
- `startingBankroll` was replaced with `projectedPot`
- `house take %` was removed

## Known Gaps

- only the most recent purchase can be undone; there is still no broader correction history or audit workflow
- no final `actual pot locked` workflow after all teams are sold
- recommendation math still uses a simplified bankroll/headroom assumption
- recommendation explanations are better for grouped teams, but still lighter than the target product standard
- no full audit trail UI in admin center
- old sessions created before the Mothership-first rule may need admin correction if Mothership is not in the room
- lint still uses deprecated `next lint`
- bracket view requires a complete 64-team field; incomplete session imports remain intentionally blocked
- ESPN name matching has two known unresolved cases: "Miami (Ohio)" (ESPN uses "Miami OH") and "Cal Baptist" (ESPN uses "CA Baptist"); those bracket cards will show TBD for broadcast info
- ESPN data is cached for 5 minutes via Next.js fetch cache; clearing `.next/cache/fetch-cache` forces a fresh fetch on next load

## Manual Regression Checklist

Use this after changing auth, admin center, live controls, or payout/simulation behavior:

1. Log in as platform admin at `/`.
2. Confirm redirect to `/admin`.
3. Create a session or open an existing one.
4. On session admin, save access, rotate the code, and save payout structure.
5. Save analysis settings and confirm they persist.
6. Log in as a session user with assigned email plus shared code.
7. Confirm the live board loads with the right role.
8. Change `Active Team for Bidding` and confirm the board updates immediately.
9. Select a grouped `13-16` or play-in team and confirm member schools are visible on the board.
10. Open `Analysis` and confirm the selected team matches `Auction` on target/max bid.
11. Confirm grouped teams show package context inside `Analysis`.
12. Open `Bracket` and confirm the field renders when the session has a complete 64-team import.
13. As an operator, advance a bracket winner and confirm it persists after refresh.
14. Change current bid and confirm it persists.
15. Record a purchase with a valid bid and confirm the board returns to an awaiting-selection state.
16. Use `Undo last purchase` and confirm the team is unsold again, restored as the active team, and the bid returns.
17. Open `Analysis` and confirm the active auction team is selected by default.
18. Change teams inside `Analysis` and confirm the auction active team does not change.
19. Sell the final remaining asset and confirm the operator board flips to `Auction Complete`.
20. Mark the sold-out auction complete and confirm the operator board collapses the live controls down to completion messaging.
21. Confirm a purchase/live-state change is rejected while the auction is marked complete.
22. Reopen the auction and confirm the room accepts bidding corrections again.
23. Log in as a viewer after the room is sold out and confirm the viewer board also shows `Auction Complete` without spend/equity recap.
23a. Click "Enter tournament mode" and confirm the nav pill changes to "Tournament mode active".
23b. Confirm the Mothership Portfolio Results tracker is visible on both operator and viewer boards.
23c. Confirm bracket cards show game date/time/network for currently scheduled games, and "TBD" for unscheduled ones.
23d. Confirm the viewer board hides the decision board, team highlights, recent sales, and rooting guide in tournament mode.
23e. Click "Exit tournament mode" and confirm the room returns to auction-complete state.
24. Try recording a purchase with `0` and confirm the friendly validation error.
25. Refresh and confirm persistence.
26. Open `/csv-analysis?sessionId=<id>` and confirm redirect into the live-room `Analysis` tab.
27. Log in as a viewer and confirm the room is synchronized, bracket is viewable, and edits remain blocked.
28. Archive a session and confirm it is hidden by default in the admin sessions list.
29. Show archived sessions and confirm the archived session appears with archived state.
30. Confirm permanent delete is blocked until the exact session name is entered.
31. Permanently delete an archived session and confirm the session no longer loads in admin or live-room routes.

## Operational Notes

- local development can still use `CALCUTTA_STORAGE_BACKEND=local`, but do not treat that path as deployable
- if a Supabase environment is missing `auction_status` completion columns on `auction_sessions`, apply the latest `supabase/schema.sql` before testing completion flows
- `tournament_active` is stored as a third value in the `auction_status` column; the repository read path explicitly handles all three values (`active`, `complete`, `tournament_active`) — do not add a default fallback that would collapse `tournament_active` to `active`
- ESPN broadcast data is fetched server-side only when `auctionStatus === "tournament_active"`; no API key required; the endpoint is `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`
- if bracket cards show stale or missing broadcast data, clear `.next/cache/fetch-cache` and reload
- if dev runtime gets strange after large route/component changes, clear `.next` and restart
- old stored sessions may still contain legacy payout keys; the repository normalizes them
- `MOTHERSHIP_SYNDICATE_NAME` defaults to `Mothership` and is now the canonical strategy subject
- the clearest visible signal that configuration is correct is the session badge reading `Backend supabase`
- the winner picker on the live board is driven by the session's participating syndicates, not the global syndicate catalog
- if the live room behaves strangely after heavy Next dev churn, clear `.next` and restart before assuming the latest code is wrong
- if a live-room mutation cannot be safely corrected or audited, treat that as a product gap rather than operator error
- any future work that changes bankroll/headroom language should update UI copy, recommendation logic, and this document together
- any future work that changes analysis scoring or bid allocation should update both `src/lib/session-analysis.ts` and `src/lib/engine/recommendations.ts` together

## Backlog References

Azure DevOps items already created:

- Feature `81767`: Supabase persistence and realtime
- Feature `81768`: Projection ingestion and bid intelligence
- User Stories `81769` to `81774`
