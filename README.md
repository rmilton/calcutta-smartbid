# Calcutta SmartBid

Calcutta SmartBid is a live NCAA Calcutta auction cockpit built with Next.js. The current implementation ships with:

- a setup flow for creating an auction workspace
- a live operator cockpit and synchronized viewer mode
- Monte Carlo tournament simulation and bid recommendations
- a ledger for syndicate ownership, spend, and remaining bankroll
- manual projection overrides with automatic simulation rebuilds
- a local file-backed repository for immediate use, plus a Supabase-backed repository path with realtime schema and transactional purchase RPC support

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Local storage

By default the app persists auction data to a JSON file under the OS temp directory. You can override that path with `CALCUTTA_STORE_FILE`.

## Storage backends

- `CALCUTTA_STORAGE_BACKEND=local`: default local JSON persistence
- `CALCUTTA_STORAGE_BACKEND=supabase`: use Supabase/Postgres for sessions, purchases, projections, overrides, and simulation snapshots

When using the Supabase backend, configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

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
