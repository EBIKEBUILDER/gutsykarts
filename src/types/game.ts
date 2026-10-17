export type ArchetypeClass =
  | "SUPER_HEAVY"
  | "BALANCED"
  | "TECHNICAL"
  | "FEATHERWEIGHT";

export type KartBodyStyle = "TANK" | "FORMULA" | "COUPE" | "BUGGY";

export interface KartStatModifiers {
  massDelta: number;
  topSpeedDelta: number;
  accelerationDelta: number;
  handlingDelta: number;
  driftGripDelta: number;
}

export interface KartChassisConfig {
  id: string;
  name: string;
  tagline: string;
  bodyStyle: KartBodyStyle;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  wheelScale: number;
  chassisWidth: number;
  chassisLength: number;
  dualRearTires?: boolean;
  spikedBumper?: boolean;
  statModifiers: KartStatModifiers;
}

export interface CharacterProfile {
  id: string;
  name: string;
  title: string;
  archetypeLabel: string;
  archetypeClass: ArchetypeClass;
  bio: string;
  mass: number;
  topSpeed: number;
  offRoadTopSpeed: number;
  acceleration: number;
  handling: number;
  driftGrip: number;
  miniTurboDurationBonus: number;
  miniTurboDurationSec?: number;
  baseDriftSlipAngleDeg?: number;
  driftSteerInRatio?: number;
  driftSteerOutRatio?: number;
  defaultKartId: string;
  signatureKartId: string;
  availableKartIds: string[];
  unlockedKartIds: string[];
  colors: {
    suit: string;
    helmet: string;
    visor: string;
    skin: string;
    badge: string;
  };
}

export interface ResolvedRacerStats {
  character: CharacterProfile;
  kart: KartChassisConfig;
  baseMass: number;
  topSpeed: number;
  offRoadTopSpeed: number;
  acceleration: number;
  handling: number;
  driftGrip: number;
  miniTurboDurationBonus: number;
  miniTurboDurationSec: number;
  baseDriftSlipAngleDeg: number;
  driftSteerInRatio: number;
  driftSteerOutRatio: number;
}

export type SurfaceType = "PAVEMENT" | "CURB" | "OFFROAD";

export type DriftState = "NONE" | "HOPPING" | "DRIFT_ACTIVE";

/**
 * 5-Phase Manual Powerslide Alternation State Machine:
 * 0 = GRAY_SMOKE (Initial drift on landing, waiting for 1st Outside steer)
 * 1 = PUMP_1_OUTSIDE (1st Outside steer held >= 3 frames, waiting for 1st Inside steer)
 * 2 = BLUE_SPARKS (1st Inside steer held >= 3 frames -> Blue Sparks flash, waiting for 2nd Outside steer)
 * 3 = PUMP_2_OUTSIDE (2nd Outside steer held >= 3 frames, waiting for 2nd Inside steer)
 * 4 = ORANGE_SPARKS (2nd Inside steer held >= 3 frames -> Continuous Orange/Red Sparks, Mini-Turbo Ready!)
 */
export type DriftChargeSubState = 0 | 1 | 2 | 3 | 4;

export type MiniTurboTier = 0 | 1 | 2 | 3;

export type PowerUpType =
  | "NITRO_CORE"
  | "PULSE_SEEKER"
  | "RICOCHET_DISC"
  | "CRYO_MINE"
  | "NOVA_OVERDRIVE"
  | "LIL_SAUCER"
  | "GLITCH_PRISM";

export interface PowerUpMetadata {
  id: PowerUpType;
  name: string;
  shortLabel: string;
  description: string;
  color: string;
  accentColor: string;
}

export interface ControlInputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  driftHeld: boolean; // Jump/Hop/Drift button held
  hopJustPressed: boolean; // Rising edge of Jump/Hop/Drift button
  useItemJustPressed: boolean; // Rising edge of Power-Up button
}

export type RacerControlMode = "LOCAL_HUMAN" | "REMOTE_HUMAN" | "AI";

export interface RacerStanding {
  racerId: string;
  characterId: string;
  characterName?: string;
  name: string;
  kartName: string;
  isPlayer: boolean;
  isRemoteHuman?: boolean;
  ownerPeerId?: string | null;
  slotIndex?: number;
  controllerLabel?: "YOU" | "ONLINE" | "AI";
  mass: number;
  effectiveMass: number;
  rank: number;
  lap: number;
  finished: boolean;
  finishTimeMs: number | null;
  lapTimesMs: number[];
  totalProgressDistance: number;
  normalizedSplineT: number;
  worldX: number;
  worldZ: number;
  color: string;
  archetypeClass: ArchetypeClass;
}

