# Calcutta SmartBid

Calcutta SmartBid is a live NCAA Calcutta auction decision system built for Mothership. It is optimized for one operator making fast bid decisions during a live room, with synchronized viewer access for trusted teammates and a separate admin control plane.

The current implementation ships with:

- a login-only landing page that routes by `email + shared code`
- an admin center for sessions, users, syndicates, and data sources
- a session-admin surface for access, payout rules, syndicates, session-managed imports, and room readiness
- a live operator board with real-time bid support and last-purchase undo
- in-room `Analysis`, `Bracket`, and `Overrides` workspaces around the live auction view
- a consolidated `Auction` workspace that now includes live decisioning, syndicate context, and Mothership position in one surface
- a synchronized viewer mode with a read-only shared Mothership board plus bracket access
- Monte Carlo tournament simulation and Mothership-centered bid recommendations
- a ledger for Mothership and opponent syndicate ownership, spend, and modeled remaining bankroll
- a session-managed bracket import plus a separate session-managed analysis import
- grouped auction-team support for unresolved play-ins and regional `13-16` packages
- a local file-backed repository for immediate use, plus a Supabase-backed repository path with realtime schema and transactional purchase RPC support

Additional project context lives in:

- [AGENTS.md](/Users/rmilton/Code/Calcutta-SmartBid/AGENTS.md): engineering workflow, architecture map, invariants, safe parallel work
- [DESIGN.md](/Users/rmilton/Code/Calcutta-SmartBid/DESIGN.md): visual system, layout rules, and shared UI direction
- [HEARTBEAT.md](/Users/rmilton/Code/Calcutta-SmartBid/HEARTBEAT.md): current deployment status, recent fixes, regression checklist
- [SOUL.md](/Users/rmilton/Code/Calcutta-SmartBid/SOUL.md): product intent and design principles

## Live-room code map

- [`src/components/dashboard-shell.tsx`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/components/dashboard-shell.tsx): shell that composes the session header, workspace routing, shared recommendation payload, and the `Analysis` / `Overrides` workspaces, including the compact analysis hero with team context, round-probability ladder, note/classification controls, and the ranking table
- [`src/components/dashboard-shell/use-live-room-controller.ts`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/components/dashboard-shell/use-live-room-controller.ts): local live-room controller for bid state, purchases, bracket saves, notes, overrides, and keyboard shortcuts
- [`src/components/dashboard-shell/operator-auction-workspace.tsx`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/components/dashboard-shell/operator-auction-workspace.tsx): operator-only `Auction` workspace
- [`src/components/dashboard-shell/viewer-auction-workspace.tsx`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/components/dashboard-shell/viewer-auction-workspace.tsx): viewer-only `Auction` workspace
- [`src/components/dashboard-shell/shared.tsx`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/components/dashboard-shell/shared.tsx): shared live-room display primitives and asset-formatting helpers
- [`src/lib/live-room.ts`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/lib/live-room.ts): pure live-room selectors and matchup helpers, with tests in [`src/lib/live-room.test.ts`](/Users/llewis/Code/side-projects/calcutta-smartbid/src/lib/live-room.test.ts)

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

For production-like local work, prefer `.env.local` with:

```bash
CALCUTTA_STORAGE_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PLATFORM_ADMIN_EMAILS=...
PLATFORM_ADMIN_NAMES=...
PLATFORM_ADMIN_SHARED_CODE=...
AUTH_SESSION_SECRET=...
MOTHERSHIP_SYNDICATE_NAME=Mothership
```

### Selection Sunday local quickstart

Use this when you want a real bracket plus separate team-metrics data to drive the live room.

1. Set `.env.local`:
   - `CALCUTTA_STORAGE_BACKEND=local` for quick local persistence, or `supabase` for production-like persistence
2. If using `supabase`, run `supabase/schema.sql` in the Supabase SQL editor before starting the app.
3. Start the dev server:
   - `npm run dev`
4. Create a session:
   - Go to `http://localhost:3000/admin/sessions/new`
   - Include `Mothership` in the tracked room participants
