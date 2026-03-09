# AGENTS.md

This file is for future Codex sessions and human contributors working on Calcutta SmartBid.

## Purpose

Use this file to get oriented quickly, preserve working assumptions, and avoid breaking the live auction path.

Use [SOUL.md](/Users/rmilton/Code/Calcutta-SmartBid/SOUL.md) for product intent.
Use [HEARTBEAT.md](/Users/rmilton/Code/Calcutta-SmartBid/HEARTBEAT.md) for current state and known gaps.

## Current Product Shape

Calcutta SmartBid now has two major surfaces:

- `Admin center`
  - platform-admin login at `/`
  - admin landing at `/admin`
  - session creation at `/admin/sessions/new`
  - per-session admin management at `/admin/sessions/[sessionId]`
- `Live auction board`
  - session member login with `email + shared code`
  - role-driven `admin` vs `viewer` behavior at `/session/[sessionId]`

The admin center is the control plane. The live board is the auction execution surface.

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
  - live board entry

### Admin UI

- [src/components/admin-center.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/admin-center.tsx)
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
  - data source selection and import history

### Live Board UI

- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
  - role-aware board
  - single searchable `Active Team for Bidding` control
  - auto-save on team selection
  - no `likely bidders`
  - no manual overrides panel
  - no `Update live board` button

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
- Purchases are authoritative. Do not let UI-only state become the source of truth.
- Recommendation updates during bidding must use cached simulation output, not rerun full Monte Carlo on every edit.
- The active-team control must stay fast and low-friction under live auction use.
- Raw schema errors should not leak to the operator if a clean domain message can be returned.

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
8. Change current bid and confirm it persists.
9. Record a purchase and confirm ledger and sold-team state update.
10. Refresh and confirm persistence.

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
