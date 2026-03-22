# AGENTS.md

This file is for future Codex sessions and human contributors working on Calcutta SmartBid.

## Purpose

Use this file to get oriented quickly, preserve working assumptions, and avoid breaking the live auction path.

Use [SOUL.md](/Users/rmilton/Code/Calcutta-SmartBid/SOUL.md) for product intent.
Use [DESIGN.md](/Users/rmilton/Code/Calcutta-SmartBid/DESIGN.md) for visual direction and shared UI rules.
Use [HEARTBEAT.md](/Users/rmilton/Code/Calcutta-SmartBid/HEARTBEAT.md) for current state and known gaps.

## Current Product Shape

Calcutta SmartBid now has two major surfaces:

- `Admin center`
  - platform-admin login at `/`
  - admin landing at `/admin`
  - session creation at `/admin/sessions/new`
  - per-session admin management at `/admin/sessions/[sessionId]`
- `Live room`
  - session member login with `email + shared code`
  - role-driven `operator` vs `viewer` behavior at `/session/[sessionId]`
  - in-room workspaces for `Auction`, `Analysis`, `Bracket`, and `Overrides`

The admin center is the control plane. The live room is the shared Mothership execution surface. `Auction` and `Analysis` are now two views over the same session-native recommendation model, not two separate tools. Portfolio context now lives directly inside the `Auction` workspace instead of a separate room tab.
Selection Sunday prep is now session-managed: bracket structure and team analysis are imported separately, then merged into the live room.

