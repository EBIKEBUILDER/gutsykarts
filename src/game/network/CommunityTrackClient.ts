"use client";

import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { CustomTrackDefinition, TrackBiome } from "@/src/types/game";

export interface CommunityAuthUser {
  id: string;
  email: string;
  callsign: string;
  racesCompleted: number;
  firstPlaceWins: number;
  podiumFinishes: number;
  cupsWon: string[];
  favoriteCharacterId: string;
  favoriteKartId: string;
}

export interface TrackLeaderboardEntry {
  entryId: string;
  trackId: string;
  trackName: string;
  userId: string | null;
  callsign: string;
  characterId: string;
  kartId: string;
  bestRaceMs: number;
  bestLapMs: number;
  isOfficialBenchmark: boolean;
  isMe: boolean;
  updatedAt: string;
}

export interface CommunityTrackRecord {
  trackId: string;
  authorId: string | null;
  authorCallsign: string;
  trackName: string;
  description: string;
  biome: TrackBiome;
  trackDef: CustomTrackDefinition;
  upvotesCount: number;
  playsCount: number;
  isOfficialSeed: boolean;
  upvotedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

const FALLBACK_SEED_TRACKS: CommunityTrackRecord[] = [
  {
    trackId: "comm_seed_coral_lagoon_atoll",
    authorId: null,
    authorCallsign: "Gutsy Studio Crew",
    trackName: "Coral Lagoon Atoll",
    description:
      "Sun-drenched tropical island circuit surrounded by ocean waves, palm cabanas, and two shallow turquoise lagoon crossings where Nitro boosts skip across the water!",
    biome: "TROPICAL_ATOLL",
    upvotesCount: 14,
    playsCount: 48,
    isOfficialSeed: true,
    upvotedByMe: false,
    createdAt: "2026-10-22T12:00:00.000Z",
    updatedAt: "2026-10-22T12:00:00.000Z",
    trackDef: {
      id: "comm_seed_coral_lagoon_atoll",
      name: "Coral Lagoon Atoll",
      description:
        "Sun-drenched tropical island circuit surrounded by ocean waves, palm cabanas, and two shallow turquoise lagoon crossings where Nitro boosts skip across the water!",
      biome: "TROPICAL_ATOLL",
      roadHalfWidth: 9.5,
      autoTracksideScenery: true,
      sceneryDensity: 1.15,
      scenerySeed: 402,
      terrainHillScale: 0.45,
      authorName: "Gutsy Studio Crew",
      controlPoints: [
        { x: 0, y: 0, z: -135, widthScale: 1.05 },
        { x: 95, y: 0, z: -120, widthScale: 1.1 },
        { x: 155, y: 1.2, z: -45, widthScale: 1.15 },
        { x: 140, y: 0, z: 55, widthScale: 1.1 },
        { x: 65, y: 0, z: 135, widthScale: 1.2 },
        { x: -45, y: 0, z: 145, widthScale: 1.15 },
        { x: -135, y: 1.8, z: 80, widthScale: 1.05 },
        { x: -155, y: 0, z: -20, widthScale: 1.1 },
        { x: -95, y: 0, z: -115, widthScale: 1.05 },
      ],
      boostPads: [
        { id: "bp_coral_1", normT: 0.14, lateral: 0 },
        { id: "bp_coral_2", normT: 0.38, lateral: -3.2 },
        { id: "bp_coral_3", normT: 0.62, lateral: 2.5 },
        { id: "bp_coral_4", normT: 0.86, lateral: 0 },
      ],
      itemBoxRows: [
        { id: "ib_coral_1", normT: 0.22 },
        { id: "ib_coral_2", normT: 0.52 },
        { id: "ib_coral_3", normT: 0.78 },
      ],
      obstacles: [
        { id: "ob_coral_1", type: "JUMP_RAMP", x: 146, z: 5, rotationY: 0.15, scale: 1.15 },
        { id: "ob_coral_2", type: "WATER_PUDDLE", x: 10, z: 140, rotationY: 0, scale: 1.3 },
      ],
      sceneryProps: [],
      trackMasks: [
        { id: "tm_coral_lagoon_1", type: "SHALLOW_WATER", normT: 0.36, lateral: 1.5, width: 16, length: 34 },
        { id: "tm_coral_lagoon_2", type: "SHALLOW_WATER", normT: 0.64, lateral: -1.5, width: 18, length: 38 },
        { id: "tm_coral_cut_1", type: "BOOST_SHORTCUT", normT: 0.82, lateral: -13.5, width: 7.5, length: 44 },
      ],
    },
  },
  {
    trackId: "comm_seed_red_mesa_canyon",
    authorId: null,
    authorCallsign: "Gutsy Studio Crew",
    trackName: "Red Mesa Canyon Run",
    description:
      "High-speed red rock desert canyon featuring sweeping banked hairpins, tabletop jump ramps, and an inside sandstone shortcut!",
    biome: "SUNSET_CANYON",
    upvotesCount: 11,
    playsCount: 35,
    isOfficialSeed: true,
    upvotedByMe: false,
    createdAt: "2026-10-22T11:30:00.000Z",
    updatedAt: "2026-10-22T11:30:00.000Z",
    trackDef: {
      id: "comm_seed_red_mesa_canyon",
      name: "Red Mesa Canyon Run",
      description:
        "High-speed red rock desert canyon featuring sweeping banked hairpins, tabletop jump ramps, and an inside sandstone shortcut!",
      biome: "SUNSET_CANYON",
      roadHalfWidth: 9,
      autoTracksideScenery: true,
      sceneryDensity: 1.0,
      scenerySeed: 777,
      terrainHillScale: 1.35,
      authorName: "Gutsy Studio Crew",
      controlPoints: [
        { x: 0, y: 0, z: -140, widthScale: 1.0 },
        { x: 110, y: 3.5, z: -115, widthScale: 1.05 },
        { x: 165, y: 6.0, z: -15, widthScale: 1.0 },
        { x: 115, y: 2.5, z: 95, widthScale: 1.1 },
        { x: 20, y: 0, z: 60, widthScale: 0.95 },
        { x: -55, y: 4.0, z: 135, widthScale: 1.05 },
        { x: -155, y: 5.5, z: 75, widthScale: 1.0 },
        { x: -145, y: 1.5, z: -45, widthScale: 1.05 },
        { x: -85, y: 0, z: -125, widthScale: 1.0 },
      ],
      boostPads: [
        { id: "bp_mesa_1", normT: 0.18, lateral: 2.0 },
        { id: "bp_mesa_2", normT: 0.45, lateral: 0 },
        { id: "bp_mesa_3", normT: 0.72, lateral: -2.5 },
        { id: "bp_mesa_4", normT: 0.91, lateral: 0 },
      ],
      itemBoxRows: [
        { id: "ib_mesa_1", normT: 0.26 },
        { id: "ib_mesa_2", normT: 0.58 },
        { id: "ib_mesa_3", normT: 0.84 },
      ],
      obstacles: [
        { id: "ob_mesa_1", type: "JUMP_RAMP", x: 152, z: -15, rotationY: 0, scale: 1.2 },
      ],
      sceneryProps: [
        { id: "sp_mesa_1", type: "BOULDER", x: 18, z: 64, rotationY: 0.5, scale: 1.1, isManual: true },
      ],
      trackMasks: [
        { id: "tm_mesa_split", type: "SPLIT_MEDIAN", normT: 0.52, lateral: 0, width: 5.5, length: 36 },
        { id: "tm_mesa_cut", type: "PAVED_SHORTCUT", normT: 0.78, lateral: -13, width: 7, length: 42 },
      ],
    },
  },
  {
    trackId: "comm_seed_alpine_switchback",
    authorId: null,
    authorCallsign: "Gutsy Studio Crew",
    trackName: "Timberline Twin Switchbacks",
    description:
      "Crisp alpine mountain pass with twin elevation hairpins, a split-median chicane, and a high-risk boost shortcut across the valley.",
    biome: "ALPINE_SUBURBS",
    upvotesCount: 9,
    playsCount: 29,
    isOfficialSeed: true,
    upvotedByMe: false,
    createdAt: "2026-10-22T11:00:00.000Z",
    updatedAt: "2026-10-22T11:00:00.000Z",
    trackDef: {
      id: "comm_seed_alpine_switchback",
      name: "Timberline Twin Switchbacks",
      description:
        "Crisp alpine mountain pass with twin elevation hairpins, a split-median chicane, and a high-risk boost shortcut across the valley.",
      biome: "ALPINE_SUBURBS",
      roadHalfWidth: 9,
      autoTracksideScenery: true,
      sceneryDensity: 1.1,
      scenerySeed: 204,
      terrainHillScale: 1.25,
      authorName: "Gutsy Studio Crew",
      controlPoints: [
        { x: 0, y: 0, z: -130, widthScale: 1.0 },
        { x: 105, y: 2.5, z: -105, widthScale: 1.05 },
        { x: 150, y: 5.0, z: 0, widthScale: 1.0 },
        { x: 95, y: 3.0, z: 115, widthScale: 1.1 },
        { x: -10, y: 1.0, z: 135, widthScale: 1.05 },
        { x: -115, y: 4.5, z: 95, widthScale: 1.0 },
        { x: -150, y: 2.0, z: -15, widthScale: 1.05 },
        { x: -95, y: 0, z: -110, widthScale: 1.0 },
      ],
      boostPads: [
        { id: "bp_alp_1", normT: 0.15, lateral: 0 },
        { id: "bp_alp_2", normT: 0.48, lateral: 3.0 },
        { id: "bp_alp_3", normT: 0.82, lateral: 0 },
      ],
      itemBoxRows: [
        { id: "ib_alp_1", normT: 0.28 },
        { id: "ib_alp_2", normT: 0.64 },
      ],
      obstacles: [],
      sceneryProps: [],
      trackMasks: [
        { id: "tm_alp_split", type: "SPLIT_MEDIAN", normT: 0.34, lateral: 0, width: 5, length: 32 },
        { id: "tm_alp_cut", type: "BOOST_SHORTCUT", normT: 0.7, lateral: -13, width: 7, length: 40 },
      ],
    },
  },
];

class CommunityTrackService {
  private supabase: SupabaseClient | null = null;
  private currentUser: CommunityAuthUser | null = null;
  private authListeners = new Set<(user: CommunityAuthUser | null) => void>();
  private playedTrackIdsThisSession = new Set<string>();
  private lastPublishEpochMs = 0;

