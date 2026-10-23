-- ============================================================================
-- GUTSY KARTS 3D — COMMUNITY CIRCUIT SHARING, AUTH PROFILES & ANTI-SPAM SCHEMA
-- ============================================================================

-- 1. Authenticated Racer Profiles
CREATE TABLE IF NOT EXISTS public.gutsy_racer_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  callsign text NOT NULL CHECK (char_length(trim(callsign)) BETWEEN 2 AND 24),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gutsy_racer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_public_read_profiles" ON public.gutsy_racer_profiles;
CREATE POLICY "allow_public_read_profiles"
  ON public.gutsy_racer_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "allow_owner_insert_profile" ON public.gutsy_racer_profiles;
CREATE POLICY "allow_owner_insert_profile"
  ON public.gutsy_racer_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "allow_owner_update_profile" ON public.gutsy_racer_profiles;
CREATE POLICY "allow_owner_update_profile"
  ON public.gutsy_racer_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Community Tracks Catalog (Strictly Authenticated Publish + Size & Spline Validation)
CREATE TABLE IF NOT EXISTS public.gutsy_community_tracks (
  track_id text PRIMARY KEY CHECK (char_length(track_id) BETWEEN 4 AND 80),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_callsign text NOT NULL CHECK (char_length(trim(author_callsign)) BETWEEN 2 AND 28),
  track_name text NOT NULL CHECK (char_length(trim(track_name)) BETWEEN 3 AND 48),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 280),
  biome text NOT NULL DEFAULT 'ALPINE_SUBURBS' CHECK (biome IN ('ALPINE_SUBURBS', 'TROPICAL_ATOLL', 'SUNSET_CANYON')),
  track_json jsonb NOT NULL CHECK (
    octet_length(track_json::text) <= 65536
    AND jsonb_typeof(track_json->'controlPoints') = 'array'
    AND jsonb_array_length(track_json->'controlPoints') BETWEEN 4 AND 80
  ),
  upvotes_count integer NOT NULL DEFAULT 0 CHECK (upvotes_count >= 0),
  plays_count integer NOT NULL DEFAULT 0 CHECK (plays_count >= 0),
  is_official_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gutsy_community_tracks_biome
  ON public.gutsy_community_tracks (biome, upvotes_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gutsy_community_tracks_author
  ON public.gutsy_community_tracks (author_id, created_at DESC);

ALTER TABLE public.gutsy_community_tracks ENABLE ROW LEVEL SECURITY;

-- Anyone can browse & play published community tracks
DROP POLICY IF EXISTS "allow_public_read_community_tracks" ON public.gutsy_community_tracks;
CREATE POLICY "allow_public_read_community_tracks"
  ON public.gutsy_community_tracks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ONLY authenticated Supabase users can insert tracks, and author_id MUST match auth.uid()
DROP POLICY IF EXISTS "allow_authenticated_insert_own_track" ON public.gutsy_community_tracks;
CREATE POLICY "allow_authenticated_insert_own_track"
  ON public.gutsy_community_tracks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND is_official_seed = false
  );

-- ONLY the authenticated author can update their own track
DROP POLICY IF EXISTS "allow_authenticated_update_own_track" ON public.gutsy_community_tracks;
CREATE POLICY "allow_authenticated_update_own_track"
  ON public.gutsy_community_tracks
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND is_official_seed = false
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND is_official_seed = false
  );

-- ONLY the authenticated author can delete their own track
DROP POLICY IF EXISTS "allow_authenticated_delete_own_track" ON public.gutsy_community_tracks;
CREATE POLICY "allow_authenticated_delete_own_track"
  ON public.gutsy_community_tracks
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND is_official_seed = false
  );

-- 3. Database-Level Anti-Spam & Rate-Limit Trigger
CREATE OR REPLACE FUNCTION public.enforce_community_track_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_60s_count integer;
  recent_24h_count integer;
  total_user_count integer;
