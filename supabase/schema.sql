create table if not exists public.auction_sessions (
  id text primary key,
  name text not null,
  focus_syndicate_id text not null,
  operator_passcode text not null,
  viewer_passcode text not null,
  payout_rules jsonb not null,
  projection_provider text not null,
  final_four_pairings jsonb not null,
  live_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auction_sessions
  add column if not exists shared_code_hash text;

alter table public.auction_sessions
  add column if not exists shared_code_lookup text;

create unique index if not exists auction_sessions_shared_code_lookup_idx
  on public.auction_sessions(shared_code_lookup);

create table if not exists public.session_members (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists session_members_session_email_idx
  on public.session_members(session_id, email);

create table if not exists public.syndicates (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  name text not null,
  color text not null,
  spend numeric not null default 0,
  remaining_bankroll numeric not null default 0,
  owned_team_ids jsonb not null default '[]'::jsonb,
  portfolio_expected_value numeric not null default 0
);

create table if not exists public.team_projections (
  id text not null,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  name text not null,
  short_name text not null,
  region text not null,
  seed integer not null,
  rating numeric not null,
  offense numeric not null,
  defense numeric not null,
  tempo numeric not null,
  source text not null,
  primary key (session_id, id)
);

create table if not exists public.projection_overrides (
  session_id text not null references public.auction_sessions(id) on delete cascade,
  team_id text not null,
  rating numeric null,
  offense numeric null,
  defense numeric null,
  tempo numeric null,
  updated_at timestamptz not null default now(),
  primary key (session_id, team_id)
);

create table if not exists public.simulation_snapshots (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  provider text not null,
  iterations integer not null,
  generated_at timestamptz not null,
  payload jsonb not null
);

create table if not exists public.purchase_records (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  team_id text not null,
  buyer_syndicate_id text not null,
  price numeric not null,
  created_at timestamptz not null default now()
);

create or replace function public.record_purchase_transaction(
  p_session_id text,
  p_purchase_id text,
  p_team_id text,
  p_buyer_syndicate_id text,
  p_price numeric,
  p_created_at timestamptz,
  p_live_state jsonb,
  p_updated_at timestamptz,
  p_syndicates jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  if exists (
    select 1
    from public.purchase_records
    where session_id = p_session_id
      and team_id = p_team_id
  ) then
    raise exception 'That team has already been sold.';
  end if;

  insert into public.purchase_records (
    id,
    session_id,
    team_id,
    buyer_syndicate_id,
    price,
    created_at
  )
  values (
    p_purchase_id,
    p_session_id,
    p_team_id,
    p_buyer_syndicate_id,
    p_price,
    p_created_at
  );

  update public.auction_sessions
  set live_state = p_live_state,
      updated_at = p_updated_at
  where id = p_session_id;

  update public.syndicates as target
  set spend = source.spend,
      remaining_bankroll = source.remaining_bankroll,
      owned_team_ids = source.owned_team_ids,
      portfolio_expected_value = source.portfolio_expected_value
  from jsonb_to_recordset(p_syndicates) as source(
    id text,
    spend numeric,
    remaining_bankroll numeric,
    owned_team_ids jsonb,
    portfolio_expected_value numeric
  )
  where target.session_id = p_session_id
    and target.id = source.id;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'auction_sessions'
  ) then
    alter publication supabase_realtime add table public.auction_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_records'
  ) then
    alter publication supabase_realtime add table public.purchase_records;
  end if;
end
$$;