5. Open the session admin page and use the `Data` tab:
   - import a bracket CSV
   - import a separate analysis CSV
   - confirm the readiness panel is green before opening the room
6. Open the live room and use `Auction` or `Analysis`.

The maintained Selection Sunday workflow is now:

- bracket structure imported separately from team analysis
- auction-team shape derived from the bracket
- live room recommendations built from merged bracket + analysis data

Legacy compatibility note:

- `http://localhost:3000/csv-analysis?sessionId=<your-session-id>` now redirects to the in-room `Analysis` workspace.

Optional for local development only (skip login flow):

- `DEV_BYPASS_AUTH=true`
- `DEV_BYPASS_SESSION_ID=<your-session-id>`

If you use bypass mode, restart `npm run dev` after updating `.env.local`.

### Local team logos

Team logos are stored locally and rendered from the checked-in manifest under:

- `public/team-logos/prototype/manifest.json`
- `public/team-logos/prototype/*`

The current checked-in set covers the official 2026 men's tournament field announced on March 15, 2026, which is `68` teams once the First Four are included.

To refresh the logo set for a new field:

```bash
npm run logos:prototype
```

That script reads [scripts/team-logo-prototype-input.json](/Users/llewis/Code/side-projects/calcutta-smartbid/scripts/team-logo-prototype-input.json), downloads logos into `public/team-logos/prototype/`, and rewrites the manifest. The runtime logo lookup is manifest-backed, so new file extensions and NCAA fallback SVGs are picked up automatically without app code changes.

The logo smoke check is now covered by [src/lib/team-logos.test.ts](/Users/llewis/Code/side-projects/calcutta-smartbid/src/lib/team-logos.test.ts), which verifies that every requested team resolves to a local file on disk.

## Product surfaces

- `Landing/login`
  - public entrypoint
  - accepts assigned email plus shared code
  - routes platform admins to `/admin`
  - routes session members to `/session/[sessionId]`
- `Admin center`
  - platform-level setup and operations
  - manages users, tracked syndicates, data sources, and sessions
- `Session admin`
  - per-session access, shared code, payout structure, tracked syndicates, analysis settings, bracket/analysis imports, readiness, and lifecycle controls
- `Live room`
  - shared persisted Mothership session state for operator and viewer
  - operator can update active team, bid, purchases, bracket winners, and undo the most recent purchase
  - operator workspaces are `Auction`, `Analysis`, `Bracket`, and `Overrides`
  - `Auction` now carries the old portfolio context directly in the live board through syndicate, ownership, and decision-context panels
  - viewer workspaces are `Auction` and `Bracket`
  - viewer `Auction` mirrors the operator decision-board language for the live call, rationale, ownership conflicts, recent sales, and ownership ledger, while staying read-only
  - active team can represent:
    - a single school
    - an unresolved play-in team
    - a regional `13-16` package
  - viewer is read-only

## Access model

The landing page is login-only. It accepts an email address and shared code, then routes the user based on what those credentials match:

- `platform admin` credentials route to the admin center
- `session member` credentials route into their auction room as either `operator` or `viewer`

Role is determined by the authenticated member record for that session, not by a landing-page toggle.

Platform admin credentials are configured with:

- `PLATFORM_ADMIN_EMAILS`: comma-separated email list
- `PLATFORM_ADMIN_NAMES`: optional comma-separated display names aligned by position
- `PLATFORM_ADMIN_SHARED_CODE`: shared code used to unlock session creation

## Local storage

By default the app persists auction data to a JSON file under the OS temp directory. You can override that path with `CALCUTTA_STORE_FILE`.

This path is intended for local development only. Production should not use the local repository.

## Storage backends

- `CALCUTTA_STORAGE_BACKEND=local`: default local JSON persistence
- `CALCUTTA_STORAGE_BACKEND=supabase`: use Supabase/Postgres for sessions, purchases, projections, overrides, and simulation snapshots

When using the Supabase backend, configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

For local development only, you can bypass manual login by enabling:

- `DEV_BYPASS_AUTH=true`
- `DEV_BYPASS_SESSION_ID=<session-id>`