BEGIN
  -- Allow migration seeding when is_official_seed = true and no active user JWT
  IF NEW.is_official_seed = true AND auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication required: Please sign in to publish a community circuit.';
  END IF;

  -- Prevent client-side spoofing of upvotes or play counters
  IF TG_OP = 'INSERT' THEN
    NEW.upvotes_count := 0;
    NEW.plays_count := 0;
    NEW.created_at := now();
    NEW.updated_at := now();

    -- Anti-spam Rule 1: Cooldown of 60 seconds between new track submissions per user
    SELECT count(*) INTO recent_60s_count
      FROM public.gutsy_community_tracks
      WHERE author_id = auth.uid()
        AND created_at > (now() - interval '60 seconds');

    IF recent_60s_count >= 1 THEN
      RAISE EXCEPTION 'Anti-spam cooldown: Please wait 60 seconds before publishing another new circuit.';
    END IF;

    -- Anti-spam Rule 2: Max 10 new tracks per 24 hours per user
    SELECT count(*) INTO recent_24h_count
      FROM public.gutsy_community_tracks
      WHERE author_id = auth.uid()
        AND created_at > (now() - interval '24 hours');

    IF recent_24h_count >= 10 THEN
      RAISE EXCEPTION 'Daily publish limit reached (max 10 community circuits per 24 hours).';
    END IF;

    -- Anti-spam Rule 3: Max 50 total tracks per user
    SELECT count(*) INTO total_user_count
      FROM public.gutsy_community_tracks
      WHERE author_id = auth.uid();

    IF total_user_count >= 50 THEN
      RAISE EXCEPTION 'Account track limit reached (max 50 published circuits per account).';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.upvotes_count := OLD.upvotes_count;
    NEW.plays_count := OLD.plays_count;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_community_track_rate_limit ON public.gutsy_community_tracks;
CREATE TRIGGER trg_enforce_community_track_rate_limit
  BEFORE INSERT OR UPDATE ON public.gutsy_community_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_community_track_rate_limit();

-- 4. Deduplicated Authenticated Upvotes Table (1 Vote Per Authenticated User Per Track)
CREATE TABLE IF NOT EXISTS public.gutsy_community_track_upvotes (
  track_id text NOT NULL REFERENCES public.gutsy_community_tracks(track_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, user_id)
);

ALTER TABLE public.gutsy_community_track_upvotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_public_read_upvotes" ON public.gutsy_community_track_upvotes;
CREATE POLICY "allow_public_read_upvotes"
  ON public.gutsy_community_track_upvotes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "allow_authenticated_insert_upvote" ON public.gutsy_community_track_upvotes;
CREATE POLICY "allow_authenticated_insert_upvote"
  ON public.gutsy_community_track_upvotes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "allow_authenticated_delete_upvote" ON public.gutsy_community_track_upvotes;
CREATE POLICY "allow_authenticated_delete_upvote"
  ON public.gutsy_community_track_upvotes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Atomic Upvote Toggle RPC (Requires Authenticated User)