export interface AsymmetricCollisionReport {
  timestamp: number;
  heavyRacerId: string;
  lightRacerId: string;
  heavyName: string;
  lightName: string;
  heavyMass: number;
  lightMass: number;
  alphaLight: number;
  alphaHeavy: number;
  heavySpeedDeltaPct: number;
  lightKnockbackSpeed: number;
  isJuggernautOverride: boolean;
}

export type CameraMode = "CHASE" | "DYNAMIC_WIDE" | "HOOD";

export type AiDifficulty = "EASY" | "MEDIUM" | "HARD" | "SELF_LEARNING";

export interface AiPolicyWeights {
  lookAheadBase: number;
  lookAheadCurve: number;
  lookAheadDrift: number;
  apexCutRatio: number;
  driftCutRatio: number;
  steerGain: number;
  driftEntryThreshold: number;
  preferredChargeSec: number;
  maxHoldChargeSec: number;
  driftAngleGain: number;
  driftLatGain: number;
  driftVelDamping: number;
  insideApexTarget: number;
  exitTangentAlignBlend: number;
  padSeekWeight: number;
  neuralBias: number[];
}

export interface AiPolicyGenome {
  id: string;
  name: string;
  generation: number;
  parentId: string | null;
  fitness: number;
  bestLapMs: number | null;
  bestRaceMs: number | null;
  pavementPct: number;
  pingPongCount: number;
  miniTurbosFired: number;
  weights: AiPolicyWeights;
  updatedAt: number;
}

export interface AiPathSample {
  x: number;
  z: number;
  normT: number;
  signedLat: number;
  speedRatio: number;
  surface: SurfaceType;
  driftState: DriftState;
  miniTurboTier: MiniTurboTier;
  boosting: boolean;
}

export interface AiRacerTelemetrySummary {
  racerId: string;
  slotIndex: number;
  racerName: string;
  characterId: string;
  color: string;
  genomeId: string;
  genomeName: string;
  generation: number;
  pavementPct: number;
  curbPct: number;
  offRoadPct: number;
  boostedOffRoadPct: number;
  unboostedOffRoadPct: number;
  rmsLateralOffset: number;
  avgSpeed: number;
  topSpeedRatioPct: number;
  driftsInitiated: number;
  miniTurbosFired: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  abortedDrifts: number;
  pingPongCrossings: number;
  wallHits: number;
  jumpsCount: number;
  maxJumpHeightMeters: number;
  airTimePct: number;
  collisionsGiven: number;
  collisionsTaken: number;
  lapsCompleted: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  fitnessScore: number;
  pathSamples: AiPathSample[];
}

export interface AiCharacterBalanceStat {
  characterId: string;
  characterName: string;
  archetypeClass: ArchetypeClass;
  color: string;
  racesCompleted: number;
  wins: number;
  winRatePct: number;
  avgFinishRank: number;
  avgLapMs: number | null;
  avgLap1Ms: number | null;
  avgFlyingLapMs: number | null;
  bestLapMs: number | null;
  avgSpeed: number;
  avgTopSpeedRatioPct: number;
  avgOnTrackPct: number;
  avgOffRoadPct: number;
  avgBoostedCutPct: number;
  avgPingPongs: number;
  avgMiniTurbosPerRace: number;
  avgShovesPerRace: number;
  avgHitsTakenPerRace: number;
  avgJumpsPerRace: number;
  avgMaxJumpHeightMeters: number;
  peakJumpHeightMeters: number;
  paceDeltaPct: number;
  suggestedTopSpeedDelta: number;
  suggestedAccelDelta: number;
  suggestedMtBonusDelta: number;
  recommendation: string;
}

export interface AiTrainingLabTelemetry {
  difficulty: AiDifficulty;
  generation: number;
  episodesCompleted: number;
  itemsEnabled: boolean;
  autoBalanceRosterEnabled: boolean;
  trainingTrackMode: "ROTATE_CUP" | "ALL_CUPS" | "SINGLE_TRACK";
  championFitness: number;
  championBestLapMs: number | null;
  baselineFitness: number | null;
  baselinePavementPct: number | null;
  baselinePingPongs: number | null;
  baselineAvgSpeed: number | null;
  fleetAvgPavementPct: number;
  fleetAvgOffRoadPct: number;
  fleetAvgSpeed: number;
  fleetTotalMiniTurbos: number;
  fleetTotalPingPongs: number;
  fleetAvgFitness: number;
  savedPresetSlots: Record<
    "EASY" | "MEDIUM" | "HARD",
    {
      savedAt: number;
      generation: number;
      fitness: number;
      bestLapMs: number | null;
    } | null
  >;
  useTrainedPresets: Record<"EASY" | "MEDIUM" | "HARD", boolean>;
  racers: AiRacerTelemetrySummary[];
  characterBalance: AiCharacterBalanceStat[];
}

