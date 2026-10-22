-- ============================================================================
-- Gutsy Karts 3D — Build-Tagged & Rolling Telemetry Schema for Supabase
-- ============================================================================
-- Run this script once in your Supabase SQL Editor (https://supabase.com/dashboard)
-- to enable persistent cloud storage for:
--   1. WEBSITE_UX      (gutsy_analytics_sessions — 1 upserted row per visitor session)
--   2. HUMAN_GAMEPLAY  (gutsy_analytics_races    — human player race & balance metrics)
--   3. AI_SIM_LAB      (gutsy_analytics_ai_lab   — 1 upserted row per machine & build pass)
-- ============================================================================

-- 1. Website UX & Feature Engagement Sessions (Upserted in-place per session)
create table if not exists public.gutsy_analytics_sessions (
  session_id text primary key,
  peer_id text not null,
  player_name text not null default 'GutsyRacer',
  build_pass text not null,
  build_sha text not null,
  device_type text not null default 'desktop',
  viewport text not null default '',
  referrer text not null default 'direct',
  is_ai_sim_machine boolean not null default false,
  lobby_select_sec integer not null default 0,
  racing_active_sec integer not null default 0,
  spectating_sec integer not null default 0,
  circuit_studio_sec integer not null default 0,
  ai_lab_open_sec integer not null default 0,
  races_started integer not null default 0,
  races_completed integer not null default 0,
  races_abandoned integer not null default 0,
  circuit_studio_opens integer not null default 0,
  custom_tracks_saved integer not null default 0,
  custom_tracks_exported integer not null default 0,
  online_rooms_hosted integer not null default 0,
  online_rooms_joined integer not null default 0,
  mid_race_takeovers integer not null default 0,
  balance_guide_views integer not null default 0,
  favorite_character_id text,
  favorite_track_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gutsy_sessions_build_pass
  on public.gutsy_analytics_sessions (build_pass, updated_at desc);

-- 2. Human Gameplay Balance Telemetry (Logged only for real human-driven races)
create table if not exists public.gutsy_analytics_races (
  race_id text primary key,
  session_id text not null,
  peer_id text not null,
  player_name text not null default 'GutsyRacer',
  build_pass text not null,
  build_sha text not null,
  mode text not null default 'single_cup',
  status text not null default 'completed',
  cup_id text not null,
  track_id text not null,
  track_name text not null,
  character_id text not null,
  kart_id text not null,
  ai_difficulty text not null default 'MEDIUM',
  placement integer,
  human_count integer not null default 1,
  finish_time_ms integer,
  lap1_ms integer,
  best_flying_lap_ms integer,
  avg_speed numeric(6,2),
  top_speed_ratio_pct numeric(5,1),
  on_track_pct numeric(5,1),
  off_road_pct numeric(5,1),
  mini_turbos_fired integer not null default 0,
  tier1_count integer not null default 0,
  tier2_count integer not null default 0,
  tier3_count integer not null default 0,
  shoves_given integer not null default 0,
  hits_taken integer not null default 0,
  items_used integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_gutsy_races_build_pass
  on public.gutsy_analytics_races (build_pass, created_at desc);

-- 3. AI Self-Training Lab Rolling Snapshot (1 upserted row per build_pass + peer_id)
create table if not exists public.gutsy_analytics_ai_lab (
  build_pass text not null,
  peer_id text not null,
  build_sha text not null,
  machine_label text not null default 'SimNode',
  generation integer not null default 1,
  episodes_completed integer not null default 0,
  items_enabled boolean not null default true,
  training_track_mode text not null default 'ROTATE_CUP',
  auto_balance_enabled boolean not null default false,
  champion_fitness numeric(6,2) not null default 0,
  champion_best_lap_ms integer,
  character_balance jsonb not null default '[]'::jsonb,
  champion_weights jsonb not null default '{}'::jsonb,
  report_markdown text not null default '',
  updated_at timestamptz not null default now(),
  primary key (build_pass, peer_id)
);

create index if not exists idx_gutsy_ai_lab_build_pass
  on public.gutsy_analytics_ai_lab (build_pass, updated_at desc);

-- ============================================================================
-- Row-Level Security (RLS) Policies for Public Game Telemetry & Build Pruning
-- ============================================================================
alter table public.gutsy_analytics_sessions enable row level security;
alter table public.gutsy_analytics_races enable row level security;
alter table public.gutsy_analytics_ai_lab enable row level security;

drop policy if exists "gutsy_sessions_public_access" on public.gutsy_analytics_sessions;
create policy "gutsy_sessions_public_access"
  on public.gutsy_analytics_sessions
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "gutsy_races_public_access" on public.gutsy_analytics_races;
create policy "gutsy_races_public_access"
  on public.gutsy_analytics_races
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "gutsy_ai_lab_public_access" on public.gutsy_analytics_ai_lab;
create policy "gutsy_ai_lab_public_access"
  on public.gutsy_analytics_ai_lab
  for all
  to anon, authenticated
  using (true)
  with check (true);