When enabled (and not in production), session-authenticated pages/APIs use an active
member from the configured session automatically.

The app now fails fast when:

- `CALCUTTA_STORAGE_BACKEND` is set to an invalid value
- `CALCUTTA_STORAGE_BACKEND=supabase` but required Supabase env vars are missing
- a Vercel deployment tries to run with the local file-backed repository

For a Vercel deployment, production should always use:

```bash
CALCUTTA_STORAGE_BACKEND=supabase
```

## Session-managed imports

Selection Sunday sessions can now be driven by separate bracket and analysis CSV imports.

- `Bracket import` expects bracket structure fields such as `name`, `region`, and `seed`
- `Analysis import` expects model fields such as `name`, `rating`, `offense`, `defense`, and `tempo`
- room readiness is blocked until the imported bracket and analysis data can be merged into one session field
- the legacy active data source remains available as a fallback combined import flow

The live `Bracket` workspace requires a complete 64-team field. When the session does not have a bracket-ready field, the workspace stays visible but explains why it is unavailable.

## State model notes

- completed purchases are the authoritative auction record unless superseded by an explicit correction workflow
- current bid and active nominated team are live operational state
- the live room still talks about `teams` in the UI, but the internal auction model can represent:
  - a single team
  - an unresolved play-in slot
  - a grouped `13-16` seed package
- `projectedPot` is a provisional model input used for EV and bankroll forecasting
- current `remainingBankroll` / headroom values are still modeled assumptions, not final room accounting
- every live room is evaluated from the configured `MOTHERSHIP_SYNDICATE_NAME` perspective
- selected syndicates in a session represent Mothership plus tracked room opponents
- Mothership-owned purchases are the source of truth for owned-team position state in live analysis
- `Auction` and `Analysis` read from the same session-native recommendation payload
- `Analysis` remains team-level for scouting depth, but now surfaces grouped auction-team context when a team belongs to a package
- the in-room `Analysis` view now leads with a compact selected-team hero that keeps rank, bid guidance, round reach probabilities, classification, note, and scouting signals above the ranking table
- `Bracket` reflects the same session truth as the live room, including purchased-team ownership markers
- only the most recent purchase can be undone in the current correction flow
- session analysis settings are:
  - `targetTeamCount` default `8`
  - `maxSingleTeamPct` default `22`
- viewer state should always reflect the same persisted session truth as operator state
- viewer mode stays read-only but shows the same live current bid, decision call, and Mothership context as the operator board
- archived sessions are hidden from the default admin sessions list but remain readable to platform admins
- permanent delete is archive-gated and requires exact session-name confirmation

## Selection Sunday imports

The primary product path is no longer “import one projection source and go.” Session admin now supports two separate imports:

- `Bracket import`
  - stores bracket structure for the session
  - supports region, seed, bracket slot, site metadata, and unresolved play-ins
- `Analysis import`
  - stores team strength and scouting metrics separately from bracket structure
  - joins against the bracket to create the live tournament field

The session readiness panel blocks the room from being considered ready until bracket, analysis, and simulation state line up cleanly.

### Bracket CSV

Required columns:

- `name`
- `region`
- `seed`

Recommended columns:

- `id`
- `shortName`
- `regionSlot`

Optional columns:

- `site`
- `subregion`
- `isPlayIn`
- `playInGroup`
- `playInSeed`

Recommended header:

```csv
id,name,shortName,region,seed,regionSlot,site,subregion,isPlayIn,playInGroup,playInSeed
```

Play-ins should be represented as two rows sharing the same `region`, `seed`, `regionSlot`, and `playInGroup`.

### Analysis CSV

Required columns:

- `name`
- `rating`
- `offense`
- `defense`
- `tempo`

Optional columns:

- `teamId`
- `shortName`
- `NET Rank`
- `KenPom Rank`
- `Ranked Wins`
- `3PT%`
- `Q1 Wins`
- `Q2 Wins`
- `Q3 Wins`
- `Q4 Wins`

The analysis importer also recognizes NCAA-style power-rating headers such as `Power Rating - Chance of Beating Average D1 Team`.

