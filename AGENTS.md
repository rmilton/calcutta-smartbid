# AGENTS.md

This file is for future Codex sessions and human contributors working on Calcutta SmartBid.

## Purpose

Use this file to get oriented quickly, preserve working assumptions, and avoid breaking the live auction path.

Use [SOUL.md](/Users/rmilton/Code/Calcutta-SmartBid/SOUL.md) for product intent.
Use [DESIGN.md](/Users/rmilton/Code/Calcutta-SmartBid/DESIGN.md) for visual direction and shared UI rules.
Use [HEARTBEAT.md](/Users/rmilton/Code/Calcutta-SmartBid/HEARTBEAT.md) for current state and known gaps.

## Current Product Shape

Calcutta SmartBid now has three major user-facing workspaces:

- `Role-choice landing`
  - explicit `Platform admin` vs `Join session` choice at `/`
- `Platform admin workspace`
  - Sessions-first landing at `/admin`
  - session creation at `/admin/sessions/new`
  - per-session readiness workspace at `/admin/sessions/[sessionId]`
- `Session workspace`
  - live board at `/session/[sessionId]`
  - viewer preview via `/session/[sessionId]?preview=viewer`
  - session analysis at `/csv-analysis?sessionId=...`

The platform admin workspace is the control plane. The session workspace is the auction execution surface.

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
- [src/components/admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/admin-center.tsx)
- [src/components/session-admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-admin-center.tsx)
- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)

## Architectural Map

### Routes

- [src/app/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/page.tsx)
  - explicit role-choice landing page
  - clarifies platform-admin vs session-member destination before sign-in
- [src/app/admin/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin/page.tsx)
  - Sessions-first platform admin landing
- [src/app/admin/sessions/new/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin/sessions/new/page.tsx)
  - new session creation with readiness framing
- [src/app/admin/sessions/[sessionId]/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/admin/sessions/[sessionId]/page.tsx)
  - session readiness management
- [src/app/session/[sessionId]/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/session/[sessionId]/page.tsx)
  - live board entry
  - operator board and viewer preview shell
- [src/app/csv-analysis/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/csv-analysis/page.tsx)
  - session analysis workspace
  - uploaded CSV source selection plus local CSV fallback

### Admin UI

- [src/components/admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/admin-center.tsx)
  - Sessions-first platform admin workspace
  - sidebar workspace navigation
  - session launch links for setup, operator board, viewer preview, and analysis
- [src/components/setup-form.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/setup-form.tsx)
  - creates sessions from org users, catalog syndicates, and active data source
  - includes payout defaults and `projectedPot`
- [src/components/session-admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-admin-center.tsx)
  - session readiness checklist
  - operator/viewer access assignment
  - shared room code rotation
  - participating syndicates
  - room economics
  - data source selection and import history
- [src/components/session-workspace-nav.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/session-workspace-nav.tsx)
  - stable navigation between setup, live board, and analysis
- [src/components/access-guide.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/access-guide.tsx)
  - guided unauthorized and mismatched-role states
- [src/app/globals.css](/Users/rmilton/Code/Calcutta-SmartBid/src/app/globals.css)
  - shared design tokens and UI primitives

### Live Board UI

- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
  - role-aware board
  - shared session frame for operator and viewer
  - session workspace navigation
  - `Live board`, `Portfolio`, `Projection lab`, and `Room snapshot` tabs for operator
  - viewer preview support for platform admins

### Domain and orchestration

- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
  - shared contracts
  - session/admin request schemas
- [src/lib/dashboard.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/dashboard.ts)
  - builds board payload
- [src/lib/config.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/config.ts)
  - environment validation
- [src/lib/auth.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/auth.ts)
  - platform-admin and session-member auth

### Persistence

- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
  - local and Supabase repository implementations
  - session creation
  - admin-center CRUD
  - session admin mutations
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)
  - auction sessions
  - session members
  - platform users
  - syndicate catalog
  - data sources
  - data import runs

### Auction intelligence

- [src/lib/providers/projections.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/providers/projections.ts)
  - built-in mock field
  - CSV/API source loading
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
  - Monte Carlo engine
  - payout model uses stage percentages plus `projectedPot`
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts)
  - max-bid guidance and ownership conflict signals

## Invariants

- Production must run with `CALCUTTA_STORAGE_BACKEND=supabase`.
- Platform admins create sessions. The public landing page should not expose session creation.
- Session users authenticate with assigned email plus the session shared code.
- Viewer mode is role-driven and read-only.
- User-facing session role copy should say `Operator` instead of `Admin`.
- Purchases are authoritative. Do not let UI-only state become the source of truth.
- Recommendation updates during bidding must use cached simulation output, not rerun full Monte Carlo on every edit.
- The active-team control must stay fast and low-friction under live auction use.
- The live winner picker must reflect the session's participating syndicates, not the global syndicate catalog.
- Raw schema errors should not leak to the operator if a clean domain message can be returned.

## Design System Expectations

- The active visual direction is a dark premium live-market UI, not the legacy warm auction aesthetic.
- Prefer the shared primitives in `src/app/globals.css` such as `surface-card`, `button`, `field-shell`, `status-pill`, `breadcrumb-trail`, `workspace-nav`, and `session-workspace-nav`.
- New admin or live-session UI should match the current shell and spacing patterns before introducing new layout systems.
- Avoid extending the old compatibility classes unless the goal is temporary migration support.

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
2. Confirm the landing page explains control-plane vs live-room entry.
3. Confirm you land on `/admin`.
3. Create or open a session from the admin center.
4. On the session readiness page, update access, rotate the shared room code, save room economics, and run a projection import.
5. Log in as a session member with assigned email plus shared code.
6. Confirm the live board loads in the expected role.
7. Confirm session workspace navigation is visible and consistent across setup, live board, and analysis.
8. Change `Active Team for Bidding` and confirm the board updates automatically.
9. Open viewer preview and confirm it matches the session shell in read-only mode.
10. Open analysis and confirm source selection works.
11. Change current bid and confirm it persists.
12. Record a purchase and confirm ledger and sold-team state update.
13. Refresh and confirm persistence.

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
- Some auth-protected pages now render guided access states at the page level instead of redirecting to `/`.
