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
  - in-room workspaces for `Auction`, `Analysis`, `Portfolio`, `Bracket`, and `Overrides`

The admin center is the control plane. The live room is the shared Mothership execution surface. `Auction` and `Analysis` are now two views over the same session-native recommendation model, not two separate tools.

## Current Stack

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Supabase` for production persistence and data
- `Vercel` for production hosting
- `Vitest` for simulation/provider tests

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
- [src/components/session-bracket.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-bracket.tsx)
- [src/components/theme-toggle.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/theme-toggle.tsx)
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
  - role-aware live room
  - `Auction`, `Analysis`, `Portfolio`, `Bracket`, and `Overrides` workspaces
  - single searchable `Active Team for Bidding` control
  - auto-save on team selection
  - undo for the most recent purchase
  - shared selected-team state between `Auction` and `Analysis`
- [src/components/session-bracket.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-bracket.tsx)
  - full-field tournament bracket surface
  - owned-team syndicate markers
  - operator winner advancement and viewer read-only mode

### Domain and orchestration

- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
  - shared contracts
  - session/admin request schemas
  - bracket view model and last-purchase contract
- [src/lib/dashboard.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/dashboard.ts)
  - builds the shared live-room payload
  - injects bracket view and last-purchase state
- [src/lib/config.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/config.ts)
  - environment validation
- [src/lib/auth.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/auth.ts)
  - platform-admin and session-member auth
- [src/lib/session-analysis.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/session-analysis.ts)
  - session-native ranking and bid-planning model
  - builds the shared analysis snapshot consumed by `Auction` and `Analysis`
- [src/lib/bracket.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/bracket.ts)
  - builds the session-native 64-team bracket view
  - validates bracket readiness and winner advancement

### Persistence

- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
  - local and Supabase repository implementations
  - session creation
  - admin-center CRUD
  - session admin mutations
  - purchase undo and bracket winner persistence
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)
  - auction sessions
  - session members
  - platform users
  - syndicate catalog
  - data sources
  - data import runs
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
- Purchases are authoritative. Do not let UI-only state become the source of truth.
- Only the most recent purchase can be undone in the current correction flow.
- Session purchases are the owned-portfolio truth for live recommendation math.
- Recommendation updates during bidding must use cached simulation output, not rerun full Monte Carlo on every edit.
- `Auction` and `Analysis` must stay consistent for the same selected team because they read from the same analysis payload.
- `Bracket` must stay consistent with session purchases and imported field structure.
- The active-team control must stay fast and low-friction under live auction use.
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
8. Open `Bracket` and confirm the full field renders for a bracket-ready session.
9. Change current bid and confirm it persists.
10. Open `Analysis` and confirm the selected team shows the same `target bid` and `max bid` as `Auction`.
11. Change session analysis settings and confirm both `Auction` and `Analysis` update after refresh.
12. Record a purchase and confirm ledger, sold-team state, and remaining bankroll update.
13. Undo the last purchase and confirm the team returns to active bidding with the prior bid restored.
14. Advance a bracket winner and confirm the change persists after refresh.
15. Open `/csv-analysis?sessionId=<id>` and confirm it redirects into the in-room `Analysis` tab.
16. Archive a session and confirm it is hidden until archived sessions are shown.
17. Permanently delete an archived session only after exact name confirmation and confirm the session no longer loads.

## Test Commands

```bash
npm run lint
npm run test
npm run build
```

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
- The live board still uses `remainingBankroll` as derived headroom from `projectedPot / syndicateCount`. If that business model changes, update repository math and recommendation language together.
- Bracket view requires a complete 64-team field; incomplete imports intentionally render a bracket-unavailable state.
- Purchase correction currently only supports undoing the most recent purchase.
- `/csv-analysis` is now a compatibility redirect. The maintained workflow is the in-room `Analysis` tab.
- Session lifecycle now supports archive plus permanent delete. Permanent delete is intentionally gated behind archive plus typed confirmation.