export interface HudMultiplayerStatus {
  active: boolean;
  roomId: string;
  isHost: boolean;
  isDedicatedServer: boolean;
  isSpectating: boolean;
  spectatedSlotIndex: number;
  spectatedRacerName: string;
  spectateAutoDirector: boolean;
  autoAdvanceEnabled: boolean;
  autoAdvanceSecondsLeft: number | null;
  hostName: string;
  localSlotIndex: number;
  humanCount: number;
  aiCount: number;
  transportLabel: string;
}

export interface HudTelemetry {
  racePhase: "COUNTDOWN" | "RACING" | "FINISHED";
  countdownValue: number;
  elapsedRaceMs: number;
  rank: number;
  lap: number;
  totalLaps: number;
  speed: number;
  maxSpeed: number;
  surface: SurfaceType;
  distToCenter: number;
  driftState: DriftState;
  driftDirection: -1 | 0 | 1;
  driftChargeSeconds: number;
  driftChargeSubState?: DriftChargeSubState;
  miniTurboTier: MiniTurboTier;
  activeBoostLabel: string | null;
  prolongedRocketBoostActive?: boolean;
  heldItem: PowerUpType | null;
  rouletteSpinning: boolean;
  roulettePreviewItem: PowerUpType | null;
  novaOverdriveRemaining: number;
  cameraMode: CameraMode;
  standings: RacerStanding[];
  lastCollisionBanner: string | null;
  lastItemBanner: string | null;
  wrongWay: boolean;
  spinOutActive?: boolean;
  multiplayer?: HudMultiplayerStatus;
  aiLab?: AiTrainingLabTelemetry;
}

export type ObstaclePrefabType =
  | "PYLON_CONE"
  | "OIL_SLICK"
  | "BARRIER_CRATE"
  | "JUMP_RAMP";

export type SceneryPrefabType =
  | "PINE_TREE"
  | "OAK_TREE"
  | "BOULDER"
  | "GRANDSTAND"
  | "SUBURBAN_HOUSE"
  | "LAMP_POST";

export interface PlacedBoostPad {
  id: string;
  normT: number;
  lateral: number;
}

export interface PlacedItemBoxRow {
  id: string;
  normT: number;
}

