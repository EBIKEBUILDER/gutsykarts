import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  AiCharacterBalanceStat,
  AiPolicyWeights,
  AiRacerTelemetrySummary,
  AiTrainingLabTelemetry,
} from "@/src/types/game";
import { BUILD_INFO_STAMP, ROSTER_BALANCE_PASS } from "@/src/game/data/roster";

export const CURRENT_BUILD_PASS = ROSTER_BALANCE_PASS;
export const CURRENT_BUILD_SHA =
  process.env.NEXT_PUBLIC_BUILD_SHA || "daf5785";

const LOCAL_STORAGE_KEY = "gutsy_karts_analytics_cache_v1";
const MAX_LOCAL_RACES = 120;
const MAX_CLOUD_RACES_PER_BUILD = 500;

export interface AnalyticsSessionRow {
  session_id: string;
  peer_id: string;
  player_name: string;
  build_pass: string;
  build_sha: string;
  device_type: "desktop" | "mobile";
  viewport: string;
  referrer: string;
  is_ai_sim_machine: boolean;
  lobby_select_sec: number;
  racing_active_sec: number;
  spectating_sec: number;
  circuit_studio_sec: number;
  ai_lab_open_sec: number;
  races_started: number;
  races_completed: number;
  races_abandoned: number;
  circuit_studio_opens: number;
  custom_tracks_saved: number;
  custom_tracks_exported: number;
  online_rooms_hosted: number;
  online_rooms_joined: number;
  mid_race_takeovers: number;
  balance_guide_views: number;
  favorite_character_id: string | null;
  favorite_track_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsHumanRaceRow {
  race_id: string;
  session_id: string;
  peer_id: string;
  player_name: string;
  build_pass: string;
  build_sha: string;
  mode: "single_cup" | "single_track" | "online_host" | "online_client";
  status: "completed" | "abandoned";
  cup_id: string;
  track_id: string;
  track_name: string;
  character_id: string;
  kart_id: string;
  ai_difficulty: string;
  placement: number | null;
  human_count: number;
  finish_time_ms: number | null;
  lap1_ms: number | null;
  best_flying_lap_ms: number | null;
  avg_speed: number | null;
  top_speed_ratio_pct: number | null;
  on_track_pct: number | null;
  off_road_pct: number | null;
  mini_turbos_fired: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  shoves_given: number;
  hits_taken: number;
  items_used: number;
  created_at: string;
}

export interface AnalyticsAiLabRow {
  build_pass: string;
  peer_id: string;
  build_sha: string;
  machine_label: string;
  generation: number;
  episodes_completed: number;
  items_enabled: boolean;
  training_track_mode: string;
  auto_balance_enabled: boolean;
  champion_fitness: number;
  champion_best_lap_ms: number | null;
  character_balance: AiCharacterBalanceStat[];
  champion_weights: Partial<AiPolicyWeights>;
  report_markdown: string;
  updated_at: string;
}

export interface AnalyticsDashboardDataset {
  currentBuildPass: string;
  currentBuildSha: string;
  currentBuildStamp: string;
  supabaseConfigured: boolean;
  supabaseTablesReady: boolean;
  tableStatusMessage: string | null;
  availableBuildPasses: string[];
  sessions: AnalyticsSessionRow[];
  humanRaces: AnalyticsHumanRaceRow[];
  aiLabSnapshots: AnalyticsAiLabRow[];
}

interface LocalAnalyticsCache {
  sessionsById: Record<string, AnalyticsSessionRow>;
  humanRaces: AnalyticsHumanRaceRow[];
  aiLabByKey: Record<string, AnalyticsAiLabRow>;
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr_session";
  try {
    const existing = window.sessionStorage.getItem("gutsy_karts_analytics_sid");
    if (existing) return existing;
    const created = `sess_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    window.sessionStorage.setItem("gutsy_karts_analytics_sid", created);
    return created;
  } catch {
    return `sess_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getOrCreatePeerId(): string {
  if (typeof window === "undefined") return "ssr_peer";
  try {
    const existing = window.sessionStorage.getItem("gutsy_karts_peer_id");
    if (existing) return existing;
    const localExisting = window.localStorage.getItem(
      "gutsy_karts_machine_peer_id"
    );
    if (localExisting) return localExisting;
    const created = `node_${Math.random().toString(36).slice(2, 8)}_${Date.now()
      .toString(36)
      .slice(-4)}`;
    window.localStorage.setItem("gutsy_karts_machine_peer_id", created);
    return created;
  } catch {
    return `node_${Math.random().toString(36).slice(2, 9)}`;
  }
}

function detectDeviceType(): "desktop" | "mobile" {
  if (typeof window === "undefined") return "desktop";
  const ua = window.navigator?.userAgent ?? "";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return "mobile";
  if (window.innerWidth <= 820 && "ontouchstart" in window) return "mobile";
  return "desktop";
}

export class AnalyticsTracker {
  private supabase: SupabaseClient | null = null;
  private supabaseConfigured = false;
  private supabaseTablesReady = true;
  private lastSchemaError: string | null = null;
  private lastAiLabCloudSyncAt = 0;
  private pendingAiLabRow: AnalyticsAiLabRow | null = null;

  private sessionId: string;
  private peerId: string;
  private sessionRow: AnalyticsSessionRow;
  private charPickCounts: Record<string, number> = {};
  private trackPlayCounts: Record<string, number> = {};
  private dirtySession = false;
  private activeRaceStartedAt: number | null = null;
  private activeRaceCompleted = false;
  private activeRaceMeta: {
    mode: "single_cup" | "single_track" | "online_host" | "online_client";
    cupId: string;
    trackId: string;
    trackName: string;
    characterId: string;
    kartId: string;
    aiDifficulty: string;
    humanCount: number;
  } | null = null;

  constructor() {
    this.sessionId = getOrCreateSessionId();
    this.peerId = getOrCreatePeerId();
    const nowIso = new Date().toISOString();

    let playerName = "GutsyRacer";
    let viewport = "1920x1080";
    let referrer = "direct";

    if (typeof window !== "undefined") {
      try {
        playerName =
          window.localStorage.getItem("gutsy_karts_player_name")?.trim() ||
          "GutsyRacer";
      } catch {
        // Ignore storage error
      }
      viewport = `${window.innerWidth}x${window.innerHeight}`;
      if (document.referrer) {
        try {
          const url = new URL(document.referrer);
          referrer = url.hostname || "direct";
        } catch {
          referrer = document.referrer.slice(0, 64);
        }
      }
    }

    this.sessionRow = {
      session_id: this.sessionId,
      peer_id: this.peerId,
      player_name: playerName,
      build_pass: CURRENT_BUILD_PASS,
      build_sha: CURRENT_BUILD_SHA,
      device_type: detectDeviceType(),
      viewport,
      referrer,
      is_ai_sim_machine: false,
      lobby_select_sec: 0,
      racing_active_sec: 0,
      spectating_sec: 0,
      circuit_studio_sec: 0,
      ai_lab_open_sec: 0,
      races_started: 0,
      races_completed: 0,
      races_abandoned: 0,
      circuit_studio_opens: 0,
      custom_tracks_saved: 0,
      custom_tracks_exported: 0,
      online_rooms_hosted: 0,
      online_rooms_joined: 0,
      mid_race_takeovers: 0,
      balance_guide_views: 0,
      favorite_character_id: null,
      favorite_track_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (typeof window !== "undefined") {
      this.initSupabase();
      this.hydrateExistingSessionIfPresent();
      this.saveSessionToLocalCache();

      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          void this.flushSessionNow();
        }
      });
    }
  }

