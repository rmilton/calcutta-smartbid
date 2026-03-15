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
  add column if not exists shared_code_plaintext text;

alter table public.auction_sessions
  add column if not exists shared_code_hash text;

alter table public.auction_sessions
  add column if not exists shared_code_lookup text;

alter table public.auction_sessions
  add column if not exists shared_code_ciphertext text;

alter table public.auction_sessions
  add column if not exists active_data_source_key text default 'builtin:mock';

alter table public.auction_sessions
  add column if not exists active_data_source_name text default 'Built-in Mock Field';

alter table public.auction_sessions
  add column if not exists active_data_source_kind text default 'builtin';

alter table public.auction_sessions
  add column if not exists analysis_settings jsonb default '{"targetTeamCount":8,"maxSingleTeamPct":22}'::jsonb;

alter table public.auction_sessions
  add column if not exists mothership_funding jsonb null;

alter table public.auction_sessions
  add column if not exists archived_at timestamptz null;

alter table public.auction_sessions
  add column if not exists archived_by_name text null;

alter table public.auction_sessions
  add column if not exists archived_by_email text null;

alter table public.auction_sessions
  add column if not exists bracket_state jsonb not null default '{}'::jsonb;

alter table public.auction_sessions
  add column if not exists bracket_import jsonb null;

alter table public.auction_sessions
  add column if not exists analysis_import jsonb null;

create unique index if not exists auction_sessions_shared_code_lookup_idx
  on public.auction_sessions(shared_code_lookup);

create unique index if not exists auction_sessions_shared_code_plaintext_idx
  on public.auction_sessions(shared_code_plaintext)
  where shared_code_plaintext is not null and shared_code_plaintext <> '';

create table if not exists public.platform_users (
  id text primary key,
  name text not null,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_users_email_idx
  on public.platform_users(email);

create table if not exists public.session_members (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  platform_user_id text null references public.platform_users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.session_members
  add column if not exists platform_user_id text null references public.platform_users(id) on delete cascade;

create unique index if not exists session_members_session_email_idx
  on public.session_members(session_id, email);

create unique index if not exists session_members_session_platform_user_idx
  on public.session_members(session_id, platform_user_id)
  where platform_user_id is not null;

create table if not exists public.syndicate_catalog (
  id text primary key,
  name text not null,
  color text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists syndicate_catalog_name_idx
  on public.syndicate_catalog(name);

create table if not exists public.syndicates (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  catalog_entry_id text null references public.syndicate_catalog(id) on delete set null,
  session_only boolean not null default false,
  name text not null,
  color text not null,
  spend numeric not null default 0,
  remaining_bankroll numeric not null default 0,
  owned_team_ids jsonb not null default '[]'::jsonb,
  portfolio_expected_value numeric not null default 0
);

alter table public.syndicates
  add column if not exists catalog_entry_id text null references public.syndicate_catalog(id) on delete set null;

alter table public.syndicates
  add column if not exists session_only boolean not null default false;

alter table public.syndicates
  add column if not exists estimated_budget numeric null;

alter table public.syndicates
  add column if not exists budget_confidence text null;

alter table public.syndicates
  add column if not exists budget_notes text null;

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
  net_rank integer null,
  kenpom_rank integer null,
  three_point_pct numeric null,
  ranked_wins integer null,
  quad1_wins integer null,
  quad2_wins integer null,
  quad3_wins integer null,
  quad4_wins integer null,
  ats_wins integer null,
  ats_losses integer null,
  ats_pushes integer null,
  offense_style text null,
  defense_style text null,
  source text not null,
  primary key (session_id, id)
);

alter table public.team_projections add column if not exists net_rank integer null;
alter table public.team_projections add column if not exists kenpom_rank integer null;
alter table public.team_projections add column if not exists three_point_pct numeric null;
alter table public.team_projections add column if not exists ranked_wins integer null;
alter table public.team_projections add column if not exists quad1_wins integer null;
alter table public.team_projections add column if not exists quad2_wins integer null;
alter table public.team_projections add column if not exists quad3_wins integer null;
alter table public.team_projections add column if not exists quad4_wins integer null;
alter table public.team_projections add column if not exists ats_wins integer null;
alter table public.team_projections add column if not exists ats_losses integer null;
alter table public.team_projections add column if not exists ats_pushes integer null;
alter table public.team_projections add column if not exists offense_style text null;
alter table public.team_projections add column if not exists defense_style text null;

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

create table if not exists public.team_classifications (
  session_id text not null references public.auction_sessions(id) on delete cascade,
  team_id text not null,
  classification text not null check (
    classification in ('must-have', 'love-at-right-price', 'caution', 'nuclear-disaster')
  ),
  updated_at timestamptz not null default now(),
  primary key (session_id, team_id)
);

create table if not exists public.team_notes (
  session_id text not null references public.auction_sessions(id) on delete cascade,
  team_id text not null,
  note text not null check (char_length(note) <= 80),
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

create table if not exists public.data_sources (
  id text primary key,
  name text not null,
  kind text not null,
  purpose text not null default 'analysis',
  active boolean not null default true,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_tested_at timestamptz null
);

alter table public.data_sources
  add column if not exists purpose text not null default 'analysis';

create table if not exists public.data_import_runs (
  id text primary key,
  session_id text not null references public.auction_sessions(id) on delete cascade,
  source_key text not null,
  source_name text not null,
  status text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.csv_analysis_portfolios (
  session_id text not null references public.auction_sessions(id) on delete cascade,
  member_id text not null references public.session_members(id) on delete cascade,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id)
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

create or replace function public.undo_purchase_transaction(
  p_session_id text,
  p_purchase_id text,
  p_live_state jsonb,
  p_updated_at timestamptz,
  p_syndicates jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1
    from public.purchase_records
    where session_id = p_session_id
      and id = p_purchase_id
  ) then
    raise exception 'Purchase not found.';
  end if;

  delete from public.purchase_records
  where session_id = p_session_id
    and id = p_purchase_id;

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