  constructor() {
    if (typeof window !== "undefined") {
      this.initClient();
    }
  }

  private initClient(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

    const valid =
      (supabaseUrl.startsWith("https://") || supabaseUrl.startsWith("http://")) &&
      !supabaseUrl.includes("your-project-id") &&
      supabaseKey.length > 15;

    if (!valid) return;

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: "gutsykarts_supabase_auth_v1",
        },
      });

      void this.refreshAuthUser();

      this.supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          void this.resolveUserProfile(session.user).then((profile) => {
            this.currentUser = profile;
            this.notifyListeners();
          });
        } else {
          this.currentUser = null;
          this.notifyListeners();
        }
      });
    } catch {
      this.supabase = null;
    }
  }

  private notifyListeners(): void {
    for (const cb of this.authListeners) {
      cb(this.currentUser);
    }
  }

  public onAuthChange(cb: (user: CommunityAuthUser | null) => void): () => void {
    this.authListeners.add(cb);
    cb(this.currentUser);
    return () => {
      this.authListeners.delete(cb);
    };
  }

  public getUser(): CommunityAuthUser | null {
    return this.currentUser;
  }

  private async resolveUserProfile(user: User): Promise<CommunityAuthUser> {
    const fallbackCallsign =
      (user.user_metadata?.callsign as string | undefined)?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.email ? user.email.split("@")[0] : "GutsyRacer").slice(0, 20);

    const defaultProfile: CommunityAuthUser = {
      id: user.id,
      email: user.email ?? "",
      callsign: fallbackCallsign,
      racesCompleted: 0,
      firstPlaceWins: 0,
      podiumFinishes: 0,
      cupsWon: [],
      favoriteCharacterId: "aero_vance",
      favoriteKartId: "apex_striker",
    };

    if (!this.supabase) {
      return defaultProfile;
    }

    try {
      const { data } = await this.supabase
        .from("gutsy_racer_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.callsign) {
        return {
          id: user.id,
          email: user.email ?? "",
          callsign: data.callsign as string,
          racesCompleted: Number(data.races_completed ?? 0),
          firstPlaceWins: Number(data.first_place_wins ?? 0),
          podiumFinishes: Number(data.podium_finishes ?? 0),
          cupsWon: Array.isArray(data.cups_won) ? (data.cups_won as string[]) : [],
          favoriteCharacterId: (data.favorite_character_id as string) || "aero_vance",
          favoriteKartId: (data.favorite_kart_id as string) || "apex_striker",
        };
      }

      // Create initial profile row if not present
      const cleanCallsign = fallbackCallsign.slice(0, 24) || "GutsyRacer";
      await this.supabase.from("gutsy_racer_profiles").upsert(
        {
          user_id: user.id,
          callsign: cleanCallsign,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      return {
        ...defaultProfile,
        callsign: cleanCallsign,
      };
    } catch {
      return defaultProfile;
    }
  }

  public async refreshAuthUser(): Promise<CommunityAuthUser | null> {
    if (!this.supabase) return null;
    try {
      const { data } = await this.supabase.auth.getUser();
      if (data?.user) {
        this.currentUser = await this.resolveUserProfile(data.user);
      } else {
        this.currentUser = null;
      }
      this.notifyListeners();
      return this.currentUser;
    } catch {
      return null;
    }
  }

  public async signUpWithEmail(
    email: string,
    password: string,
    callsign: string
  ): Promise<{
    user: CommunityAuthUser | null;
    needsEmailConfirmation: boolean;
    error?: string;
  }> {
    if (!this.supabase) {
      return {
        user: null,
        needsEmailConfirmation: false,
        error: "Supabase is not configured in this environment.",
      };
    }

    const cleanCallsign = callsign.trim().slice(0, 24);
    if (cleanCallsign.length < 2) {
      return {
        user: null,
        needsEmailConfirmation: false,
        error: "Callsign must be at least 2 characters.",
      };
    }

    const { data, error } = await this.supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { callsign: cleanCallsign },
      },
    });

    if (error) {
      return { user: null, needsEmailConfirmation: false, error: error.message };
    }

    if (data.user && data.session) {
      await this.supabase.from("gutsy_racer_profiles").upsert(
        {
          user_id: data.user.id,
          callsign: cleanCallsign,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      this.currentUser = await this.resolveUserProfile(data.user);
      this.notifyListeners();
      return { user: this.currentUser, needsEmailConfirmation: false };
    }

    return {
      user: null,
      needsEmailConfirmation: true,
    };
  }

  public async signInWithEmail(
    email: string,
    password: string
  ): Promise<{ user: CommunityAuthUser | null; error?: string }> {
    if (!this.supabase) {
      return {
        user: null,
        error: "Supabase is not configured in this environment.",
      };
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (data.user) {
      this.currentUser = await this.resolveUserProfile(data.user);
      this.notifyListeners();
      return { user: this.currentUser };
    }

    return { user: null, error: "Unable to sign in." };
  }

  public async signInWithGoogle(): Promise<{ error?: string }> {
    if (!this.supabase || typeof window === "undefined") {
      return { error: "Supabase is not configured." };
    }

    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      return { error: error.message };
    }
    return {};
  }

  public async signOut(): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.auth.signOut();
    this.currentUser = null;
    this.notifyListeners();
  }

  public async updateCallsign(newCallsign: string): Promise<{ error?: string }> {
    if (!this.supabase || !this.currentUser) {
      return { error: "Please sign in first." };
    }
    const clean = newCallsign.trim().slice(0, 24);
    if (clean.length < 2) {
      return { error: "Callsign must be between 2 and 24 characters." };
    }

    const { error } = await this.supabase.from("gutsy_racer_profiles").upsert(
      {
        user_id: this.currentUser.id,
        callsign: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return { error: error.message };
    }

    this.currentUser = {
      ...this.currentUser,
      callsign: clean,
    };
    this.notifyListeners();
    return {};
  }

  public async fetchCommunityTracks(
    biomeFilter: TrackBiome | "ALL" = "ALL",
    sortBy: "POPULAR" | "NEWEST" | "MOST_PLAYED" = "POPULAR"
  ): Promise<CommunityTrackRecord[]> {
    if (!this.supabase) {
      return this.filterAndSortFallback(FALLBACK_SEED_TRACKS, biomeFilter, sortBy);
    }

    try {
      let query = this.supabase.from("gutsy_community_tracks").select("*");

      if (biomeFilter !== "ALL") {
        query = query.eq("biome", biomeFilter);
      }

      if (sortBy === "POPULAR") {
        query = query
          .order("upvotes_count", { ascending: false })
          .order("plays_count", { ascending: false })
          .order("created_at", { ascending: false });
      } else if (sortBy === "MOST_PLAYED") {
        query = query
          .order("plays_count", { ascending: false })
          .order("upvotes_count", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query.limit(60);
      if (error || !data || data.length === 0) {
        return this.filterAndSortFallback(FALLBACK_SEED_TRACKS, biomeFilter, sortBy);
      }

      // Check which tracks the current user has upvoted
      const upvotedSet = new Set<string>();
      if (this.currentUser) {
        const { data: votes } = await this.supabase
          .from("gutsy_community_track_upvotes")
          .select("track_id")
          .eq("user_id", this.currentUser.id);
        if (votes) {
          for (const v of votes) {
            upvotedSet.add(v.track_id);
          }
        }
      }

      return data.map((row) => {
        const parsedTrack = row.track_json as CustomTrackDefinition;
        const biome = (row.biome as TrackBiome) || parsedTrack.biome || "ALPINE_SUBURBS";
        return {
          trackId: row.track_id as string,
          authorId: (row.author_id as string | null) ?? null,
          authorCallsign: (row.author_callsign as string) || "Community Builder",
          trackName: (row.track_name as string) || parsedTrack.name || "Untitled Circuit",
          description: (row.description as string) || parsedTrack.description || "",
          biome,
          trackDef: {
            ...parsedTrack,
            id: row.track_id as string,
            name: (row.track_name as string) || parsedTrack.name,
            biome,
            authorName: (row.author_callsign as string) || parsedTrack.authorName,
          },
          upvotesCount: Number(row.upvotes_count ?? 0),
          playsCount: Number(row.plays_count ?? 0),
          isOfficialSeed: Boolean(row.is_official_seed),
          upvotedByMe: upvotedSet.has(row.track_id as string),
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };
      });
    } catch {
      return this.filterAndSortFallback(FALLBACK_SEED_TRACKS, biomeFilter, sortBy);
    }
  }

  private filterAndSortFallback(
    list: CommunityTrackRecord[],
    biomeFilter: TrackBiome | "ALL",
    sortBy: "POPULAR" | "NEWEST" | "MOST_PLAYED"
  ): CommunityTrackRecord[] {
    const filtered =
      biomeFilter === "ALL"
        ? [...list]
        : list.filter((item) => item.biome === biomeFilter);

    filtered.sort((a, b) => {
      if (sortBy === "MOST_PLAYED") return b.playsCount - a.playsCount;
      if (sortBy === "NEWEST") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return b.upvotesCount - a.upvotesCount || b.playsCount - a.playsCount;
    });
    return filtered;
  }

  public async publishCommunityTrack(
    track: CustomTrackDefinition
  ): Promise<{ record?: CommunityTrackRecord; error?: string; requiresAuth?: boolean }> {
    const user = await this.refreshAuthUser();
    if (!user || !this.supabase) {
      return {
        requiresAuth: true,
        error: "Please sign in with your Gutsy Karts account to publish community circuits.",
      };
    }

    // Client-side pre-validation before hitting Postgres anti-spam trigger
    const cleanName = (track.name || "").trim();
    if (cleanName.length < 3 || cleanName.length > 48) {
      return { error: "Track name must be between 3 and 48 characters." };
    }

    if (!Array.isArray(track.controlPoints) || track.controlPoints.length < 4) {
      return { error: "Track must have at least 4 spline control points." };
    }
    if (track.controlPoints.length > 80) {
      return { error: "Track exceeds maximum of 80 spline control points." };
    }

    const now = Date.now();
    if (now - this.lastPublishEpochMs < 15_000) {
      const waitSec = Math.ceil((15_000 - (now - this.lastPublishEpochMs)) / 1000);
      return {
        error: `Please wait ${waitSec}s before submitting again.`,
      };
    }

    // Determine deterministic track_id per (author, base track id) so updating an existing track updates in place
    // while publishing a new track creates a clean ID
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);
    const trackId = `comm_${user.id.slice(0, 8)}_${slug || "circuit"}`;
    const biome: TrackBiome = track.biome ?? "ALPINE_SUBURBS";
    const cleanDesc = (track.description || "Community custom circuit built in 3D Circuit Studio.")
      .trim()
      .slice(0, 280);

    const sanitizedTrackJson: CustomTrackDefinition = {
      ...track,
      id: trackId,
      name: cleanName,
      description: cleanDesc,
      biome,
      authorName: user.callsign,
      updatedAt: now,
    };

    const payloadStr = JSON.stringify(sanitizedTrackJson);
    if (payloadStr.length > 64000) {
      return { error: "Track payload is too large (max 64 KB)." };
    }

    const { data, error } = await this.supabase
      .from("gutsy_community_tracks")
      .upsert(
        {
          track_id: trackId,
          author_id: user.id,
          author_callsign: user.callsign,
          track_name: cleanName,
          description: cleanDesc,
          biome,
          track_json: sanitizedTrackJson,
          is_official_seed: false,
        },
        { onConflict: "track_id" }
      )
      .select("*")
      .single();

    if (error) {
      return { error: error.message };
    }

    this.lastPublishEpochMs = now;

    return {
      record: {
        trackId: data.track_id as string,
        authorId: data.author_id as string,
        authorCallsign: data.author_callsign as string,
        trackName: data.track_name as string,
        description: data.description as string,
        biome: (data.biome as TrackBiome) || "ALPINE_SUBURBS",
        trackDef: sanitizedTrackJson,
        upvotesCount: Number(data.upvotes_count ?? 0),
        playsCount: Number(data.plays_count ?? 0),
        isOfficialSeed: false,
        upvotedByMe: false,
        createdAt: data.created_at as string,
        updatedAt: data.updated_at as string,
      },
    };
  }

  public async toggleUpvote(
    trackId: string
  ): Promise<{ upvoted?: boolean; upvotesCount?: number; requiresAuth?: boolean; error?: string }> {
    const user = await this.refreshAuthUser();
    if (!user || !this.supabase) {
      return {
        requiresAuth: true,
        error: "Please sign in to upvote community tracks.",
      };
    }

    const { data, error } = await this.supabase.rpc(
      "toggle_community_track_upvote",
      { p_track_id: trackId }
    );

    if (error) {
      return { error: error.message };
    }

    const result = data as { upvoted?: boolean; upvotes_count?: number } | null;
    return {
      upvoted: Boolean(result?.upvoted),
      upvotesCount: Number(result?.upvotes_count ?? 0),
    };
  }

  public async recordTrackPlay(trackId: string): Promise<void> {
    if (!this.supabase || this.playedTrackIdsThisSession.has(trackId)) return;
    this.playedTrackIdsThisSession.add(trackId);
    try {
      await this.supabase.rpc("increment_community_track_plays", {
        p_track_id: trackId,
      });
    } catch {
      // Ignore network errors
    }
  }

  public async fetchTrackLeaderboard(
    trackId: string,
    trackName: string,
    sortBy: "RACE" | "LAP" = "RACE"
  ): Promise<TrackLeaderboardEntry[]> {
    const fallbackBenchmarks: TrackLeaderboardEntry[] = [
      {
        entryId: `${trackId}::bench_gold`,
        trackId,
        trackName,
        userId: null,
        callsign: "Aero Vance (Pro Pace)",
        characterId: "aero_vance",
        kartId: "apex_striker",
        bestRaceMs: 96500,
        bestLapMs: 31500,
        isOfficialBenchmark: true,
        isMe: false,
        updatedAt: "2026-10-23T00:00:00.000Z",
      },
      {
        entryId: `${trackId}::bench_silver`,
        trackId,
        trackName,
        userId: null,
        callsign: "Nyx Veloce (Pace)",
        characterId: "nyx_drift",
        kartId: "phantom_coupe",
        bestRaceMs: 100800,
        bestLapMs: 32900,
        isOfficialBenchmark: true,
        isMe: false,
        updatedAt: "2026-10-23T00:00:00.000Z",
      },
      {
        entryId: `${trackId}::bench_bronze`,
        trackId,
        trackName,
        userId: null,
        callsign: "Rex Ironclad (Pace)",
        characterId: "rex_ironclad",
        kartId: "behemoth_bruiser",
        bestRaceMs: 105400,
        bestLapMs: 34400,
        isOfficialBenchmark: true,
        isMe: false,
        updatedAt: "2026-10-23T00:00:00.000Z",
      },
    ];

    if (!this.supabase) {
      return fallbackBenchmarks;
    }

    try {
      const orderCol = sortBy === "LAP" ? "best_lap_ms" : "best_race_ms";
      const { data, error } = await this.supabase
        .from("gutsy_track_leaderboards")
        .select("*")
        .eq("track_id", trackId)
        .order(orderCol, { ascending: true })
        .limit(15);

      if (error || !data || data.length === 0) {
        return fallbackBenchmarks;
      }

      const myId = this.currentUser?.id ?? null;
      return data.map((row) => ({
        entryId: row.entry_id as string,
        trackId: row.track_id as string,
        trackName: (row.track_name as string) || trackName,
        userId: (row.user_id as string | null) ?? null,
        callsign: (row.callsign as string) || "GutsyRacer",
        characterId: (row.character_id as string) || "aero_vance",
        kartId: (row.kart_id as string) || "apex_striker",
        bestRaceMs: Number(row.best_race_ms ?? 99999),
        bestLapMs: Number(row.best_lap_ms ?? 33333),
        isOfficialBenchmark: Boolean(row.is_official_benchmark),
        isMe: Boolean(myId && row.user_id === myId),
        updatedAt: row.updated_at as string,
      }));
    } catch {
      return fallbackBenchmarks;
    }
  }

  public async submitVerifiedRaceResult(params: {
    trackId: string;
    trackName: string;
    characterId: string;
    kartId: string;
    raceMs: number;
    lapMs: number;
    rank: number;
    cupWonId?: string | null;
  }): Promise<{
    isNewRacePb?: boolean;
    isNewLapPb?: boolean;
    bestRaceMs?: number;
    bestLapMs?: number;
    error?: string;
  }> {
    if (!this.supabase || !this.currentUser) {
      return { error: "NOT_SIGNED_IN" };
    }

    const cleanRaceMs = Math.round(params.raceMs);
    const cleanLapMs = Math.round(params.lapMs);
    if (cleanRaceMs < 25000 || cleanLapMs < 8000) {
      return { error: "Timing outside valid bounds." };
    }

    try {
      const { data, error } = await this.supabase.rpc(
        "submit_verified_race_result",
        {
          p_track_id: params.trackId,
          p_track_name: params.trackName,
          p_character_id: params.characterId,
          p_kart_id: params.kartId,
          p_race_ms: cleanRaceMs,
          p_lap_ms: cleanLapMs,
          p_rank: params.rank,
          p_cup_won_id: params.cupWonId ?? null,
        }
      );

      if (error) {
        return { error: error.message };
      }

      // Refresh local profile snapshot so Career Trophy Case updates immediately
      await this.refreshAuthUser();

      const parsed = data as {
        is_new_race_pb?: boolean;
        is_new_lap_pb?: boolean;
        best_race_ms?: number;
        best_lap_ms?: number;
      } | null;

      return {
        isNewRacePb: Boolean(parsed?.is_new_race_pb),
        isNewLapPb: Boolean(parsed?.is_new_lap_pb),
        bestRaceMs: Number(parsed?.best_race_ms ?? cleanRaceMs),
        bestLapMs: Number(parsed?.best_lap_ms ?? cleanLapMs),
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to submit record.",
      };
    }
  }
}

export const communityTrackClient = new CommunityTrackService();
