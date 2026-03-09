# HEARTBEAT.md

This is the current-state handoff document. Update it when behavior, architecture, or deployment assumptions materially change.

## Last Known Good State

As of `2026-03-09`:

- app runs locally against Supabase via `.env.local`
- production deployment on `Vercel + Supabase` has been confirmed working
- platform-admin login routes to `/admin`
- admin center supports:
  - org users
  - syndicate catalog
  - data sources
  - session list
- session admin supports:
  - access assignment
  - shared code rotation
  - participating syndicates
  - payout structure editing
  - active data source selection
  - import history
- live board supports:
  - role-driven admin/viewer access
  - searchable single-control `Active Team for Bidding`
  - automatic board update on team selection
  - purchase recording and persistence

## Current Financial / Auction Model

- payout structure is stored as round percentages plus `projectedPot`
- `projectedPot` drives payout/EV forecasting
- `house take %` has been removed from the model
- per-syndicate `remainingBankroll` is currently derived as:
  - `projectedPot / syndicateCount - spend`
- this is still an assumption layer, not the final real-pot model

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
- admin center load
- org user management
- syndicate catalog management
- data source management
- session creation from admin center
- session admin configuration
- session member login
- live board load
- active-team selection with automatic board update
- current bid entry
- purchase recording
- persistence across refresh

## Important Recent Changes

- session creation is no longer exposed on the public landing page
- session users authenticate by assigned email plus shared code
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
- no final “actual pot locked” workflow after all teams are sold
- recommendation math still uses a simplified bankroll/headroom assumption
- no full audit trail UI in admin center
- no session archive/delete flow
- lint still uses deprecated `next lint`

## Manual Regression Checklist

Use this after changing auth, admin center, live controls, or payout/simulation behavior:

1. Log in as platform admin at `/`.
2. Confirm redirect to `/admin`.
3. Create a session or open an existing one.
4. On session admin, save access, rotate the code, and save payout structure.
5. Log in as a session user with assigned email plus shared code.
6. Confirm the live board loads with the right role.
7. Change `Active Team for Bidding` and confirm the board updates immediately.
8. Change current bid and confirm it persists.
9. Record a purchase with a valid bid.
10. Try recording a purchase with `0` and confirm the friendly validation error.
11. Refresh and confirm persistence.

## Operational Notes

- local development can still use `CALCUTTA_STORAGE_BACKEND=local`, but do not treat that path as deployable
- if dev runtime gets strange after large route/component changes, clear `.next` and restart
- old stored sessions may still contain legacy payout keys; the repository normalizes them

## Backlog References

Azure DevOps items already created:

- Feature `81767`: Supabase persistence and realtime
- Feature `81768`: Projection ingestion and bid intelligence
- User Stories `81769` to `81774`