  private initSupabase(): void {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

    const valid =
      (supabaseUrl.startsWith("https://") ||
        supabaseUrl.startsWith("http://")) &&
      !supabaseUrl.includes("your-project-id") &&
      supabaseKey.length > 15 &&
      supabaseKey !== "your-public-anon-key";

    if (!valid) {
      this.supabaseConfigured = false;
      return;
    }

    this.supabaseConfigured = true;
    try {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch {
      this.supabase = null;
    }
  }

  private loadLocalCache(): LocalAnalyticsCache {
    if (typeof window === "undefined") {
      return { sessionsById: {}, humanRaces: [], aiLabByKey: {} };
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        return { sessionsById: {}, humanRaces: [], aiLabByKey: {} };
      }
      const parsed = JSON.parse(raw) as Partial<LocalAnalyticsCache>;
      return {
        sessionsById: parsed.sessionsById ?? {},
        humanRaces: Array.isArray(parsed.humanRaces) ? parsed.humanRaces : [],
        aiLabByKey: parsed.aiLabByKey ?? {},
      };
    } catch {
      return { sessionsById: {}, humanRaces: [], aiLabByKey: {} };
    }
  }

  private writeLocalCache(cache: LocalAnalyticsCache): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore quota errors
    }
  }

  private hydrateExistingSessionIfPresent(): void {
    const cache = this.loadLocalCache();
    const existing = cache.sessionsById[this.sessionId];
    if (existing && existing.build_pass === CURRENT_BUILD_PASS) {
      this.sessionRow = {
        ...this.sessionRow,
        ...existing,
        updated_at: new Date().toISOString(),
      };
    }
  }

  private saveSessionToLocalCache(): void {
    const cache = this.loadLocalCache();
    cache.sessionsById[this.sessionId] = { ...this.sessionRow };
    // Keep at most 40 local sessions in localStorage
    const keys = Object.keys(cache.sessionsById);
    if (keys.length > 40) {
      const sorted = keys.sort((a, b) =>
        (cache.sessionsById[a]?.updated_at ?? "").localeCompare(
          cache.sessionsById[b]?.updated_at ?? ""
        )
      );
      for (const oldKey of sorted.slice(0, keys.length - 40)) {
        delete cache.sessionsById[oldKey];
      }
    }
    this.writeLocalCache(cache);
  }

  private saveHumanRaceToLocalCache(row: AnalyticsHumanRaceRow): void {
    const cache = this.loadLocalCache();
    cache.humanRaces.unshift(row);
    if (cache.humanRaces.length > MAX_LOCAL_RACES) {
      cache.humanRaces.length = MAX_LOCAL_RACES;
    }
    this.writeLocalCache(cache);
  }

  private saveAiLabToLocalCache(row: AnalyticsAiLabRow): void {
    const cache = this.loadLocalCache();
    cache.aiLabByKey[`${row.build_pass}::${row.peer_id}`] = row;
    this.writeLocalCache(cache);
  }

  public updatePlayerIdentity(playerName: string): void {
    if (!playerName) return;
    this.sessionRow.player_name = playerName.trim().slice(0, 24);
    this.dirtySession = true;
  }

  public markAiSimModeActive(active: boolean): void {
    if (typeof window !== "undefined") {
      try {
        if (active) {
          window.sessionStorage.setItem("gutsy_karts_ai_sim_active", "true");
        } else {
          window.sessionStorage.removeItem("gutsy_karts_ai_sim_active");
        }
      } catch {
        // Ignore storage errors
      }
    }
    if (active && !this.sessionRow.is_ai_sim_machine) {
      this.sessionRow.is_ai_sim_machine = true;
      this.dirtySession = true;
      void this.flushSessionNow();
    }
  }

  /**
   * Called once per second by a low-frequency UI timer in RaceGame.tsx
   * to record how visitors spend their time across screens and modes.
   */
  public recordActivitySecond(state: {
    screen: "SELECT" | "EDITOR" | "RACE";
    isAiSimMode: boolean;
    isSpectating: boolean;
    isAiLabOpen: boolean;
  }): void {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    if (state.isAiSimMode) {
      this.sessionRow.is_ai_sim_machine = true;
    }

    if (state.screen === "SELECT") {
      this.sessionRow.lobby_select_sec += 1;
    } else if (state.screen === "EDITOR") {
      this.sessionRow.circuit_studio_sec += 1;
    } else if (state.screen === "RACE") {
      if (state.isSpectating || state.isAiSimMode) {
        this.sessionRow.spectating_sec += 1;
      } else {
        this.sessionRow.racing_active_sec += 1;
      }
    }

    if (state.isAiLabOpen) {
      this.sessionRow.ai_lab_open_sec += 1;
    }

    this.sessionRow.updated_at = new Date().toISOString();
    this.dirtySession = true;

    const totalSec =
      this.sessionRow.lobby_select_sec +
      this.sessionRow.circuit_studio_sec +
      this.sessionRow.racing_active_sec +
      this.sessionRow.spectating_sec;

    if (totalSec % 5 === 0) {
      this.saveSessionToLocalCache();
    }
    // Upsert to Supabase at most once every 3 minutes (180s) to keep cloud writes and API logs minimal
    if (totalSec > 0 && totalSec % 180 === 0) {
      void this.flushSessionNow();
    }
  }

  public recordFeatureUsed(
    feature:
      | "circuit_studio_opened"
      | "custom_track_saved"
      | "custom_track_exported"
      | "online_room_hosted"
      | "online_room_joined"
      | "mid_race_takeover"
      | "balance_guide_viewed"
  ): void {
    switch (feature) {
      case "circuit_studio_opened":
        this.sessionRow.circuit_studio_opens += 1;
        break;
      case "custom_track_saved":
        this.sessionRow.custom_tracks_saved += 1;
        break;
      case "custom_track_exported":
        this.sessionRow.custom_tracks_exported += 1;
        break;
      case "online_room_hosted":
        this.sessionRow.online_rooms_hosted += 1;
        break;
      case "online_room_joined":
        this.sessionRow.online_rooms_joined += 1;
        break;
      case "mid_race_takeover":
        this.sessionRow.mid_race_takeovers += 1;
        break;
      case "balance_guide_viewed":
        this.sessionRow.balance_guide_views += 1;
        break;
    }
    this.sessionRow.updated_at = new Date().toISOString();
    this.dirtySession = true;
    this.saveSessionToLocalCache();
    void this.flushSessionNow();
  }

  public recordHumanRaceStart(params: {
    mode: "single_cup" | "single_track" | "online_host" | "online_client";
    cupId: string;
    trackId: string;
    trackName: string;
    characterId: string;
    kartId: string;
    aiDifficulty: string;
    humanCount: number;
  }): void {
    // If a previous human race was started and left before finishing, mark it abandoned
    if (
      this.activeRaceStartedAt !== null &&
      !this.activeRaceCompleted &&
      this.activeRaceMeta &&
      Date.now() - this.activeRaceStartedAt > 8000
    ) {
      this.recordHumanRaceAbandoned();
    }

    this.activeRaceStartedAt = Date.now();
    this.activeRaceCompleted = false;
    this.activeRaceMeta = params;

    this.sessionRow.races_started += 1;
    this.charPickCounts[params.characterId] =
      (this.charPickCounts[params.characterId] ?? 0) + 1;
    this.trackPlayCounts[params.trackId] =
      (this.trackPlayCounts[params.trackId] ?? 0) + 1;

    this.sessionRow.favorite_character_id = this.getTopKey(this.charPickCounts);
    this.sessionRow.favorite_track_id = this.getTopKey(this.trackPlayCounts);
    this.sessionRow.updated_at = new Date().toISOString();
    this.dirtySession = true;
    this.saveSessionToLocalCache();
    void this.flushSessionNow();
  }

  public recordHumanRaceAbandoned(): void {
    if (
      !this.activeRaceMeta ||
      this.activeRaceCompleted ||
      this.activeRaceStartedAt === null
    ) {
      return;
    }
    const elapsed = Date.now() - this.activeRaceStartedAt;
    this.activeRaceStartedAt = null;
    const meta = this.activeRaceMeta;
    this.activeRaceMeta = null;

    if (elapsed < 6000) return; // Ignore immediate menu back-outs under 6s

    this.sessionRow.races_abandoned += 1;
    this.sessionRow.updated_at = new Date().toISOString();
    this.saveSessionToLocalCache();

    const row: AnalyticsHumanRaceRow = {
      race_id: `race_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      session_id: this.sessionId,
      peer_id: this.peerId,
      player_name: this.sessionRow.player_name,
      build_pass: CURRENT_BUILD_PASS,
      build_sha: CURRENT_BUILD_SHA,
      mode: meta.mode,
      status: "abandoned",
      cup_id: meta.cupId,
      track_id: meta.trackId,
      track_name: meta.trackName,
      character_id: meta.characterId,
      kart_id: meta.kartId,
      ai_difficulty: meta.aiDifficulty,
      placement: null,
      human_count: meta.humanCount,
      finish_time_ms: null,
      lap1_ms: null,
      best_flying_lap_ms: null,
      avg_speed: null,
      top_speed_ratio_pct: null,
      on_track_pct: null,
      off_road_pct: null,
      mini_turbos_fired: 0,
      tier1_count: 0,
      tier2_count: 0,
      tier3_count: 0,
      shoves_given: 0,
      hits_taken: 0,
      items_used: 0,
      created_at: new Date().toISOString(),
    };

    this.saveHumanRaceToLocalCache(row);
    void this.insertHumanRaceToCloud(row);
    void this.flushSessionNow();
  }

  public recordHumanRaceFinish(params: {
    mode: "single_cup" | "single_track" | "online_host" | "online_client";
    cupId: string;
    trackId: string;
    trackName: string;
    characterId: string;
    kartId: string;
    aiDifficulty: string;
    placement: number;
    humanCount: number;
    finishTimeMs: number;
    lapTimesMs: number[];
    racerTelemetry?: AiRacerTelemetrySummary | null;
  }): void {
    this.activeRaceCompleted = true;
    this.activeRaceStartedAt = null;
    this.activeRaceMeta = null;

    this.sessionRow.races_completed += 1;
    this.sessionRow.updated_at = new Date().toISOString();
    this.saveSessionToLocalCache();

    const validLaps = params.lapTimesMs.filter(
      (ms) => Number.isFinite(ms) && ms > 1000
    );
    const lap1Ms = validLaps.length > 0 ? Math.round(validLaps[0]) : null;
    const flyingLaps = validLaps.slice(1);
    const bestFlyingLapMs =
      flyingLaps.length > 0 ? Math.round(Math.min(...flyingLaps)) : null;

    const rt = params.racerTelemetry;
    const onTrackPct = rt
      ? Number((rt.pavementPct + rt.curbPct).toFixed(1))
      : null;

    const row: AnalyticsHumanRaceRow = {
      race_id: `race_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      session_id: this.sessionId,
      peer_id: this.peerId,
      player_name: this.sessionRow.player_name,
      build_pass: CURRENT_BUILD_PASS,
      build_sha: CURRENT_BUILD_SHA,
      mode: params.mode,
      status: "completed",
      cup_id: params.cupId,
      track_id: params.trackId,
      track_name: params.trackName,
      character_id: params.characterId,
      kart_id: params.kartId,
      ai_difficulty: params.aiDifficulty,
      placement: params.placement,
      human_count: params.humanCount,
      finish_time_ms: Math.round(params.finishTimeMs),
      lap1_ms: lap1Ms,
      best_flying_lap_ms: bestFlyingLapMs,
      avg_speed: rt ? Number(rt.avgSpeed.toFixed(2)) : null,
      top_speed_ratio_pct: rt ? Number(rt.topSpeedRatioPct.toFixed(1)) : null,
      on_track_pct: onTrackPct,
      off_road_pct: rt ? Number(rt.offRoadPct.toFixed(1)) : null,
      mini_turbos_fired: rt?.miniTurbosFired ?? 0,
      tier1_count: rt?.tier1Count ?? 0,
      tier2_count: rt?.tier2Count ?? 0,
      tier3_count: rt?.tier3Count ?? 0,
      shoves_given: rt?.collisionsGiven ?? 0,
      hits_taken: rt?.collisionsTaken ?? 0,
      items_used: rt?.itemsUsed ?? 0,
      created_at: new Date().toISOString(),
    };

    this.saveHumanRaceToLocalCache(row);
    void this.insertHumanRaceToCloud(row);
    void this.flushSessionNow();
  }

  /**
   * Rolling Upsert for AI Self-Training Simulation runs.
   * Overwrites a single row per (build_pass, peer_id) so 5,000 training episodes
   * only ever consume 1 row in Supabase!
   */
  public syncAiLabSnapshot(params: {
    snapshot: AiTrainingLabTelemetry;
    championWeights: Partial<AiPolicyWeights>;
    reportMarkdown: string;
  }): void {
    this.markAiSimModeActive(true);

    const row: AnalyticsAiLabRow = {
      build_pass: CURRENT_BUILD_PASS,
      peer_id: this.peerId,
      build_sha: CURRENT_BUILD_SHA,
      machine_label: `${this.sessionRow.player_name} (${this.sessionRow.device_type})`,
      generation: params.snapshot.generation,
      episodes_completed: params.snapshot.episodesCompleted,
      items_enabled: params.snapshot.itemsEnabled,
      training_track_mode: params.snapshot.trainingTrackMode,
      auto_balance_enabled: params.snapshot.autoBalanceRosterEnabled,
      champion_fitness: Number(params.snapshot.championFitness.toFixed(2)),
      champion_best_lap_ms: params.snapshot.championBestLapMs
        ? Math.round(params.snapshot.championBestLapMs)
        : null,
      character_balance: params.snapshot.characterBalance,
      champion_weights: params.championWeights,
      report_markdown: params.reportMarkdown,
      updated_at: new Date().toISOString(),
    };

    this.saveAiLabToLocalCache(row);
    this.pendingAiLabRow = row;

    if (!this.supabase) return;
    const now = Date.now();
    // Throttle cloud upserts during 16x AI training runs to at most once per 60 seconds
    if (now - this.lastAiLabCloudSyncAt < 60000) return;
    void this.flushAiLabNow();
  }

  public async flushAiLabNow(): Promise<void> {
    const row = this.pendingAiLabRow;
    if (!row || !this.supabase) return;
    this.pendingAiLabRow = null;
    this.lastAiLabCloudSyncAt = Date.now();

    try {
      const { error } = await this.supabase
        .from("gutsy_analytics_ai_lab")
        .upsert(row, { onConflict: "build_pass,peer_id" });
      if (error) {
        this.handleSupabaseTableError(error.message);
      } else {
        this.supabaseTablesReady = true;
        this.lastSchemaError = null;
      }
    } catch {
      // Ignore transient network errors
    }
  }

  public async flushSessionNow(): Promise<void> {
    if (this.pendingAiLabRow) {
      void this.flushAiLabNow();
    }
    if (!this.dirtySession) return;
    this.dirtySession = false;
    this.sessionRow.updated_at = new Date().toISOString();
    this.saveSessionToLocalCache();

    if (!this.supabase) return;
    try {
      const { error } = await this.supabase
        .from("gutsy_analytics_sessions")
        .upsert(this.sessionRow, { onConflict: "session_id" });
      if (error) {
        this.handleSupabaseTableError(error.message);
      } else {
        this.supabaseTablesReady = true;
        this.lastSchemaError = null;
      }
    } catch {
      // Ignore network errors
    }
  }

  private async insertHumanRaceToCloud(
    row: AnalyticsHumanRaceRow
  ): Promise<void> {
    if (!this.supabase) return;
    try {
      const { error } = await this.supabase
        .from("gutsy_analytics_races")
        .upsert(row, { onConflict: "race_id" });
      if (error) {
        this.handleSupabaseTableError(error.message);
        return;
      }
      this.supabaseTablesReady = true;
      this.lastSchemaError = null;

      // Enforce rolling cap per build pass so free tier never fills up
      const { data: oldestRows } = await this.supabase
        .from("gutsy_analytics_races")
        .select("race_id")
        .eq("build_pass", CURRENT_BUILD_PASS)
        .order("created_at", { ascending: false })
        .range(MAX_CLOUD_RACES_PER_BUILD, MAX_CLOUD_RACES_PER_BUILD + 50);

      if (oldestRows && oldestRows.length > 0) {
        const idsToDelete = oldestRows.map((r: { race_id: string }) => r.race_id);
        await this.supabase
          .from("gutsy_analytics_races")
          .delete()
          .in("race_id", idsToDelete);
      }
    } catch {
      // Ignore network errors
    }
  }

  private handleSupabaseTableError(message: string): void {
    if (
      message.includes("Could not find the table") ||
      message.includes("relation") ||
      message.includes("does not exist") ||
      message.includes("schema cache")
    ) {
      this.supabaseTablesReady = false;
      this.lastSchemaError =
        "Supabase tables are not created yet. Click 'Copy Setup SQL' and run it once in your Supabase SQL Editor.";
    }
  }

  private getTopKey(counts: Record<string, number>): string | null {
    let bestKey: string | null = null;
    let bestVal = -1;
    for (const [k, v] of Object.entries(counts)) {
      if (v > bestVal) {
        bestVal = v;
        bestKey = k;
      }
    }
    return bestKey;
  }

  /**
   * Fetches the combined Cloud + Local + Realtime telemetry dataset for the dashboard.
   */
  public async fetchDashboardDataset(): Promise<AnalyticsDashboardDataset> {
    await this.flushSessionNow();
    const localCache = this.loadLocalCache();

    const sessionsMap = new Map<string, AnalyticsSessionRow>();
    const racesMap = new Map<string, AnalyticsHumanRaceRow>();
    const aiLabMap = new Map<string, AnalyticsAiLabRow>();

    // 1. Seed with local cache
    for (const s of Object.values(localCache.sessionsById)) {
      sessionsMap.set(s.session_id, s);
    }
    sessionsMap.set(this.sessionRow.session_id, { ...this.sessionRow });

    for (const r of localCache.humanRaces) {
      racesMap.set(r.race_id, r);
    }

    for (const a of Object.values(localCache.aiLabByKey)) {
      aiLabMap.set(`${a.build_pass}::${a.peer_id}`, a);
    }

    // 2. Query Supabase cloud tables if configured
    if (this.supabase) {
      try {
        const [sessRes, raceRes, aiRes] = await Promise.all([
          this.supabase
            .from("gutsy_analytics_sessions")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(300),
          this.supabase
            .from("gutsy_analytics_races")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(500),
          this.supabase
            .from("gutsy_analytics_ai_lab")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(50),
        ]);

        if (sessRes.error || raceRes.error || aiRes.error) {
          const errMsg =
            sessRes.error?.message ||
            raceRes.error?.message ||
            aiRes.error?.message ||
            "";
          this.handleSupabaseTableError(errMsg);
        } else {
          this.supabaseTablesReady = true;
          this.lastSchemaError = null;

          for (const s of (sessRes.data ?? []) as AnalyticsSessionRow[]) {
            sessionsMap.set(s.session_id, s);
          }
          for (const r of (raceRes.data ?? []) as AnalyticsHumanRaceRow[]) {
            racesMap.set(r.race_id, r);
          }
          for (const a of (aiRes.data ?? []) as AnalyticsAiLabRow[]) {
            aiLabMap.set(`${a.build_pass}::${a.peer_id}`, a);
          }
        }
      } catch {
        // Fallback to local cache seamlessly
      }
    }

    const sessions = Array.from(sessionsMap.values()).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
    const humanRaces = Array.from(racesMap.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const aiLabSnapshots = Array.from(aiLabMap.values()).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );

    const buildPassesSet = new Set<string>([CURRENT_BUILD_PASS]);
    for (const s of sessions) buildPassesSet.add(s.build_pass);
    for (const r of humanRaces) buildPassesSet.add(r.build_pass);
    for (const a of aiLabSnapshots) buildPassesSet.add(a.build_pass);

    return {
      currentBuildPass: CURRENT_BUILD_PASS,
      currentBuildSha: CURRENT_BUILD_SHA,
      currentBuildStamp: BUILD_INFO_STAMP,
      supabaseConfigured: this.supabaseConfigured,
      supabaseTablesReady: this.supabaseTablesReady,
      tableStatusMessage: this.lastSchemaError,
      availableBuildPasses: Array.from(buildPassesSet),
      sessions,
      humanRaces,
      aiLabSnapshots,
    };
  }

  /**
   * Prunes analytics data for a specific build pass, or all old builds other than CURRENT_BUILD_PASS.
   */
  public async pruneBuildData(options: {
    mode: "ONLY_SPECIFIED_BUILD" | "ALL_EXCEPT_CURRENT";
    targetBuildPass?: string;
  }): Promise<{ deletedBuildPasses: string[] }> {
    const cache = this.loadLocalCache();
    const deletedSet = new Set<string>();

    const shouldDelete = (buildPass: string): boolean => {
      if (options.mode === "ALL_EXCEPT_CURRENT") {
        return buildPass !== CURRENT_BUILD_PASS;
      }
      return buildPass === options.targetBuildPass;
    };

    for (const [sid, s] of Object.entries(cache.sessionsById)) {
      if (shouldDelete(s.build_pass)) {
        deletedSet.add(s.build_pass);
        delete cache.sessionsById[sid];
      }
    }
    cache.humanRaces = cache.humanRaces.filter((r) => {
      if (shouldDelete(r.build_pass)) {
        deletedSet.add(r.build_pass);
        return false;
      }
      return true;
    });
    for (const [key, a] of Object.entries(cache.aiLabByKey)) {
      if (shouldDelete(a.build_pass)) {
        deletedSet.add(a.build_pass);
        delete cache.aiLabByKey[key];
      }
    }
    this.writeLocalCache(cache);

    if (this.supabase && this.supabaseTablesReady) {
      try {
        if (options.mode === "ALL_EXCEPT_CURRENT") {
          await Promise.all([
            this.supabase
              .from("gutsy_analytics_sessions")
              .delete()
              .neq("build_pass", CURRENT_BUILD_PASS),
            this.supabase
              .from("gutsy_analytics_races")
              .delete()
              .neq("build_pass", CURRENT_BUILD_PASS),
            this.supabase
              .from("gutsy_analytics_ai_lab")
              .delete()
              .neq("build_pass", CURRENT_BUILD_PASS),
          ]);
        } else if (options.targetBuildPass) {
          deletedSet.add(options.targetBuildPass);
          await Promise.all([
            this.supabase
              .from("gutsy_analytics_sessions")
              .delete()
              .eq("build_pass", options.targetBuildPass),
            this.supabase
              .from("gutsy_analytics_races")
              .delete()
              .eq("build_pass", options.targetBuildPass),
            this.supabase
              .from("gutsy_analytics_ai_lab")
              .delete()
              .eq("build_pass", options.targetBuildPass),
          ]);
        }
      } catch {
        // Ignore network errors
      }
    }

    return { deletedBuildPasses: Array.from(deletedSet) };
  }
}

export const globalAnalytics = new AnalyticsTracker();