export interface PlacedObstacle {
  id: string;
  type: ObstaclePrefabType;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

export interface PlacedSceneryProp {
  id: string;
  type: SceneryPrefabType;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  isManual?: boolean;
}

export interface TerrainSculptMod {
  id: string;
  x: number;
  z: number;
  radius: number;
  deltaY: number;
}

export interface CustomTrackDefinition {
  id?: string;
  cupId?: string;
  name: string;
  description?: string;
  roadHalfWidth: number;
  controlPoints: Array<{ x: number; y: number; z: number }>;
  boostPads: PlacedBoostPad[];
  itemBoxRows: PlacedItemBoxRow[];
  obstacles: PlacedObstacle[];
  sceneryProps: PlacedSceneryProp[];
  autoTracksideScenery?: boolean;
  sceneryDensity?: number;
  scenerySeed?: number;
  terrainHillScale?: number;
  terrainMods?: TerrainSculptMod[];
  isUserModified?: boolean;
  authorName?: string;
  updatedAt?: number;
}

export interface GrandPrixCupDefinition {
  id: string;
  name: string;
  subtitle: string;
  badgeColor: string;
  tracks: CustomTrackDefinition[];
  isCustomCup?: boolean;
  authorName?: string;
  updatedAt?: number;
}

export interface CupStandingEntry {
  racerId: string;
  characterId: string;
  characterName?: string;
  name: string;
  kartName: string;
  isPlayer: boolean;
  isRemoteHuman?: boolean;
  slotIndex?: number;
  controllerLabel?: "YOU" | "ONLINE" | "AI";
  color: string;
  mass: number;
  points: number;
  lastRacePoints: number;
  lastRaceRank: number;
  finishTimeMs?: number | null;
  lapTimesMs?: number[];
  isProjectedTime?: boolean;
  isNewBestRace?: boolean;
  isNewBestLap?: boolean;
}

export interface RacerTrackTimeRecord {
  characterId: string;
  racerName: string;
  kartName: string;
  bestRaceTimeMs: number | null;
  bestLapTimeMs: number | null;
  bestLapSplitsMs: number[];
  updatedAt: number;
}

export interface TrackTimingRecord {
  trackId: string;
  trackName: string;
  bestRaceTimeMs: number | null;
  bestRaceHolderName: string | null;
  bestRaceKartName: string | null;
  bestLapTimeMs: number | null;
  bestLapHolderName: string | null;
  bestLapKartName: string | null;
  racerRecords: Record<string, RacerTrackTimeRecord>;
}

// ============================================================================
// MULTIPLAYER & NETWORKING TYPES (Supabase Realtime + WebRTC + Local Fallback)
// ============================================================================

export type NetworkBackendStatus =
  | "SUPABASE_ONLINE"
  | "CONNECTING"
  | "LOCAL_FALLBACK";

export interface OnlinePlayerPresence {
  peerId: string;
  playerName: string;
  characterId: string;
  kartId: string;
  status: "LOBBY" | "HOSTING" | "DEDICATED_HOST" | "RACING";
  roomId: string | null;
  roomTrackName?: string;
  updatedAt: number;
}

export interface OnlineRoomSummary {
  roomId: string;
  hostPeerId: string;
  hostName: string;
  isDedicatedServer?: boolean;
  cupId: string;
  cupName?: string;
  trackIdx: number;
  trackName: string;
  isCustomTrack?: boolean;
  racePhase: "COUNTDOWN" | "RACING" | "FINISHED";
  currentLap: number;
  totalLaps: number;
  humanCount: number;
  maxSlots: number;
  aiSlotCount: number;
  aiDifficulty: AiDifficulty;
  slotSummaries: Array<{
    slotIndex: number;
    isHuman: boolean;
    playerName: string;
    characterId: string;
    kartId: string;
  }>;
  updatedAt: number;
}

export interface RoomPeerEntry {
  peerId: string;
  playerName: string;
  characterId: string;
  kartId: string;
  slotIndex: number;
  joinedAt: number;
}

export interface KartNetState {
  slotIndex: number;
  controlMode: "HUMAN" | "AI";
  ownerPeerId: string | null;
  playerName: string;
  characterId: string;
  kartId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  kx: number;
  kz: number;
  headingYaw: number;
  forwardSpeed: number;
  verticalVelocity: number;
  grounded: boolean;
  surface: SurfaceType;
  driftState: DriftState;
  driftDirection: -1 | 0 | 1;
  driftChargeSeconds: number;
  driftChargeSubState?: DriftChargeSubState;
  miniTurboTier: MiniTurboTier;
  boostTimer: number;
  boostMultiplier: number;
  activeBoostLabel: string | null;
  nitroBoostTimer: number;
  novaOverdriveTimer: number;
  spinOutTimer: number;
  wobbleTimer: number;
  heldItem: PowerUpType | null;
  rouletteTimer: number;
  lap: number;
  maxLapReached: number;
  checkpointsMask: number;
  lastNormalizedT: number;
  totalProgressDistance: number;
  finished: boolean;
  finishTimeMs: number | null;
  lapStartElapsedMs?: number;
  lapTimesMs?: number[];
  rank: number;
}

export interface WelcomeSnapshotPayload {
  roomId: string;
  hostPeerId: string;
  assignedSlotIndex: number;
  cupId: string;
  trackIdx: number;
  trackDef: CustomTrackDefinition;
  cupDef?: GrandPrixCupDefinition;
  aiDifficulty: AiDifficulty;
  racePhase: "COUNTDOWN" | "RACING" | "FINISHED";
  countdownRemaining: number;
  elapsedRaceMs: number;
  slots: KartNetState[];
  boxRespawnTimers: Record<string, number>;
  peers: RoomPeerEntry[];
}

export interface SlotTakeoverPayload {
  roomId: string;
  slotIndex: number;
  controlMode: "HUMAN" | "AI";
  ownerPeerId: string | null;
  playerName: string;
  characterId: string;
  kartId: string;
  peers: RoomPeerEntry[];
  bannerMessage: string;
  slotState?: KartNetState;
}

export interface NetCollisionImpulsePayload {
  targetSlotIndex: number;
  heavySlotIndex: number;
  kx: number;
  kz: number;
  vx: number;
  vz: number;
  forwardSpeed: number;
  verticalVelocity: number;
  wobbleTimer: number;
  report: AsymmetricCollisionReport;
}

export interface NetItemActivatePayload {
  slotIndex: number;
  item: PowerUpType;
}

export interface NetItemBoxPickupPayload {
  boxId: string;
  slotIndex: number;
  awardedItem: PowerUpType | null;
}