CREATE OR REPLACE FUNCTION public.toggle_community_track_upvote(p_track_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_exists boolean;
  v_new_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required: Please sign in to upvote community tracks.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.gutsy_community_track_upvotes
    WHERE track_id = p_track_id AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.gutsy_community_track_upvotes
    WHERE track_id = p_track_id AND user_id = v_uid;
  ELSE
    INSERT INTO public.gutsy_community_track_upvotes (track_id, user_id)
    VALUES (p_track_id, v_uid);
  END IF;

  SELECT count(*) INTO v_new_count
    FROM public.gutsy_community_track_upvotes
    WHERE track_id = p_track_id;

  UPDATE public.gutsy_community_tracks
    SET upvotes_count = v_new_count
    WHERE track_id = p_track_id;

  RETURN jsonb_build_object(
    'upvoted', NOT v_exists,
    'upvotes_count', v_new_count
  );
END;
$$;

-- 6. Safe Play Counter Increment RPC
CREATE OR REPLACE FUNCTION public.increment_community_track_plays(p_track_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plays integer;
BEGIN
  UPDATE public.gutsy_community_tracks
    SET plays_count = plays_count + 1
    WHERE track_id = p_track_id
    RETURNING plays_count INTO v_plays;

  RETURN COALESCE(v_plays, 0);
END;
$$;

-- 7. Seed 3 Official Community Showcase Circuits (Tropical Atoll, Sunset Canyon, Alpine Suburbs)
INSERT INTO public.gutsy_community_tracks (
  track_id,
  author_id,
  author_callsign,
  track_name,
  description,
  biome,
  is_official_seed,
  upvotes_count,
  plays_count,
  track_json
)
VALUES
(
  'comm_seed_coral_lagoon_atoll',
  NULL,
  'Gutsy Studio Crew',
  'Coral Lagoon Atoll',
  'Sun-drenched tropical island circuit surrounded by ocean waves, palm cabanas, and two shallow turquoise lagoon crossings where Nitro boosts skip across the water!',
  'TROPICAL_ATOLL',
  true,
  14,
  48,
  '{
    "id": "comm_seed_coral_lagoon_atoll",
    "name": "Coral Lagoon Atoll",
    "description": "Sun-drenched tropical island circuit surrounded by ocean waves, palm cabanas, and two shallow turquoise lagoon crossings where Nitro boosts skip across the water!",
    "biome": "TROPICAL_ATOLL",
    "roadHalfWidth": 9.5,
    "autoTracksideScenery": true,
    "sceneryDensity": 1.15,
    "scenerySeed": 402,
    "terrainHillScale": 0.45,
    "authorName": "Gutsy Studio Crew",
    "controlPoints": [
      { "x": 0, "y": 0, "z": -135, "widthScale": 1.05 },
      { "x": 95, "y": 0, "z": -120, "widthScale": 1.1 },
      { "x": 155, "y": 1.2, "z": -45, "widthScale": 1.15 },
      { "x": 140, "y": 0, "z": 55, "widthScale": 1.1 },
      { "x": 65, "y": 0, "z": 135, "widthScale": 1.2 },
      { "x": -45, "y": 0, "z": 145, "widthScale": 1.15 },
      { "x": -135, "y": 1.8, "z": 80, "widthScale": 1.05 },
      { "x": -155, "y": 0, "z": -20, "widthScale": 1.1 },
      { "x": -95, "y": 0, "z": -115, "widthScale": 1.05 }
    ],
    "boostPads": [
      { "id": "bp_coral_1", "normT": 0.14, "lateral": 0 },
      { "id": "bp_coral_2", "normT": 0.38, "lateral": -3.2 },
      { "id": "bp_coral_3", "normT": 0.62, "lateral": 2.5 },
      { "id": "bp_coral_4", "normT": 0.86, "lateral": 0 }
    ],
    "itemBoxRows": [
      { "id": "ib_coral_1", "normT": 0.22 },
      { "id": "ib_coral_2", "normT": 0.52 },
      { "id": "ib_coral_3", "normT": 0.78 }
    ],
    "obstacles": [
      { "id": "ob_coral_1", "type": "JUMP_RAMP", "x": 146, "z": 5, "rotationY": 0.15, "scale": 1.15 },
      { "id": "ob_coral_2", "type": "WATER_PUDDLE", "x": 10, "z": 140, "rotationY": 0, "scale": 1.3 }
    ],
    "sceneryProps": [],
    "trackMasks": [
      { "id": "tm_coral_lagoon_1", "type": "SHALLOW_WATER", "normT": 0.36, "lateral": 1.5, "width": 16, "length": 34 },
      { "id": "tm_coral_lagoon_2", "type": "SHALLOW_WATER", "normT": 0.64, "lateral": -1.5, "width": 18, "length": 38 },
      { "id": "tm_coral_cut_1", "type": "BOOST_SHORTCUT", "normT": 0.82, "lateral": -13.5, "width": 7.5, "length": 44 }
    ]
  }'::jsonb
),
(
  'comm_seed_red_mesa_canyon',
  NULL,
  'Gutsy Studio Crew',
  'Red Mesa Canyon Run',
  'High-speed red rock desert canyon featuring sweeping banked hairpins, tabletop jump ramps, and an inside sandstone shortcut!',
  'SUNSET_CANYON',
  true,
  11,
  35,
  '{
    "id": "comm_seed_red_mesa_canyon",
    "name": "Red Mesa Canyon Run",
    "description": "High-speed red rock desert canyon featuring sweeping banked hairpins, tabletop jump ramps, and an inside sandstone shortcut!",
    "biome": "SUNSET_CANYON",
    "roadHalfWidth": 9,
    "autoTracksideScenery": true,
    "sceneryDensity": 1.0,
    "scenerySeed": 777,
    "terrainHillScale": 1.35,
    "authorName": "Gutsy Studio Crew",
    "controlPoints": [
      { "x": 0, "y": 0, "z": -140, "widthScale": 1.0 },
      { "x": 110, "y": 3.5, "z": -115, "widthScale": 1.05 },
      { "x": 165, "y": 6.0, "z": -15, "widthScale": 1.0 },
      { "x": 115, "y": 2.5, "z": 95, "widthScale": 1.1 },
      { "x": 20, "y": 0, "z": 60, "widthScale": 0.95 },
      { "x": -55, "y": 4.0, "z": 135, "widthScale": 1.05 },
      { "x": -155, "y": 5.5, "z": 75, "widthScale": 1.0 },
      { "x": -145, "y": 1.5, "z": -45, "widthScale": 1.05 },
      { "x": -85, "y": 0, "z": -125, "widthScale": 1.0 }
    ],
    "boostPads": [
      { "id": "bp_mesa_1", "normT": 0.18, "lateral": 2.0 },
      { "id": "bp_mesa_2", "normT": 0.45, "lateral": 0 },
      { "id": "bp_mesa_3", "normT": 0.72, "lateral": -2.5 },
      { "id": "bp_mesa_4", "normT": 0.91, "lateral": 0 }
    ],
    "itemBoxRows": [
      { "id": "ib_mesa_1", "normT": 0.26 },
      { "id": "ib_mesa_2", "normT": 0.58 },
      { "id": "ib_mesa_3", "normT": 0.84 }
    ],
    "obstacles": [
      { "id": "ob_mesa_1", "type": "JUMP_RAMP", "x": 152, "z": -15, "rotationY": 0, "scale": 1.2 },
      { "id": "ob_mesa_2", "type": "BOULDER", "x": 18, "z": 64, "rotationY": 0.5, "scale": 1.1 }
    ],
    "sceneryProps": [],
    "trackMasks": [
      { "id": "tm_mesa_split", "type": "SPLIT_MEDIAN", "normT": 0.52, "lateral": 0, "width": 5.5, "length": 36 },
      { "id": "tm_mesa_cut", "type": "PAVED_SHORTCUT", "normT": 0.78, "lateral": -13, "width": 7, "length": 42 }
    ]
  }'::jsonb
),
(
  'comm_seed_alpine_switchback',
  NULL,
  'Gutsy Studio Crew',
  'Timberline Twin Switchbacks',
  'Crisp alpine mountain pass with twin elevation hairpins, a split-median chicane, and a high-risk boost shortcut across the valley.',
  'ALPINE_SUBURBS',
  true,
  9,
  29,
  '{
    "id": "comm_seed_alpine_switchback",
    "name": "Timberline Twin Switchbacks",
    "description": "Crisp alpine mountain pass with twin elevation hairpins, a split-median chicane, and a high-risk boost shortcut across the valley.",
    "biome": "ALPINE_SUBURBS",
    "roadHalfWidth": 9,
    "autoTracksideScenery": true,
    "sceneryDensity": 1.1,
    "scenerySeed": 204,
    "terrainHillScale": 1.25,
    "authorName": "Gutsy Studio Crew",
    "controlPoints": [
      { "x": 0, "y": 0, "z": -130, "widthScale": 1.0 },
      { "x": 105, "y": 2.5, "z": -105, "widthScale": 1.05 },
      { "x": 150, "y": 5.0, "z": 0, "widthScale": 1.0 },
      { "x": 95, "y": 3.0, "z": 115, "widthScale": 1.1 },
      { "x": -10, "y": 1.0, "z": 135, "widthScale": 1.05 },
      { "x": -115, "y": 4.5, "z": 95, "widthScale": 1.0 },
      { "x": -150, "y": 2.0, "z": -15, "widthScale": 1.05 },
      { "x": -95, "y": 0, "z": -110, "widthScale": 1.0 }
    ],
    "boostPads": [
      { "id": "bp_alp_1", "normT": 0.15, "lateral": 0 },
      { "id": "bp_alp_2", "normT": 0.48, "lateral": 3.0 },
      { "id": "bp_alp_3", "normT": 0.82, "lateral": 0 }
    ],
    "itemBoxRows": [
      { "id": "ib_alp_1", "normT": 0.28 },
      { "id": "ib_alp_2", "normT": 0.64 }
    ],
    "obstacles": [],
    "sceneryProps": [],
    "trackMasks": [
      { "id": "tm_alp_split", "type": "SPLIT_MEDIAN", "normT": 0.34, "lateral": 0, "width": 5, "length": 32 },
      { "id": "tm_alp_cut", "type": "BOOST_SHORTCUT", "normT": 0.70, "lateral": -13, "width": 7, "length": 40 }
    ]
  }'::jsonb
)
ON CONFLICT (track_id) DO UPDATE SET
  track_name = EXCLUDED.track_name,
  description = EXCLUDED.description,
  biome = EXCLUDED.biome,
  track_json = EXCLUDED.track_json;