## Current Stack

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Supabase` for production persistence and data
- `Vercel` for production hosting
- `Vitest` for unit and component coverage

## First Places To Read

- [README.md](/Users/rmilton/Code/Calcutta-SmartBid/README.md)
- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
- [src/lib/auth.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/auth.ts)
- [src/lib/session-analysis.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/session-analysis.ts)
- [src/lib/bracket.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/bracket.ts)
- [src/components/admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/admin-center.tsx)
- [src/components/session-admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-admin-center.tsx)
- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
- [src/components/dashboard-shell/use-live-room-controller.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/use-live-room-controller.ts)
- [src/components/dashboard-shell/operator-auction-workspace.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/operator-auction-workspace.tsx)
- [src/components/dashboard-shell/viewer-auction-workspace.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/viewer-auction-workspace.tsx)
- [src/components/dashboard-shell/shared.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/shared.tsx)
- [src/components/session-bracket.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-bracket.tsx)
- [src/components/theme-toggle.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/theme-toggle.tsx)
- [src/lib/live-room.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/live-room.ts)
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)

## Architectural Map

### Routes

- [src/app/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/page.tsx)
  - login-only landing page
  - platform admin redirects to `/admin`
  - session users authenticate with `email + shared code`
- [src/app/admin/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin/page.tsx)
  - admin center overview
- [src/app/admin/sessions/new/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin/sessions/new/page.tsx)
  - new session creation
- [src/app/admin/sessions/[sessionId]/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin/sessions/[sessionId]/page.tsx)
  - session management
- [src/app/session/[sessionId]/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/session/[sessionId]/page.tsx)
  - live room entry
  - `?view=analysis` opens the deeper in-room analysis workspace
  - `?view=bracket` opens the tournament bracket workspace
- [src/app/csv-analysis/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/csv-analysis/page.tsx)
  - legacy compatibility route
  - redirects into `/session/[sessionId]?view=analysis`

### Admin UI

- [src/components/admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/admin-center.tsx)
  - platform admin center
  - org users
  - syndicate catalog
  - data sources
  - session list
- [src/components/setup-form.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/setup-form.tsx)
  - creates sessions from org users, catalog syndicates, and active data source
  - includes payout defaults and `projectedPot`
- [src/components/session-admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-admin-center.tsx)
  - session access assignment
  - shared code rotation
  - participating syndicates
  - payout structure
  - shared analysis settings
  - bracket and analysis CSV imports with readiness checks
  - legacy data source fallback and import history
- [src/app/globals.css](/Users/rmilton/Code/Calcutta-SmartBid/src/app/globals.css)
  - shared design tokens and UI primitives

### Live Board UI

- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
  - role-aware live room composition shell
  - owns shared session header, workspace routing, and `Analysis` / `Overrides` rendering
  - branches cleanly between full operator dashboards and slimmer viewer dashboards
- [src/components/dashboard-shell/use-live-room-controller.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/use-live-room-controller.ts)
  - live-room local state and mutation orchestration
  - keyboard shortcuts, bid persistence, purchase actions, bracket saves, and analysis annotations
  - one-way sync from the auction active team into the analysis team selector
  - sync guards so operator local state is not clobbered during polling/realtime refresh
- [src/components/dashboard-shell/operator-auction-workspace.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/operator-auction-workspace.tsx)
  - operator-only `Auction` workspace
  - live controls, decision board, decision context, model drivers, recent sales, and expandable syndicate holdings
  - sellout-only complete/reopen/enter-tournament controls; all four status-change buttons require `window.confirm`
  - auction-complete recap and tournament-active portfolio tracker state
- [src/components/dashboard-shell/viewer-auction-workspace.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/viewer-auction-workspace.tsx)
  - viewer-only `Auction` workspace
  - read-only decision board, ownership ledger, sold feed, and synchronized Mothership guidance
  - powered by a slimmer server-computed `viewerAuction` payload instead of raw simulation payloads
  - team-focused auction-complete state without spend/equity recap
  - in tournament mode hides the full auction grid (decision board, team highlights, recent sales, rooting guide) and shows the portfolio tracker
- [src/components/dashboard-shell/tournament-tracker.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/tournament-tracker.tsx)
  - Mothership Portfolio Results tracker rendered in tournament mode on both operator and viewer boards
  - per-asset round progress pills (won/alive/eliminated-before/not-reached), cost/return/net per share, next scheduled game
  - reads `MothershipPortfolioResults` from the dashboard payload; data is computed by `src/lib/results.ts`
- [src/components/dashboard-shell/shared.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell/shared.tsx)
  - shared live-room presentation primitives, asset-formatting helpers, and shared auction-complete row rendering
- [src/components/session-bracket.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-bracket.tsx)
  - full-field tournament bracket surface
  - owned-team syndicate markers
  - operator winner advancement and viewer read-only mode
  - bracket game cards show ESPN broadcast info (date and time only, no network) when in tournament mode; "TBD" for unscheduled games; "Final" for completed games

### Domain and orchestration

- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
  - shared contracts
  - session/admin request schemas
  - bracket view model and last-purchase contract
- [src/lib/dashboard.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/dashboard.ts)
  - builds audience-aware live-room payloads
  - injects bracket view, last-purchase state, and Mothership portfolio results
  - `buildDashboardWithSchedule` fetches ESPN broadcast data when `auctionStatus === "tournament_active"` and passes it into the bracket build
- [src/lib/config.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/config.ts)
  - environment validation
- [src/lib/auth.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/auth.ts)
  - platform-admin and session-member auth
- [src/lib/session-analysis.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/session-analysis.ts)
  - session-native ranking and bid-planning model
  - builds the shared analysis snapshot consumed by `Auction` and `Analysis`
  - still team-level, but now surfaces grouped auction-team context
- [src/lib/live-room.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/live-room.ts)
  - shared live-room selectors and matchup helpers
  - syndicate ordering, ownership grouping, operator holdings, and recommendation-rationale filtering
- [src/lib/bracket.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/bracket.ts)
  - builds the session-native 64-team bracket view
  - validates bracket readiness and winner advancement
  - accepts optional `EspnScheduleMap` and injects broadcast info into each `BracketGame`; uses `normalizeTeamName` from `espn.ts` for fuzzy matching, and splits play-in group names on " / " to try each individual team
- [src/lib/results.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/results.ts)
  - computes `MothershipPortfolioResults` from bracket state and Mothership purchases
  - derives round wins, elimination status, realized payouts, per-share math, and next unplayed game for each owned asset
- [src/lib/espn.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/espn.ts)
  - fetches today + 6 days of NCAA game schedules from the ESPN public scoreboard API
  - builds an `EspnScheduleMap` keyed by normalized team-pair strings
  - exports `normalizeTeamName` for consistent fuzzy matching across name sources

### Persistence

- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
  - local and Supabase repository implementations
  - session creation
  - admin-center CRUD
  - session admin mutations
  - session-managed Selection Sunday imports
  - persisted auction completion state on `auction_sessions`
  - purchase undo and bracket winner persistence
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)
  - auction sessions
  - session members
  - platform users
  - syndicate catalog
  - data sources
  - data import runs
  - session-level bracket and analysis import storage
  - undo purchase transaction support

### Auction intelligence

- [src/lib/providers/projections.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/providers/projections.ts)
  - built-in mock field
  - CSV/API source loading
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
  - Monte Carlo engine
  - payout model uses stage percentages plus `projectedPot`
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts)
  - live recommendation contract for opening, target, and max bids
- [src/lib/session-analysis.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/session-analysis.ts)
  - CSV-style team intelligence and budget planning, adapted to the live session field

## Invariants

- Production must run with `CALCUTTA_STORAGE_BACKEND=supabase`.
- Platform admins create sessions. The public landing page should not expose session creation.
- Session users authenticate with assigned email plus the session shared code.
- Viewer mode is role-driven and read-only.
- Viewer dashboard payloads are intentionally slimmer than operator payloads; preserve the `ViewerDashboard` / `viewerAuction` contract when changing the live-room read path.
- Purchases are authoritative. Do not let UI-only state become the source of truth.
- Only the most recent purchase can be undone in the current correction flow.
- Session purchases are the owned-position truth for live recommendation math.
- Recommendation updates during bidding must use cached simulation output, not rerun full Monte Carlo on every edit.
- `Auction` and `Analysis` must stay consistent for the same selected team because they read from the same analysis payload.
- `Analysis` should follow the active auction team by default, but local analysis exploration must not overwrite the auction active team.
- The UI still says `team`, but the live selection model can represent grouped auction teams such as play-ins and regional `13-16` packages.
- Bracket structure and team analysis are separate session inputs and should not be collapsed back into one import flow.
- `Bracket` must stay consistent with session purchases and imported field structure.
- The active-team control must stay fast and low-friction under live auction use.
- Once every auction asset is sold, the live decision boards should move into an explicit auction-complete state instead of a waiting-for-selection idle state.
- `auctionStatus` is an explicit persisted room state with three values: `active`, `complete`, `tournament_active`. Completed auctions stop interval polling and block bidding mutations until reopened. The repository read path must handle all three values explicitly — do not default `tournament_active` to `active`.
- `portfolioResults` is included in both `AuctionDashboard` and `ViewerDashboard` and is non-null only when `auctionStatus === "tournament_active"` and Mothership has purchases.
- ESPN broadcast data is fetched server-side only when `tournament_active`; it flows through `buildDashboardWithSchedule` → `buildBracketView` → `BracketGame.broadcastIsoDate` / `broadcastNetwork`. Do not persist broadcast data to the database.
- The live winner picker must reflect the session's participating syndicates, not the global syndicate catalog.
- Raw schema errors should not leak to the operator if a clean domain message can be returned.

## Design System Expectations

- The active visual direction is a premium minimal live-market UI with dual dark/light theme support, not the legacy warm auction aesthetic.
- All colours must come from CSS custom properties in `src/app/globals.css`. Never hardcode hex or rgba values in components — both themes must work automatically via `var(--token-name)`.
- `ThemeToggle` (`src/components/theme-toggle.tsx`) controls the `data-theme` attribute on `<html>` and persists to `localStorage`. It is rendered in session, admin center, and session admin headers.
- Prefer the shared primitives in `src/app/globals.css` such as `surface-card`, `button`, `field-shell`, `workspace-tab`, and `status-pill`.
- New admin or live-session UI should match the current shell and spacing patterns before introducing new layout systems.
- Avoid extending the old compatibility classes unless the goal is temporary migration support.
- Feedback messaging should use the shared `useFeedbackMessage` hook so notices auto-dismiss consistently across surfaces.

## Environment Expectations

Production-like local work should use `.env.local` with:

```bash
CALCUTTA_STORAGE_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PLATFORM_ADMIN_EMAILS=...
PLATFORM_ADMIN_NAMES=...
PLATFORM_ADMIN_SHARED_CODE=...
AUTH_SESSION_SECRET=...
```

## Smoke Test Checklist

Run this after touching auth, admin flows, dashboard controls, or payout/simulation behavior:

1. Log in as platform admin at `/`.
2. Confirm you land on `/admin`.
3. Create or open a session from the admin center.
4. On the session admin page, update session access, rotate the shared code, and save payout structure.
5. Log in as a session member with assigned email plus shared code.
6. Confirm the live board loads in the expected role.
7. Change `Active Team for Bidding` and confirm the board updates automatically.
8. If a grouped `13-16` or play-in team is selected, confirm the member schools are visible on the board.
9. Open `Bracket` and confirm the full field renders for a bracket-ready session.
10. Change current bid and confirm it persists.
11. Open `Analysis` and confirm the selected team shows the same `target bid` and `max bid` as `Auction`.
12. Confirm `Analysis` opens on the active auction team by default.
13. Change teams inside `Analysis` and confirm the auction active team does not change.
14. Confirm grouped teams show their package context in `Analysis`.
15. Change session analysis settings and confirm both `Auction` and `Analysis` update after refresh.
16. Record a purchase and confirm ledger, sold-team state, and remaining bankroll update.
17. After recording a purchase, confirm the board waits for the operator's next selection instead of auto-selecting the next team.
18. Sell the final remaining asset and confirm the operator board flips to `Auction Complete`.
19. Mark the sold-out auction complete and confirm live bidding controls are replaced by completion messaging.
20. Confirm live-state and purchase mutations are blocked while the auction is marked complete.
21. Reopen the auction and confirm the last purchase can still be undone for correction.
22. Log in as a viewer after sellout and confirm the viewer board also shows `Auction Complete` without spend/equity recap.
22a. Click "Enter tournament mode" and confirm the nav pill changes to "Tournament mode active".
22b. Confirm the Mothership Portfolio Results tracker appears on operator and viewer boards.
22c. Confirm bracket cards show date + time (no network) for scheduled games, "TBD" for unscheduled games, and "Final" for completed games.
22d. Confirm the viewer board hides the decision board, team highlights, recent sales, and rooting guide in tournament mode.
22e. Click "Exit tournament mode" and confirm the board returns to auction-complete state.
23. Undo the last purchase and confirm the team returns to active bidding with the prior bid restored.
24. Advance a bracket winner and confirm the change persists after refresh.
25. Open `/csv-analysis?sessionId=<id>` and confirm it redirects into the in-room `Analysis` tab.
26. Archive a session and confirm it is hidden until archived sessions are shown.
27. Permanently delete an archived session only after exact name confirmation and confirm the session no longer loads.

## Test Commands

```bash
npm run lint
npm run test
npm run build
```

Focused live-room coverage:

```bash
npm run test -- --run src/lib/hooks/use-session-dashboard.test.ts src/lib/live-room.test.ts src/components/dashboard-shell/operator-auction-workspace.test.ts src/components/dashboard-shell/viewer-auction-workspace.test.ts src/components/dashboard-shell.test.ts
```

Fixture note:

- `AuctionDashboard` test fixtures should always include `availableAssets` and `soldAssets`. They are required dashboard contract fields and should not rely on workspace-local fallbacks.

## Safe Parallelization

The cleanest parallel split remains:

### Track A: Auth, admin center, repository, schema

- [src/lib/auth.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/auth.ts)
- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)
- [src/app/admin](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin)
- [src/app/api/admin](/Users/rmilton/Code/Calcutta-SmartBid/src/app/api/admin)

### Track B: Live board UX and auction intelligence

- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
- [src/components/dashboard-shell](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell)
- [src/lib/live-room.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/live-room.ts)
- [src/lib/session-analysis.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/session-analysis.ts)
- [src/lib/bracket.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/bracket.ts)
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts)
- [src/lib/providers/projections.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/providers/projections.ts)

Shared contract hot spots:

- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
- [src/lib/dashboard.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/dashboard.ts)
- session APIs under [src/app/api/sessions](/Users/rmilton/Code/Calcutta-SmartBid/src/app/api/sessions)

Use separate git worktrees if two Codex sessions are editing in parallel.

## Known Sharp Edges

- `next lint` still uses the deprecated Next wrapper.
- The repository still supports a local JSON backend for development only.
- Older stored sessions may still contain legacy payout fields. The repository normalizes them on load.
- Local team logos are manifest-backed from `public/team-logos/prototype/manifest.json`; when the tournament field changes, refresh them with `npm run logos:prototype` before wiring new teams into a session.
- The live board still uses `remainingBankroll` as derived headroom from `projectedPot / syndicateCount`. If that business model changes, update repository math and recommendation language together.
- Bracket view requires a complete 64-team field; incomplete imports intentionally render a bracket-unavailable state.
- Purchase correction currently only supports undoing the most recent purchase.
- `/csv-analysis` is now a compatibility redirect. The maintained workflow is the in-room `Analysis` tab.
- the Selection Sunday path now depends on session-managed bracket and analysis imports rather than a single projection source
- Supabase-backed environments now also depend on the persisted `auction_status` completion columns on `auction_sessions`; this column stores `active`, `complete`, or `tournament_active`
- unresolved play-ins and regional `13-16` packages are supported as grouped auction teams, but deeper simulation/modeling should still be treated carefully when that logic changes
- ESPN name matching uses `normalizeTeamName` on both sides; if new schools surface with source-specific abbreviations, add an explicit alias in `src/lib/espn.ts` rather than broadening the generic normalization rules.
- ESPN fetch results are cached by Next.js fetch cache for 5 minutes; stale data can be cleared by deleting `.next/cache/fetch-cache`
- bracket game broadcast info is computed at dashboard-build time from the ESPN map; the `BracketGame` type carries `broadcastIsoDate` and `broadcastNetwork` — do not assume these are null in tournament mode
- Session lifecycle now supports archive plus permanent delete. Permanent delete is intentionally gated behind archive plus typed confirmation.