### Auction-team behavior

The live room can now derive grouped auction teams from the imported bracket:

- unresolved `11` and `12` play-ins become one auction team
- unresolved `16` play-ins fold into the regional `13-16` package
- each region’s `13-16` seeds are sold as one auction team

Recommendations, owned-position state, and sold-team displays all resolve back to the underlying teams while preserving the grouped auction behavior.

## Projection providers

- `mock`: loads the included sample tournament field
- `remote`: fetches JSON from `SPORTS_PROJECTIONS_URL`

### CSV-backed remote feed (local)

If your source data is CSV, the app now includes a local bridge endpoint at
`/api/projections/csv` that converts the CSV into the same `remote` JSON shape.

Set these env vars:

- `SPORTS_PROJECTIONS_URL=http://localhost:3000/api/projections/csv`
- `SPORTS_PROJECTIONS_CSV_FILE=/absolute/path/to/your.csv`
- `SPORTS_PROJECTIONS_CSV_PROVIDER=csv-local` (optional label)

The CSV import pipeline:

- reads the top 64 valid teams by power rating
- auto-assigns them into four 16-team regions (`South`, `West`, `East`, `Midwest`)
- auto-seeds each region from 1 to 16
- maps scouting fields where available (`netRank`, `kenpomRank`, `rankedWins`, and inferred quadrant wins)

Use the existing **Import remote feed** button to load this dataset into a session.

### CSV analysis APIs

The standalone CSV-analysis page is now legacy compatibility only. The maintained product flow is:

- import bracket CSV into a session
- import analysis CSV into the same session
- open the session
- use the in-room `Analysis` tab

The CSV helper APIs still exist for ingestion and model-building support:

- feed bridge: `/api/projections/csv`
- team analysis: `/api/projections/csv/analysis`
- budget helper: `/api/projections/csv/budget?bankroll=10000&team=Arizona&targetTeams=8`

These endpoints are implementation support for the shared analysis engine, not a separate primary UI.

The remote endpoint should return:

```json
{
  "provider": "your-provider-name",
  "teams": [
    {
      "id": "duke",
      "name": "Duke",
      "shortName": "DUKE",
      "region": "East",
      "seed": 1,
      "rating": 95,
      "offense": 121.2,
      "defense": 92.7,
      "tempo": 69.1,
      "scouting": {
        "netRank": 6,
        "kenpomRank": 4,
        "threePointPct": 37.8,
        "rankedWins": 7,
        "quadWins": {
          "q1": 9,
          "q2": 5,
          "q3": 2,
          "q4": 1
        },
        "ats": {
          "wins": 19,
          "losses": 11,
          "pushes": 1
        },
        "offenseStyle": "Spacing-heavy half-court offense",
        "defenseStyle": "Switch pressure and strong closeouts"
      }
    }
  ]
}
```

`scouting` is optional. When present, the dashboard adds team-comparison intelligence for:
- Quad 1/2/3/4 wins
- ranked wins
- ATS record and ATS win rate
- 3PT%
- KenPom/NET rank
- offense and defense style notes

## Supabase

The app includes:

- browser/server Supabase helpers
- realtime subscription hooks
- a starter schema at `supabase/schema.sql`
- `record_purchase_transaction` for transactional purchase writes
- a projection override table for session-scoped manual model corrections
- session-level `bracket_import` and `analysis_import` fields on `auction_sessions`

The local repository remains the default execution path so the app works immediately without provisioning infrastructure.

## Vercel deployment checklist

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Set these environment variables locally and in Vercel:

```bash
CALCUTTA_STORAGE_BACKEND=supabase
PLATFORM_ADMIN_EMAILS=admin@example.com
PLATFORM_ADMIN_NAMES=Admin User
PLATFORM_ADMIN_SHARED_CODE=your-platform-admin-code
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-key
```

4. Start the app locally and verify the session header badge reads `Backend supabase`.
5. Create a session, record a purchase, and refresh the page to confirm persistence.
6. Deploy `main` to Vercel with the same environment variables.
