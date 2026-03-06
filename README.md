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
      "tempo": 69.1
    }
  ]
}
```

## Supabase

The app includes:

- browser/server Supabase helpers
- realtime subscription hooks
- a starter schema at `supabase/schema.sql`
- `record_purchase_transaction` for transactional purchase writes
- a projection override table for session-scoped manual model corrections

The local repository remains the default execution path so the app works immediately without provisioning infrastructure.
