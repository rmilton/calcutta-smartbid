# HEARTBEAT.md

This file is the current-state handoff document. Update it when the system meaningfully changes.

## Last Known Good State

As of `2026-03-06`:

- app runs locally against Supabase via `.env.local`
- local smoke test passed:
  - create session
  - update live board
  - record purchase
  - refresh and confirm persistence
- production deployment on `Vercel + Supabase` was confirmed working
- runtime config now fails fast if Vercel is missing required Supabase variables or tries to use local storage

## Deployment Shape

- frontend/app hosting: `Vercel`
- database and realtime: `Supabase`
- production backend mode: `supabase`

Key files:

- [src/lib/config.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/config.ts)
- [src/lib/repository/index.ts](/Users/rmilton/Code/Calcutta-SmartBid/src/lib/repository/index.ts)
- [supabase/schema.sql](/Users/rmilton/Code/Calcutta-SmartBid/supabase/schema.sql)

## Core User Flows Working

- create auction session
- operator dashboard load
- viewer mode load
- live-state update
- purchase recording
- projection override save/clear
- simulation rebuild
- persistence across refresh
- Supabase-backed realtime refresh path

## Important Recent Fixes

- purchase route now returns a clean message when price is `<= 0`
- operator local form state no longer resets while polling/realtime refresh is active
- runtime config errors no longer masquerade as missing-session 404s
- production deployments are guarded from running on local storage

## Current Backlog Themes

These are the most sensible next major workstreams:

1. `Auth and roles hardening`
2. `Auction workflow safety`
3. `Projection provider and recommendation-model depth`
4. `Reporting and historical analysis`

## Known Gaps

- no named-user auth yet; passcodes/session access are still lightweight
- no robust undo/correction workflow for operator mistakes during a live room
- recommendation model is good enough for MVP use but still heuristic-heavy
- remote projection ingest exists, but provider normalization and override ergonomics can be improved
- lint still uses deprecated `next lint`

## Manual Regression Checklist

Use this exact list after changing core auction behavior:

1. Create a session.
2. Confirm the session header shows `Backend supabase`.
3. Change nominated team without saving and wait a few seconds.
4. Change current bid without saving and wait a few seconds.
5. Confirm both values remain intact locally.
6. Click `Update live board`.
7. Record a purchase with a valid bid.
8. Try recording a purchase with `0` and confirm the friendly validation error.
9. Refresh the session page and confirm persistence.
10. Open another tab in `viewer` mode and confirm updates arrive.

## Operational Notes

- local development can still use `CALCUTTA_STORAGE_BACKEND=local`, but do not treat that path as deployable
- if the app behaves strangely in dev after large changes, a clean `.next` rebuild may still be necessary
- the clearest visible signal that configuration is correct is the session badge reading `Backend supabase`

## Backlog References

Azure DevOps items previously created for this project:

- Feature `81767`: Supabase persistence and realtime
- Feature `81768`: Projection ingestion and bid intelligence
- User Stories `81769` to `81774`: underlying implementation slices for persistence, realtime, recommendations, overrides, and projection ingest
