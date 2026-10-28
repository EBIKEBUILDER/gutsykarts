-- ============================================================================
-- GUTSY KARTS 3D — GLOBAL TRACK LEADERBOARDS & CLOUD RACER CAREER PROFILES
-- ============================================================================

-- 1. Extend gutsy_racer_profiles with persistent cloud career stats
ALTER TABLE public.gutsy_racer_profiles
  ADD COLUMN IF NOT EXISTS races_completed integer NOT NULL DEFAULT 0 CHECK (races_completed >= 0),
  ADD COLUMN IF NOT EXISTS first_place_wins integer NOT NULL DEFAULT 0 CHECK (first_place_wins >= 0),
  ADD COLUMN IF NOT EXISTS podium_finishes integer NOT NULL DEFAULT 0 CHECK (podium_finishes >= 0),
  ADD COLUMN IF NOT EXISTS cups_won jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favorite_character_id text NOT NULL DEFAULT 'aero_vance',
  ADD COLUMN IF NOT EXISTS favorite_kart_id text NOT NULL DEFAULT 'apex_striker',
  ADD COLUMN IF NOT EXISTS last_race_submitted_at timestamptz;

-- 2. Global Track Leaderboards Table (1 Best Record Row Per Racer Per Track + Official Benchmarks)
CREATE TABLE IF NOT EXISTS public.gutsy_track_leaderboards (
  entry_id text PRIMARY KEY CHECK (char_length(entry_id) BETWEEN 4 AND 160),
  track_id text NOT NULL CHECK (char_length(track_id) BETWEEN 2 AND 100),
  track_name text NOT NULL CHECK (char_length(track_name) BETWEEN 2 AND 80),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  callsign text NOT NULL CHECK (char_length(trim(callsign)) BETWEEN 2 AND 28),
  character_id text NOT NULL DEFAULT 'aero_vance',
  kart_id text NOT NULL DEFAULT 'apex_striker',
  best_race_ms integer NOT NULL CHECK (best_race_ms BETWEEN 25000 AND 900000),
  best_lap_ms integer NOT NULL CHECK (best_lap_ms BETWEEN 8000 AND 300000),
  is_official_benchmark boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gutsy_leaderboards_track_race
  ON public.gutsy_track_leaderboards (track_id, best_race_ms ASC);

CREATE INDEX IF NOT EXISTS idx_gutsy_leaderboards_track_lap
  ON public.gutsy_track_leaderboards (track_id, best_lap_ms ASC);

ALTER TABLE public.gutsy_track_leaderboards ENABLE ROW LEVEL SECURITY;

-- Anyone (guest or signed-in) can read global leaderboards
DROP POLICY IF EXISTS "allow_public_read_leaderboards" ON public.gutsy_track_leaderboards;
CREATE POLICY "allow_public_read_leaderboards"
  ON public.gutsy_track_leaderboards
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Direct table writes are blocked; all verified submissions go through submit_verified_race_result() RPC
-- which enforces auth.uid(), physics sanity bounds, and rate-limiting!

-- 3. Atomic Verified Race & Leaderboard Submission RPC
CREATE OR REPLACE FUNCTION public.submit_verified_race_result(
  p_track_id text,
  p_track_name text,
  p_character_id text,
  p_kart_id text,
  p_race_ms integer,
  p_lap_ms integer,
  p_rank integer,
  p_cup_won_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_callsign text;
  v_last_submit timestamptz;
  v_cups jsonb;
  v_entry_id text;
  v_old_race_ms integer;
  v_old_lap_ms integer;
  v_new_race_ms integer;
  v_new_lap_ms integer;
  v_is_new_race_pb boolean := false;
  v_is_new_lap_pb boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required: Please sign in to record verified leaderboard times.';
  END IF;

  -- Sanity bounds against impossible/glitched times
  IF p_race_ms < 25000 OR p_race_ms > 900000 OR p_lap_ms < 8000 OR p_lap_ms > 300000 THEN
    RAISE EXCEPTION 'Invalid race timing payload (outside physical track bounds).';
  END IF;

  -- Ensure profile row exists and check anti-spam cooldown (min 15s between race completions)
  SELECT callsign, last_race_submitted_at, cups_won
    INTO v_callsign, v_last_submit, v_cups
    FROM public.gutsy_racer_profiles
    WHERE user_id = v_uid;

  IF v_callsign IS NULL THEN
    v_callsign := 'GutsyRacer';
    v_cups := '[]'::jsonb;
    INSERT INTO public.gutsy_racer_profiles (user_id, callsign, cups_won)
    VALUES (v_uid, v_callsign, v_cups)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF v_last_submit IS NOT NULL AND v_last_submit > (now() - interval '15 seconds') THEN
    RAISE EXCEPTION 'Rate limit: Race result submitted too quickly.';
  END IF;

  -- Append cup trophy if won and not already recorded
  IF p_cup_won_id IS NOT NULL AND char_length(trim(p_cup_won_id)) > 0 THEN
    IF NOT (v_cups @> to_jsonb(p_cup_won_id)) THEN
      v_cups := v_cups || to_jsonb(p_cup_won_id);
    END IF;
  END IF;

  -- Update career profile stats
  UPDATE public.gutsy_racer_profiles
    SET races_completed = races_completed + 1,
        first_place_wins = first_place_wins + (CASE WHEN p_rank = 1 THEN 1 ELSE 0 END),
        podium_finishes = podium_finishes + (CASE WHEN p_rank <= 3 THEN 1 ELSE 0 END),
        cups_won = v_cups,
        favorite_character_id = COALESCE(NULLIF(trim(p_character_id), ''), favorite_character_id),
        favorite_kart_id = COALESCE(NULLIF(trim(p_kart_id), ''), favorite_kart_id),
        last_race_submitted_at = now(),
        updated_at = now()
    WHERE user_id = v_uid;

  -- Upsert personal best on gutsy_track_leaderboards
  v_entry_id := trim(p_track_id) || '::' || v_uid::text;

  SELECT best_race_ms, best_lap_ms
    INTO v_old_race_ms, v_old_lap_ms
    FROM public.gutsy_track_leaderboards
    WHERE entry_id = v_entry_id;

  IF v_old_race_ms IS NULL THEN
    v_is_new_race_pb := true;
    v_is_new_lap_pb := true;
    v_new_race_ms := p_race_ms;
    v_new_lap_ms := p_lap_ms;

    INSERT INTO public.gutsy_track_leaderboards (
      entry_id,
      track_id,
      track_name,
      user_id,
      callsign,
      character_id,
      kart_id,
      best_race_ms,
      best_lap_ms,
      is_official_benchmark,
      updated_at
    ) VALUES (
      v_entry_id,
      trim(p_track_id),
      trim(p_track_name),
      v_uid,
      v_callsign,
      p_character_id,
      p_kart_id,
      v_new_race_ms,
      v_new_lap_ms,
      false,
      now()
    );
  ELSE
    v_is_new_race_pb := p_race_ms < v_old_race_ms;
    v_is_new_lap_pb := p_lap_ms < v_old_lap_ms;
    v_new_race_ms := LEAST(v_old_race_ms, p_race_ms);
    v_new_lap_ms := LEAST(v_old_lap_ms, p_lap_ms);

    IF v_is_new_race_pb OR v_is_new_lap_pb THEN
      UPDATE public.gutsy_track_leaderboards
        SET callsign = v_callsign,
            track_name = trim(p_track_name),
            character_id = CASE WHEN v_is_new_race_pb THEN p_character_id ELSE character_id END,
            kart_id = CASE WHEN v_is_new_race_pb THEN p_kart_id ELSE kart_id END,
            best_race_ms = v_new_race_ms,
            best_lap_ms = v_new_lap_ms,
            updated_at = now()
        WHERE entry_id = v_entry_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_new_race_pb', v_is_new_race_pb,
    'is_new_lap_pb', v_is_new_lap_pb,
    'best_race_ms', v_new_race_ms,
    'best_lap_ms', v_new_lap_ms
  );
END;
$$;

-- 4. Seed Official Pro Benchmark Times across Built-In & Community Showcase Tracks
INSERT INTO public.gutsy_track_leaderboards (
  entry_id,
  track_id,
  track_name,
  user_id,
  callsign,
  character_id,
  kart_id,
  best_race_ms,
  best_lap_ms,
  is_official_benchmark
)
VALUES
  -- Gutsy Avenue Grand Circuit
  ('gutsy_avenue::bench_gold', 'gutsy_avenue', 'Gutsy Avenue Grand Circuit', NULL, 'Aero Vance (Pro Pace)', 'aero_vance', 'apex_striker', 94250, 30820, true),
  ('gutsy_avenue::bench_silver', 'gutsy_avenue', 'Gutsy Avenue Grand Circuit', NULL, 'Nyx Veloce (Pace)', 'nyx_drift', 'phantom_coupe', 98400, 32150, true),
  ('gutsy_avenue::bench_bronze', 'gutsy_avenue', 'Gutsy Avenue Grand Circuit', NULL, 'Rex Ironclad (Pace)', 'rex_ironclad', 'behemoth_bruiser', 103800, 33900, true),
  -- Maple Leaf Parkway
  ('maple_leaf_parkway::bench_gold', 'maple_leaf_parkway', 'Maple Leaf Parkway', NULL, 'Nyx Veloce (Pro Pace)', 'nyx_drift', 'phantom_coupe', 96100, 31420, true),
  ('maple_leaf_parkway::bench_silver', 'maple_leaf_parkway', 'Maple Leaf Parkway', NULL, 'Pip Spark (Pace)', 'pip_spark', 'bumblebee_buggy', 100500, 32880, true),
  -- Pinewood Switchback Park
  ('pinewood_switchback::bench_gold', 'pinewood_switchback', 'Pinewood Switchback Park', NULL, 'Pip Spark (Pro Pace)', 'pip_spark', 'bumblebee_buggy', 99850, 32540, true),
  ('pinewood_switchback::bench_silver', 'pinewood_switchback', 'Pinewood Switchback Park', NULL, 'Aero Vance (Pace)', 'aero_vance', 'apex_striker', 104200, 34100, true),
  -- Creekbed Canyon Run
  ('creekbed_canyon::bench_gold', 'creekbed_canyon', 'Creekbed Canyon Run', NULL, 'Rex Ironclad (Pro Pace)', 'rex_ironclad', 'behemoth_bruiser', 97400, 31800, true),
  -- Arcade Plaza Perimeter
  ('mall_perimeter::bench_gold', 'mall_perimeter', 'Arcade Plaza Perimeter', NULL, 'Aero Vance (Pro Pace)', 'aero_vance', 'culdesac_interceptor', 95600, 31150, true),
  -- Twin Peaks Ridgeway
  ('twin_peaks_ridge::bench_gold', 'twin_peaks_ridge', 'Twin Peaks Ridgeway', NULL, 'Nyx Veloce (Pro Pace)', 'nyx_drift', 'phantom_coupe', 101200, 33040, true),
  -- Foundry Switchback Yard
  ('industrial_hairpins::bench_gold', 'industrial_hairpins', 'Foundry Switchback Yard', NULL, 'Pip Spark (Pro Pace)', 'pip_spark', 'bumblebee_buggy', 102400, 33420, true),
  -- Skyline Overlook Speedway
  ('skyline_summit::bench_gold', 'skyline_summit', 'Skyline Overlook Speedway', NULL, 'Rex Ironclad (Pro Pace)', 'rex_ironclad', 'behemoth_bruiser', 98900, 32200, true),
  -- Gutsy Crown Finale Gauntlet
  ('championship_gauntlet::bench_gold', 'championship_gauntlet', 'Gutsy Crown Finale Gauntlet', NULL, 'Aero Vance (Pro Pace)', 'aero_vance', 'culdesac_interceptor', 106500, 34750, true),
  -- Community Showcase Tracks
  ('comm_seed_coral_lagoon_atoll::bench_gold', 'comm_seed_coral_lagoon_atoll', 'Coral Lagoon Atoll', NULL, 'Nyx Veloce (Pro Pace)', 'nyx_drift', 'phantom_coupe', 96800, 31640, true),
  ('comm_seed_coral_lagoon_atoll::bench_silver', 'comm_seed_coral_lagoon_atoll', 'Coral Lagoon Atoll', NULL, 'Aero Vance (Pace)', 'aero_vance', 'apex_striker', 101400, 33120, true),
  ('comm_seed_red_mesa_canyon::bench_gold', 'comm_seed_red_mesa_canyon', 'Red Mesa Canyon Run', NULL, 'Rex Ironclad (Pro Pace)', 'rex_ironclad', 'behemoth_bruiser', 98200, 32050, true),
  ('comm_seed_alpine_switchback::bench_gold', 'comm_seed_alpine_switchback', 'Timberline Twin Switchbacks', NULL, 'Pip Spark (Pro Pace)', 'pip_spark', 'bumblebee_buggy', 95900, 31280, true)
ON CONFLICT (entry_id) DO NOTHING;
