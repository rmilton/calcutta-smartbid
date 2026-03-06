# AGENTS.md

This file is for future Codex sessions and human contributors working on Calcutta SmartBid.

## Purpose

Calcutta SmartBid is a live auction decision-support app for NCAA March Madness Calcutta auctions. The operator needs fast, reliable guidance while the auction is moving. The system should prefer correctness, recovery, and clarity over cleverness.

Use this file for:

- where to start in the codebase
- what must not be broken
- how to split work safely across branches or worktrees

Use [SOUL.md](/Users/rmilton/Code/Calcutta-SmartBid/SOUL.md) for product intent.
Use [HEARTBEAT.md](/Users/rmilton/Code/Calcutta-SmartBid/HEARTBEAT.md) for current status and next work.

## Current Stack

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Supabase` for production persistence and realtime
- `Vitest` for simulation/provider tests
- `Vercel` for production hosting

## First Places To Read

- [README.md](/Users/rmilton/Code/Calcutta-SmartBid/README.md)
- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx)
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)

## Architectural Map

### App shell and routes

- [src/app/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/page.tsx): landing page and setup entry
- [src/app/session/[sessionId]/page.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/app/session/[sessionId]/page.tsx): session dashboard entry
- [src/app/api/sessions](/Users/rmilton/Code/Calcutta-SmartBid/src/app/api/sessions): API surface for session creation, live state, purchases, projection import, overrides, and simulation rebuilds

### UI

- [src/components/setup-form.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/setup-form.tsx): create-session flow
- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx): operator/viewer experience, live controls, overrides, recommendation panel

### Domain and orchestration

- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts): domain contracts and request schemas
- [src/lib/dashboard.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/dashboard.ts): dashboard view-model assembly
- [src/lib/config.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/config.ts): runtime storage/backend validation

### Persistence

- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts): repository abstraction and backend selection
- [src/lib/supabase/server.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/supabase/server.ts): privileged server client
- [src/lib/supabase/client.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/supabase/client.ts): browser realtime client
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql): schema and transactional purchase RPC

### Auction intelligence

- [src/lib/providers/projections.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/providers/projections.ts): sample and remote projection ingest, overrides application
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts): Monte Carlo tournament model
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts): max-bid guidance and risk signals

## Invariants

- Production must run with `CALCUTTA_STORAGE_BACKEND=supabase`.
- Vercel deployments should fail fast if Supabase env vars are missing.
- Purchases are authoritative market events. Do not add logic that lets UI state drift from persisted purchase state.
- Recommendation updates during bidding should use cached simulation output. Do not rerun full Monte Carlo on every bid keystroke.
- Viewer mode stays read-only.
- Raw validation errors should not leak to operators when a clean domain error can be returned.
- Local form edits in the dashboard must not be overwritten by background refresh before the operator saves.

## Environment Expectations

Local development supports two modes:

- `local` backend: easy startup and fixture iteration
- `supabase` backend: production-like behavior and the required Vercel path

For production-like local work, `.env.local` should contain:

```bash
CALCUTTA_STORAGE_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Smoke Test Checklist

Run before merging anything that touches core flows:

1. Create a session.
2. Confirm session header shows `Backend supabase` when testing production-like config.
3. Change nominated team and current bid, wait a few seconds, and confirm local edits are not reset.
4. Update live board and confirm recommendation refreshes.
5. Record a purchase and confirm ledger, sold-team availability, and last-sale panel update.
6. Refresh the page and confirm persistence.
7. Open `?mode=viewer` in another tab and confirm it reflects changes without edit controls.

## Test Commands

```bash
npm run lint
npm run test
npm run build
```

## Safe Parallelization

Two workstreams can usually move in parallel if they respect boundaries:

### Track A: Persistence, auth, realtime, workflow safety

Primary files:

- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
- [src/lib/supabase/server.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/supabase/server.ts)
- [src/lib/supabase/client.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/supabase/client.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)
- [src/lib/hooks/use-session-dashboard.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/hooks/use-session-dashboard.ts)

### Track B: Projection ingest and auction intelligence

Primary files:

- [src/lib/providers/projections.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/providers/projections.ts)
- [src/lib/engine/simulation.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/simulation.ts)
- [src/lib/engine/recommendations.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.ts)
- [src/components/dashboard-shell.tsx](/Users/rmilton/Code/Calcutta-SmartBid/src/components/dashboard-shell.tsx) for additive UI exposure only

Shared contract to avoid breaking:

- [src/lib/types.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/types.ts)
- API routes under [src/app/api/sessions](/Users/rmilton/Code/Calcutta-SmartBid/src/app/api/sessions)

If two contributors need to move quickly, use separate git worktrees and separate `codex/...` branches.

## Change Discipline

- Keep domain types coherent. If a type changes, update both the route payloads and the dashboard model.
- Prefer additive dashboard fields over breaking UI contracts.
- If you touch recommendation behavior, add or update tests in [src/lib/engine/recommendations.test.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/engine/recommendations.test.ts).
- If you touch projection ingest behavior, add or update tests in [src/lib/providers/projections.test.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/providers/projections.test.ts).
- If you touch simulation outputs, keep deterministic test mode stable.

## Known Sharp Edges

- `next lint` still uses the deprecated Next wrapper. It works, but migration to ESLint CLI remains future cleanup.
- The repository still supports a local JSON fallback for development. That path is not a production deployment target.
- Session page errors used to be masked as 404s. That has been corrected. Keep config/runtime errors visible.
