# Calcutta SmartBid

Calcutta SmartBid is a live NCAA Calcutta auction decision system built for Mothership. It is optimized for one operator making fast bid decisions during a live room, with synchronized viewer access for trusted teammates and a separate admin control plane.

The current implementation ships with:

- a login-only landing page that routes by `email + shared code`
- an admin center for sessions, users, syndicates, and data sources
- a session-admin surface for access, payout rules, syndicates, and imports
- a live operator board with real-time bid support
- a synchronized viewer mode with a read-only shared Mothership board
- Monte Carlo tournament simulation and Mothership-centered bid recommendations
- a ledger for Mothership and opponent syndicate ownership, spend, and modeled remaining bankroll
- a local file-backed repository for immediate use, plus a Supabase-backed repository path with realtime schema and transactional purchase RPC support

Additional project context lives in:

- [AGENTS.md](/Users/rmilton/Code/Calcutta-SmartBid/AGENTS.md): engineering workflow, architecture map, invariants, safe parallel work
- [DESIGN.md](/Users/rmilton/Code/Calcutta-SmartBid/DESIGN.md): visual system, layout rules, and shared UI direction
- [HEARTBEAT.md](/Users/rmilton/Code/Calcutta-SmartBid/HEARTBEAT.md): current deployment status, recent fixes, regression checklist
- [SOUL.md](/Users/rmilton/Code/Calcutta-SmartBid/SOUL.md): product intent and design principles

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

### CSV analysis local quickstart

Use this when you want to run the CSV analysis page directly.

1. Set `.env.local` values:
   - `SPORTS_PROJECTIONS_CSV_FILE=/absolute/path/to/your.csv`
   - `CALCUTTA_STORAGE_BACKEND=local` (or `supabase` if you want Supabase persistence)
2. If using `supabase`, run `supabase/schema.sql` in your Supabase SQL editor before starting the app.
3. Start dev server:
   - `npm run dev`
4. Create a session (needed for owned-team persistence):
   - Go to `http://localhost:3000/admin/sessions/new`
   - Create/save the session
   - Copy the session id (format like `session_xxxxxxxx`)
5. Open CSV analysis:
   - `http://localhost:3000/csv-analysis?sessionId=<your-session-id>`

Optional for local development only (skip login flow):

- `DEV_BYPASS_AUTH=true`
- `DEV_BYPASS_SESSION_ID=<your-session-id>`

If you use bypass mode, restart `npm run dev` after updating `.env.local`.

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
  - per-session access, shared code, payout structure, tracked syndicates, and imports
- `Live room`
  - shared persisted Mothership session state for operator and viewer
  - operator can update active team, bid, and purchases
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

## State model notes

- completed purchases are the authoritative auction record unless superseded by a deliberate correction workflow
- current bid and active nominated team are live operational state
- `projectedPot` is a provisional model input used for EV and bankroll forecasting
- current `remainingBankroll` / headroom values are still modeled assumptions, not final room accounting
- every live room is evaluated from the configured `MOTHERSHIP_SYNDICATE_NAME` perspective
- selected syndicates in a session represent Mothership plus tracked room opponents
- viewer state should always reflect the same persisted session truth as operator state

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

### CSV analysis mode (no bracket import required)

If you only want team analysis from the CSV (without region/seed bracket constraints), use:

- app page: `/csv-analysis`
- API: `/api/projections/csv/analysis`
- budget API: `/api/projections/csv/budget?bankroll=10000&team=Arizona&targetTeams=8`

This mode analyzes all valid teams found in the CSV and returns team intelligence rankings directly.
Budget recommendations in this mode default to `reservePct=0` (100% of bankroll is allocated).
Owned teams and actual paid prices are persisted server-side per authenticated session member via
`/api/sessions/:sessionId/csv-analysis/portfolio`.

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
