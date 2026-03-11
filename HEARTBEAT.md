# HEARTBEAT.md

This is the current-state handoff document. Update it when behavior, architecture, or deployment assumptions materially change.

## Last Known Good State

As of `2026-03-10`:

- app runs locally against Supabase via `.env.local`
- local smoke test passed:
  - create session
  - update live board
  - record purchase
  - refresh and confirm persistence
- production deployment on `Vercel + Supabase` has been confirmed working
- redesigned UI is live across landing, setup, live session, viewer board, analysis, and admin surfaces
- landing page now uses explicit `Platform admin` vs `Join session` framing
- platform-admin login routes to `/admin`
- admin workspace is now Sessions-first with secondary navigation for directory, syndicates, and data sources
- session admin supports:
  - room readiness checklist
  - operator/viewer assignment
  - shared room code rotation
  - participating syndicates
  - room economics editing
  - active data source selection
  - import history
  - launch links for operator board, viewer preview, and analysis
- live board supports:
  - role-driven operator/viewer access
  - shared session frame between operator and viewer
  - session workspace navigation
  - viewer preview for platform admins
  - purchase recording and persistence
- analysis supports:
  - session-scoped source selection
  - uploaded admin CSV sources plus local env CSV fallback
- live dashboard now refreshes on session syndicate changes in addition to purchases and session meta changes
- runtime config now fails fast if Vercel is missing required Supabase variables or tries to use local storage

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
- Sessions-first admin navigation
- org user management
- syndicate catalog management
- data source management
- session creation from admin center
- session readiness configuration
- session member login
- live board load
- analysis page load
- active-team selection with automatic board update
- current bid entry
- purchase recording
- persistence across refresh

## Important Recent Changes

- landing page now explains `Platform admin` vs `Join session` before sign-in
- admin center now treats `Sessions` as the primary workspace and demotes supporting objects behind workspace navigation
- session admin is now framed as a readiness checklist with explicit launch actions
- guided access states now replace some redirect-only failures on protected pages
- session-level breadcrumbs and workspace navigation now connect setup, live board, and analysis
- platform-admin viewer preview is available at `/session/[sessionId]?preview=viewer`
- analysis now supports uploaded admin CSV sources plus local env CSV fallback
- user-facing role copy now prefers `Operator` over `Admin` for session members
- purchase route now returns a clean message when price is `<= 0`
- operator local form state no longer resets while polling/realtime refresh is active
- live dashboard now refreshes when session syndicates change
- runtime config errors no longer masquerade as missing-session 404s
- production deployments are guarded from running on local storage
- session creation is no longer exposed on the public landing page
- session users authenticate by assigned email plus shared code

## Known Gaps

- no undo/correction workflow for mistaken purchases
- no final `actual pot locked` workflow after all teams are sold
- recommendation math still uses a simplified bankroll/headroom assumption
- no full audit trail UI in admin center
- no session archive/delete flow
- session creation still allows rooms to be created from whatever syndicates are selected at creation time; updating the catalog does not retroactively change existing sessions
- some protected page guidance is now rendered in-page; API auth failures are still response-based and not fully standardized
- lint still uses deprecated `next lint`

## Manual Regression Checklist

Use this after changing auth, admin center, live controls, or payout/simulation behavior:

1. Log in as platform admin at `/`.
2. Confirm the role-choice landing explains control-plane vs live-room entry.
3. Confirm redirect to `/admin`.
4. Create a session or open an existing one.
5. On session readiness, save access, rotate the room code, save room economics, and import projections.
6. Confirm setup, live board, and analysis are connected by session workspace navigation.
7. Log in as a session user with assigned email plus shared code.
8. Confirm the live board loads with the right role.
9. Change `Active Team for Bidding` and confirm the board updates immediately.
10. Change current bid and confirm it persists.
11. Record a purchase with a valid bid.
12. Try recording a purchase with `0` and confirm the friendly validation error.
13. Open viewer preview and confirm it matches the session shell in read-only mode.
14. Open analysis and confirm CSV source selection works.
15. Refresh and confirm persistence.

## Operational Notes

- local development can still use `CALCUTTA_STORAGE_BACKEND=local`, but do not treat that path as deployable
- if dev runtime gets strange after large route/component changes, clear `.next` and restart
- old stored sessions may still contain legacy payout keys; the repository normalizes them
- the clearest visible signal that configuration is correct is the session badge reading `Backend supabase`
- the winner picker on the live board is driven by the session's participating syndicates, not the global syndicate catalog
- the dev server can get into a bad state if build artifacts and dev artifacts overlap; clearing `.next` and restarting resolves it

## Backlog References

Azure DevOps items already created:

- Feature `81767`: Supabase persistence and realtime
- Feature `81768`: Projection ingestion and bid intelligence
- User Stories `81769` to `81774`
