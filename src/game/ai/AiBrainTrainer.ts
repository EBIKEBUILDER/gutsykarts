import {
  AiCharacterBalanceStat,
  AiDifficulty,
  AiPathSample,
  AiPolicyGenome,
  AiPolicyWeights,
  AiRacerTelemetrySummary,
  AiTrainingLabTelemetry,
  ArchetypeClass,
  AsymmetricCollisionReport,
  DriftState,
  MiniTurboTier,
  ResolvedRacerStats,
  SurfaceType,
} from "@/src/types/game";
import {
  BUILD_INFO_STAMP,
  ROSTER_BALANCE_PASS,
} from "@/src/game/data/roster";

const STORAGE_KEY = "gutsy_karts_ai_brain_v1";
const TRACES_STORAGE_KEY = "gutsy_karts_ai_track_traces_v1";

export interface StoredTrackAiTrace {
  racerId: string;
  slotIndex: number;
  racerName: string;
  characterId: string;
  color: string;
  pathSamples: AiPathSample[];
}

export const DEFAULT_POLICY_WEIGHTS: Record<
  "EASY" | "MEDIUM" | "HARD" | "SELF_LEARNING",
  AiPolicyWeights
> = {
  EASY: {
    lookAheadBase: 21.5,
    lookAheadCurve: 14.5,
    lookAheadDrift: 15.8,
    apexCutRatio: 0.19,
    driftCutRatio: 0.2,
    steerGain: 2.15,
    driftEntryThreshold: 0.19,
    preferredChargeSec: 1.25,
    maxHoldChargeSec: 1.95,
    driftAngleGain: 2.331,
    driftLatGain: 2.012,
    driftVelDamping: 2.565,
    insideApexTarget: 0.18,
    exitTangentAlignBlend: 0.62,
    padSeekWeight: 0.32,
    itemSeekWeight: 0.25,
    juggernautAvoidanceWeight: 0.45,
    itemHoldPatience: 1.4,
    preemptiveDriftLeadMeters: 20.0,
    chainDriftWeight: 0.0,
    offRoadDriftRecoveryWeight: 0.15,
    neuralBias: [
      -0.2809,
      0.231,
      -0.0123,
      -0.126,
      0.0021,
      -0.1437,
      -0.0329,
      -0.0514,
    ],
  },
  MEDIUM: {
    lookAheadBase: 19.6,
    lookAheadCurve: 13.9,
    lookAheadDrift: 16.8,
    apexCutRatio: 0.31,
    driftCutRatio: 0.19,
    steerGain: 2.52,
    driftEntryThreshold: 0.178,
    preferredChargeSec: 2.45,
    maxHoldChargeSec: 3.55,
    driftAngleGain: 2.15,
    driftLatGain: 2.38,
    driftVelDamping: 2.42,
    insideApexTarget: 0.28,
    exitTangentAlignBlend: 0.61,
    padSeekWeight: 0.32,
    itemSeekWeight: 0.65,
    juggernautAvoidanceWeight: 0.78,
    itemHoldPatience: 0.62,
    preemptiveDriftLeadMeters: 30.0,
    chainDriftWeight: 0.22,
    offRoadDriftRecoveryWeight: 0.65,
    neuralBias: [
      -0.2532,
      0.3459,
      -0.1021,
      0.1509,
      -0.2154,
      -0.0733,
      -0.223,
      -0.2145,
    ],
  },
  HARD: {
    lookAheadBase: 18.77,
    lookAheadCurve: 13.77,
    lookAheadDrift: 18.48,
    apexCutRatio: 0.404,
    driftCutRatio: 0.147,
    steerGain: 2.787,
    driftEntryThreshold: 0.179,
    preferredChargeSec: 2.53,
    maxHoldChargeSec: 3.81,
    driftAngleGain: 2.111,
    driftLatGain: 2.508,
    driftVelDamping: 2.401,
    insideApexTarget: 0.359,
    exitTangentAlignBlend: 0.623,
    padSeekWeight: 0.265,
    itemSeekWeight: 0.793,
    juggernautAvoidanceWeight: 0.746,
    itemHoldPatience: 0.425,
    preemptiveDriftLeadMeters: 38.0,
    chainDriftWeight: 0.45,
    offRoadDriftRecoveryWeight: 0.88,
    neuralBias: [
      -0.2532,
      0.3459,
      -0.1021,
      0.1509,
      -0.2154,
      -0.0733,
      -0.223,
      -0.2145,
    ],
  },
  SELF_LEARNING: {
    lookAheadBase: 18.77,
    lookAheadCurve: 13.77,
    lookAheadDrift: 18.48,
    apexCutRatio: 0.404,
    driftCutRatio: 0.147,
    steerGain: 2.787,
    driftEntryThreshold: 0.179,
    preferredChargeSec: 2.53,
    maxHoldChargeSec: 3.81,
    driftAngleGain: 2.111,
    driftLatGain: 2.508,
    driftVelDamping: 2.401,
    insideApexTarget: 0.359,
    exitTangentAlignBlend: 0.623,
    padSeekWeight: 0.265,
    itemSeekWeight: 0.793,
    juggernautAvoidanceWeight: 0.746,
    itemHoldPatience: 0.425,
    preemptiveDriftLeadMeters: 38.0,
    chainDriftWeight: 0.45,
    offRoadDriftRecoveryWeight: 0.88,
    neuralBias: [
      -0.2532,
      0.3459,
      -0.1021,
      0.1509,
      -0.2154,
      -0.0733,
      -0.223,
      -0.2145,
    ],
  },
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function cloneWeights(w: AiPolicyWeights): AiPolicyWeights {
  return {
    ...w,
    itemSeekWeight: w.itemSeekWeight ?? 0.793,
    juggernautAvoidanceWeight: w.juggernautAvoidanceWeight ?? 0.746,
    itemHoldPatience: w.itemHoldPatience ?? 0.425,
    preemptiveDriftLeadMeters: w.preemptiveDriftLeadMeters ?? 38.0,
    chainDriftWeight: w.chainDriftWeight ?? 0.45,
    offRoadDriftRecoveryWeight: w.offRoadDriftRecoveryWeight ?? 0.88,
    neuralBias: Array.isArray(w.neuralBias)
      ? [...w.neuralBias]
      : [0, 0, 0, 0, 0, 0, 0, 0],
  };
}

function createGenome(
  id: string,
  name: string,
  generation: number,
  weights: AiPolicyWeights,
  parentId: string | null = null
): AiPolicyGenome {
  return {
    id,
    name,
    generation,
    parentId,
    fitness: 0,
    bestLapMs: null,
    bestRaceMs: null,
    pavementPct: 0,
    pingPongCount: 0,
    miniTurbosFired: 0,
    weights: cloneWeights(weights),
    updatedAt: Date.now(),
  };
}

function gaussianNoise(): number {
  const u1 = Math.max(1e-6, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export function mutatePolicyWeights(
  base: AiPolicyWeights,
  mutationScale = 1.0
): AiPolicyWeights {
  const n = () => gaussianNoise() * mutationScale;
  const bias = (base.neuralBias ?? [0, 0, 0, 0, 0, 0, 0, 0]).map((b) =>
    clamp(Number((b + n() * 0.045).toFixed(4)), -0.35, 0.35)
  );
  const preferredChargeSec = clamp(
    Number((base.preferredChargeSec + n() * 0.18).toFixed(2)),
    2.45,
    3.95
  );
  const maxHoldChargeSec = clamp(
    Number((base.maxHoldChargeSec + n() * 0.22).toFixed(2)),
    Math.max(2.9, Number((preferredChargeSec + 0.45).toFixed(2))),
    5.2
  );
  return {
    lookAheadBase: clamp(
      Number((base.lookAheadBase + n() * 1.1).toFixed(2)),
      15.5,
      28.0
    ),
    lookAheadCurve: clamp(
      Number((base.lookAheadCurve + n() * 0.9).toFixed(2)),
      11.5,
      22.0
    ),
    lookAheadDrift: clamp(
      Number((base.lookAheadDrift + n() * 0.9).toFixed(2)),
      13.0,
      23.0
    ),
    apexCutRatio: clamp(
      Number((base.apexCutRatio + n() * 0.035).toFixed(3)),
      0.12,
      0.56
    ),
    driftCutRatio: clamp(
      Number((base.driftCutRatio + n() * 0.03).toFixed(3)),
      0.14,
      0.44
    ),
    steerGain: clamp(
      Number((base.steerGain + n() * 0.1).toFixed(3)),
      1.55,
      2.85
    ),
    driftEntryThreshold: clamp(
      Number((base.driftEntryThreshold + n() * 0.01).toFixed(3)),
      0.075,
      0.2
    ),
    preferredChargeSec,
    maxHoldChargeSec,
    driftAngleGain: clamp(
      Number((base.driftAngleGain + n() * 0.12).toFixed(3)),
      1.7,
      3.3
    ),
    driftLatGain: clamp(
      Number((base.driftLatGain + n() * 0.12).toFixed(3)),
      1.2,
      2.9
    ),
    driftVelDamping: clamp(
      Number((base.driftVelDamping + n() * 0.12).toFixed(3)),
      1.1,
      2.7
    ),
    insideApexTarget: clamp(
      Number((base.insideApexTarget + n() * 0.025).toFixed(3)),
      0.06,
      0.36
    ),
    exitTangentAlignBlend: clamp(
      Number((base.exitTangentAlignBlend + n() * 0.04).toFixed(3)),
      0.42,
      0.88
    ),
    padSeekWeight: clamp(
      Number((base.padSeekWeight + n() * 0.05).toFixed(3)),
      0.2,
      0.92
    ),
    itemSeekWeight: clamp(
      Number(((base.itemSeekWeight ?? 0.54) + n() * 0.05).toFixed(3)),
      0.2,
      0.92
    ),
    juggernautAvoidanceWeight: clamp(
      Number(
        ((base.juggernautAvoidanceWeight ?? 1.05) + n() * 0.08).toFixed(3)
      ),
      0.35,
      1.85
    ),
    itemHoldPatience: clamp(
      Number(((base.itemHoldPatience ?? 0.425) + n() * 0.06).toFixed(3)),
      0.32,
      1.65
    ),
    preemptiveDriftLeadMeters: clamp(
      Number(
        ((base.preemptiveDriftLeadMeters ?? 38.0) + n() * 2.2).toFixed(2)
      ),
      18.0,
      58.0
    ),
    chainDriftWeight: clamp(
      Number(((base.chainDriftWeight ?? 0.45) + n() * 0.065).toFixed(3)),
      0.0,
      0.95
    ),
    offRoadDriftRecoveryWeight: clamp(
      Number(
        ((base.offRoadDriftRecoveryWeight ?? 0.88) + n() * 0.05).toFixed(3)
      ),
      0.15,
      1.0
    ),
    neuralBias: bias,
  };
}

export function crossoverPolicyWeights(
  parentA: AiPolicyWeights,
  parentB: AiPolicyWeights
): AiPolicyWeights {
  const pick = (a: number, b: number) =>
    Math.random() < 0.65 ? a : 0.5 * (a + b);
  const biasA = parentA.neuralBias ?? [0, 0, 0, 0, 0, 0, 0, 0];
  const biasB = parentB.neuralBias ?? [0, 0, 0, 0, 0, 0, 0, 0];
  return {
    lookAheadBase: pick(parentA.lookAheadBase, parentB.lookAheadBase),
    lookAheadCurve: pick(parentA.lookAheadCurve, parentB.lookAheadCurve),
    lookAheadDrift: pick(parentA.lookAheadDrift, parentB.lookAheadDrift),
    apexCutRatio: pick(parentA.apexCutRatio, parentB.apexCutRatio),
    driftCutRatio: pick(parentA.driftCutRatio, parentB.driftCutRatio),
    steerGain: pick(parentA.steerGain, parentB.steerGain),
    driftEntryThreshold: pick(
      parentA.driftEntryThreshold,
      parentB.driftEntryThreshold
    ),
    preferredChargeSec: pick(
      parentA.preferredChargeSec,
      parentB.preferredChargeSec
    ),
    maxHoldChargeSec: pick(parentA.maxHoldChargeSec, parentB.maxHoldChargeSec),
    driftAngleGain: pick(parentA.driftAngleGain, parentB.driftAngleGain),
    driftLatGain: pick(parentA.driftLatGain, parentB.driftLatGain),
    driftVelDamping: pick(parentA.driftVelDamping, parentB.driftVelDamping),
    insideApexTarget: pick(parentA.insideApexTarget, parentB.insideApexTarget),
    exitTangentAlignBlend: pick(
      parentA.exitTangentAlignBlend,
      parentB.exitTangentAlignBlend
    ),
    padSeekWeight: pick(parentA.padSeekWeight, parentB.padSeekWeight),
    itemSeekWeight: pick(
      parentA.itemSeekWeight ?? 0.793,
      parentB.itemSeekWeight ?? 0.793
    ),
    juggernautAvoidanceWeight: pick(
      parentA.juggernautAvoidanceWeight ?? 0.746,
      parentB.juggernautAvoidanceWeight ?? 0.746
    ),
    itemHoldPatience: pick(
      parentA.itemHoldPatience ?? 0.425,
      parentB.itemHoldPatience ?? 0.425
    ),
    preemptiveDriftLeadMeters: pick(
      parentA.preemptiveDriftLeadMeters ?? 38.0,
      parentB.preemptiveDriftLeadMeters ?? 38.0
    ),
    chainDriftWeight: pick(
      parentA.chainDriftWeight ?? 0.45,
      parentB.chainDriftWeight ?? 0.45
    ),
    offRoadDriftRecoveryWeight: pick(
      parentA.offRoadDriftRecoveryWeight ?? 0.88,
      parentB.offRoadDriftRecoveryWeight ?? 0.88
    ),
    neuralBias: biasA.map((val, i) => pick(val, biasB[i] ?? 0)),
  };
}

/**
 * Evaluates the 8-weight neural residual steering correction from normalized track/kart sensors.
 */
export function evaluateNeuralResidualSteer(
  weights: AiPolicyWeights,
  sensors: {
    angleError: number;
    signedLatRatio: number;
    latVelRatio: number;
    nearTurnRight: number;
    midTurnRight: number;
    speedRatio: number;
    driftDir: number;
    handlingNorm: number;
  }
): number {
  const b = weights.neuralBias;
  if (!b || b.length < 8) return 0;
  const raw =
    b[0] * sensors.angleError +
    b[1] * sensors.signedLatRatio +
    b[2] * sensors.latVelRatio +
    b[3] * sensors.nearTurnRight +
    b[4] * sensors.midTurnRight +
    b[5] * (sensors.speedRatio - 0.85) +
    b[6] * sensors.driftDir * sensors.signedLatRatio +
    b[7] * sensors.handlingNorm * sensors.signedLatRatio;
  return Math.tanh(raw) * 0.22;
}

interface RacerTelemetryAccumulator {
  racerId: string;
  slotIndex: number;
  racerName: string;
  characterId: string;
  color: string;
  genomeId: string;
  genomeName: string;
  generation: number;
  totalTimeSec: number;
  pavementSec: number;
  curbSec: number;
  offRoadSec: number;
  boostedOffRoadSec: number;
  unboostedOffRoadSec: number;
  sumSqLatOffset: number;
  sumSpeedWeighted: number;
  sumTopSpeedRatioWeighted: number;
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
  airTimeSec: number;
  currentlyInJump: boolean;
  collisionsGiven: number;
  collisionsTaken: number;
  itemsUsed: number;
  itemHitsLanded: number;
  shortcutBoostsUsed: number;
  defensiveBlocks: number;
  lastExtremeSide: -1 | 0 | 1;
  lastExtremeTimeSec: number;
  wallHitCooldownSec: number;
  sampleTimerSec: number;
  lapsCompleted: number;
  bestLapMs: number | null;
  lastLapMs: number | null;
  pathSamples: AiPathSample[];
}

interface PersistentCharacterBalance {
  characterId: string;
  characterName: string;
  archetypeClass: ArchetypeClass;
  color: string;
  racesCompleted: number;
  wins: number;
  rankSum: number;
  lapTimeSumMs: number;
  lapCount: number;
  lap1TimeSumMs: number;
  lap1Count: number;
  flyingLapTimeSumMs: number;
  flyingLapCount: number;
  bestLapMs: number | null;
  speedSum: number;
  topSpeedRatioSum: number;
  onTrackPctSum: number;
  offRoadPctSum: number;
  boostedCutPctSum: number;
  pingPongSum: number;
  miniTurbosSum: number;
  shovesGivenSum: number;
  hitsTakenSum: number;
  jumpsSum: number;
  maxJumpHeightSum: number;
  peakJumpHeightMeters: number;
}

const DEFAULT_CHARACTER_META: Array<{
  characterId: string;
  characterName: string;
  archetypeClass: ArchetypeClass;
  color: string;
}> = [
  {
    characterId: "rex_ironclad",
    characterName: "Rex Ironclad",
    archetypeClass: "SUPER_HEAVY",
    color: "#ef4444",
  },
  {
    characterId: "aero_vance",
    characterName: "Aero Vance",
    archetypeClass: "BALANCED",
    color: "#3b82f6",
  },
  {
    characterId: "nyx_drift",
    characterName: "Nyx Veloce",
    archetypeClass: "TECHNICAL",
    color: "#d946ef",
  },
  {
    characterId: "pip_spark",
    characterName: "Pip Spark",
    archetypeClass: "FEATHERWEIGHT",
    color: "#facc15",
  },
];

interface PersistedBrainState {
  version: number;
  rosterBalancePass?: string;
  generation: number;
  episodesCompleted: number;
  itemsEnabled?: boolean;
  autoBalanceRosterEnabled?: boolean;
  trainingTrackMode?: "ROTATE_CUP" | "ALL_CUPS" | "SINGLE_TRACK";
  championGenome: AiPolicyGenome;
  population: AiPolicyGenome[];
  baselineMetrics: {
    fitness: number;
    pavementPct: number;
    pingPongs: number;
    avgSpeed: number;
  } | null;
  savedPresets: Record<"EASY" | "MEDIUM" | "HARD", AiPolicyGenome | null>;
  useTrainedPresets: Record<"EASY" | "MEDIUM" | "HARD", boolean>;
  characterStats?: Record<string, PersistentCharacterBalance>;
}

export class AiBrainManager {
  private generation = 15992;
  private episodesCompleted = 15991;
  private itemsEnabled = true;
  private autoBalanceRosterEnabled = false;
  private trainingTrackMode: "ROTATE_CUP" | "ALL_CUPS" | "SINGLE_TRACK" =
    "ALL_CUPS";
  private championGenome: AiPolicyGenome;
  private population: AiPolicyGenome[] = [];
  private baselineMetrics: {
    fitness: number;
    pavementPct: number;
    pingPongs: number;
    avgSpeed: number;
  } | null = null;
  private savedPresets: Record<
    "EASY" | "MEDIUM" | "HARD",
    AiPolicyGenome | null
  > = {
    EASY: null,
    MEDIUM: null,
    HARD: null,
  };
  private useTrainedPresets: Record<"EASY" | "MEDIUM" | "HARD", boolean> = {
    EASY: false,
    MEDIUM: false,
    HARD: false,
  };
  private characterStats: Record<string, PersistentCharacterBalance> = {};

  private accumulators = new Map<string, RacerTelemetryAccumulator>();
  private activeTrackId = "default_track";
  private trackTraces: Record<string, StoredTrackAiTrace[]> = {};

  private hydrated = false;

  constructor() {
    this.championGenome = createGenome(
      "gen15992_champ",
      "Gen-15992 Seed Ace",
      15992,
      DEFAULT_POLICY_WEIGHTS.SELF_LEARNING
    );
    this.championGenome.fitness = 100.0;
    this.championGenome.bestLapMs = 16580;
    this.championGenome.pavementPct = 99.0;
    const seed = DEFAULT_POLICY_WEIGHTS.SELF_LEARNING;
    this.population = [
      createGenome("g15992_slot0", "Alpha Policy (Apex)", 15992, seed),
      createGenome("g15992_slot1", "Beta Policy (Smooth)", 15992, seed, "g15992_slot0"),
      createGenome("g15992_slot2", "Gamma Policy (Charger)", 15992, seed, "g15992_slot0"),
      createGenome("g15992_slot3", "Delta Policy (Explorer)", 15992, seed, "g15992_slot0"),
    ];
    this.initDefaultCharacterStats();
  }

  private initDefaultCharacterStats(): void {
    this.characterStats = {};
    for (const meta of DEFAULT_CHARACTER_META) {
      this.characterStats[meta.characterId] = {
        ...meta,
        racesCompleted: 0,
        wins: 0,
        rankSum: 0,
        lapTimeSumMs: 0,
        lapCount: 0,
        lap1TimeSumMs: 0,
        lap1Count: 0,
        flyingLapTimeSumMs: 0,
        flyingLapCount: 0,
        bestLapMs: null,
        speedSum: 0,
        topSpeedRatioSum: 0,
        onTrackPctSum: 0,
        offRoadPctSum: 0,
        boostedCutPctSum: 0,
        pingPongSum: 0,
        miniTurbosSum: 0,
        shovesGivenSum: 0,
        hitsTakenSum: 0,
        jumpsSum: 0,
        maxJumpHeightSum: 0,
        peakJumpHeightMeters: 0,
      };
    }
  }

  private initDefaultPopulation(): void {
    const seed = DEFAULT_POLICY_WEIGHTS.SELF_LEARNING;
    this.population = [
      createGenome("g15992_slot0", "Alpha Policy (Apex)", 15992, seed),
      createGenome(
        "g15992_slot1",
        "Beta Policy (Smooth)",
        15992,
        mutatePolicyWeights(seed, 0.45),
        "g15992_slot0"
      ),
      createGenome(
        "g15992_slot2",
        "Gamma Policy (Charger)",
        15992,
        mutatePolicyWeights(seed, 0.55),
        "g15992_slot0"
      ),
      createGenome(
        "g15992_slot3",
        "Delta Policy (Explorer)",
        15992,
        mutatePolicyWeights(seed, 0.7),
        "g15992_slot0"
      ),
    ];
  }

  public hydrateFromStorage(): void {
    if (typeof window === "undefined") return;
    if (!this.hydrated) {
      this.hydrated = true;
      this.initDefaultPopulation();
    }
    try {
      const rawTraces = window.localStorage.getItem(TRACES_STORAGE_KEY);
      if (rawTraces) {
        const parsedTraces = JSON.parse(rawTraces) as Record<
          string,
          StoredTrackAiTrace[]
        >;
        if (parsedTraces && typeof parsedTraces === "object") {
          this.trackTraces = parsedTraces;
        }
      }
    } catch {
      // Ignore trace hydration errors
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedBrainState>;
      const storedGen =
        typeof parsed.generation === "number" ? parsed.generation : 0;
      if (storedGen >= 1) {
        this.generation = Math.max(this.generation, storedGen);
      }
      if (typeof parsed.episodesCompleted === "number") {
        this.episodesCompleted = Math.max(
          this.episodesCompleted,
          parsed.episodesCompleted
        );
      }
      if (typeof parsed.itemsEnabled === "boolean") {
        this.itemsEnabled = parsed.itemsEnabled;
      }
      if (typeof parsed.autoBalanceRosterEnabled === "boolean") {
        this.autoBalanceRosterEnabled = parsed.autoBalanceRosterEnabled;
      }
      if (
        parsed.trainingTrackMode === "ROTATE_CUP" ||
        parsed.trainingTrackMode === "ALL_CUPS" ||
        parsed.trainingTrackMode === "SINGLE_TRACK"
      ) {
        this.trainingTrackMode = parsed.trainingTrackMode;
      }
      if (
        storedGen >= 15992 &&
        parsed.championGenome &&
        parsed.championGenome.weights
      ) {
        const w = parsed.championGenome.weights;
        if (w.preferredChargeSec < 2.55) {
          w.preferredChargeSec = 2.95;
        }
        if (w.maxHoldChargeSec < w.preferredChargeSec + 0.45) {
          w.maxHoldChargeSec = Number((w.preferredChargeSec + 0.55).toFixed(2));
        }
        w.itemSeekWeight = w.itemSeekWeight ?? 0.793;
        w.juggernautAvoidanceWeight = w.juggernautAvoidanceWeight ?? 0.746;
        w.itemHoldPatience = w.itemHoldPatience ?? 0.425;
        w.preemptiveDriftLeadMeters = w.preemptiveDriftLeadMeters ?? 38.0;
        w.chainDriftWeight = w.chainDriftWeight ?? 0.45;
        w.offRoadDriftRecoveryWeight = w.offRoadDriftRecoveryWeight ?? 0.88;
        this.championGenome = parsed.championGenome;
      }
      if (
        storedGen >= 15992 &&
        Array.isArray(parsed.population) &&
        parsed.population.length >= 4
      ) {
        this.population = parsed.population.slice(0, 4).map((g) => {
          if (g?.weights) {
            if (g.weights.preferredChargeSec < 2.45) {
              g.weights.preferredChargeSec = 2.85;
            }
            if (g.weights.maxHoldChargeSec < g.weights.preferredChargeSec + 0.45) {
              g.weights.maxHoldChargeSec = Number(
                (g.weights.preferredChargeSec + 0.55).toFixed(2)
              );
            }
            g.weights.itemSeekWeight = g.weights.itemSeekWeight ?? 0.793;
            g.weights.juggernautAvoidanceWeight =
              g.weights.juggernautAvoidanceWeight ?? 0.746;
            g.weights.itemHoldPatience = g.weights.itemHoldPatience ?? 0.425;
            g.weights.preemptiveDriftLeadMeters =
              g.weights.preemptiveDriftLeadMeters ?? 38.0;
            g.weights.chainDriftWeight = g.weights.chainDriftWeight ?? 0.45;
            g.weights.offRoadDriftRecoveryWeight =
              g.weights.offRoadDriftRecoveryWeight ?? 0.88;
          }
          return g;
        });
      }
      if (parsed.baselineMetrics) {
        this.baselineMetrics = parsed.baselineMetrics;
      }
      if (parsed.savedPresets) {
        this.savedPresets = {
          EASY: parsed.savedPresets.EASY ?? null,
          MEDIUM: parsed.savedPresets.MEDIUM ?? null,
          HARD: parsed.savedPresets.HARD ?? null,
        };
      }
      if (parsed.useTrainedPresets) {
        this.useTrainedPresets = {
          EASY: Boolean(parsed.useTrainedPresets.EASY),
          MEDIUM: Boolean(parsed.useTrainedPresets.MEDIUM),
          HARD: Boolean(parsed.useTrainedPresets.HARD),
        };
      }
      if (
        parsed.characterStats &&
        parsed.rosterBalancePass === ROSTER_BALANCE_PASS
      ) {
        for (const meta of DEFAULT_CHARACTER_META) {
          const savedChar = parsed.characterStats[meta.characterId];
          if (savedChar && typeof savedChar.racesCompleted === "number") {
            this.characterStats[meta.characterId] = {
              ...this.characterStats[meta.characterId],
              ...savedChar,
            };
          }
        }
      } else {
        this.initDefaultCharacterStats();
        this.saveToStorage();
      }
    } catch {
      // Ignore storage errors
    }
  }

  public saveToStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const payload: PersistedBrainState = {
        version: 1,
        rosterBalancePass: ROSTER_BALANCE_PASS,
        generation: this.generation,
        episodesCompleted: this.episodesCompleted,
        itemsEnabled: this.itemsEnabled,
        autoBalanceRosterEnabled: this.autoBalanceRosterEnabled,
        trainingTrackMode: this.trainingTrackMode,
        championGenome: this.championGenome,
        population: this.population,
        baselineMetrics: this.baselineMetrics,
        savedPresets: this.savedPresets,
        useTrainedPresets: this.useTrainedPresets,
        characterStats: this.characterStats,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
    try {
      window.localStorage.setItem(
        TRACES_STORAGE_KEY,
        JSON.stringify(this.trackTraces)
      );
    } catch {
      // Ignore trace quota errors
    }
  }

  public snapshotActiveTrackTraces(): void {
    if (!this.activeTrackId || this.accumulators.size === 0) return;
    const traces: StoredTrackAiTrace[] = [];
    for (const acc of this.accumulators.values()) {
      if (acc.pathSamples.length >= 4) {
        traces.push({
          racerId: acc.racerId,
          slotIndex: acc.slotIndex,
          racerName: acc.racerName,
          characterId: acc.characterId,
          color: acc.color,
          pathSamples: [...acc.pathSamples],
        });
      }
    }
    if (traces.length > 0) {
      traces.sort((a, b) => a.slotIndex - b.slotIndex);
      this.trackTraces[this.activeTrackId] = traces;
    }
  }

  public getTrackAiTraces(trackId?: string): StoredTrackAiTrace[] {
    const key = trackId || this.activeTrackId;
    if (key === this.activeTrackId && this.accumulators.size > 0) {
      const liveTraces: StoredTrackAiTrace[] = [];
      for (const acc of this.accumulators.values()) {
        if (acc.pathSamples.length >= 2) {
          liveTraces.push({
            racerId: acc.racerId,
            slotIndex: acc.slotIndex,
            racerName: acc.racerName,
            characterId: acc.characterId,
            color: acc.color,
            pathSamples: [...acc.pathSamples],
          });
        }
      }
      if (liveTraces.length > 0) {
        return liveTraces.sort((a, b) => a.slotIndex - b.slotIndex);
      }
    }
    return this.trackTraces[key] ?? [];
  }

  public clearTrackAiTraces(trackId?: string): void {
    const key = trackId || this.activeTrackId;
    delete this.trackTraces[key];
    if (key === this.activeTrackId) {
      for (const acc of this.accumulators.values()) {
        acc.pathSamples = [];
      }
    }
    this.saveToStorage();
  }

  public getEpisodesCompleted(): number {
    return this.episodesCompleted;
  }

  public areItemsEnabled(): boolean {
    return this.itemsEnabled;
  }

  public setItemsEnabled(enabled: boolean): void {
    this.itemsEnabled = enabled;
    this.saveToStorage();
  }

  public isAutoBalanceRosterEnabled(): boolean {
    return this.autoBalanceRosterEnabled;
  }

  public setAutoBalanceRosterEnabled(enabled: boolean): void {
    this.autoBalanceRosterEnabled = enabled;
    this.saveToStorage();
  }

  public getTrainingTrackMode(): "ROTATE_CUP" | "ALL_CUPS" | "SINGLE_TRACK" {
    return this.trainingTrackMode;
  }

  public setTrainingTrackMode(
    mode: "ROTATE_CUP" | "ALL_CUPS" | "SINGLE_TRACK"
  ): void {
    this.trainingTrackMode = mode;
    this.saveToStorage();
  }

  /**
   * Returns the active policy genome for a given AI difficulty and slot index.
   * Rotates genome assignment across slots each episode so character stats or grid position never bias evolution.
   */
  public getGenomeForSlot(
    difficulty: AiDifficulty,
    slotIndex: number
  ): AiPolicyGenome {
    // Orthogonal Latin-Square rotation with RaceGame grid rotation ((slotIndex + episodesCompleted) % 4):
    // ensures every character drives all 4 genomes AND starts in all 4 grid slots once per 4-episode block!
    const safeSlot =
      (Math.abs(slotIndex) + Math.floor(this.episodesCompleted / 4)) % 4;
    if (difficulty === "SELF_LEARNING") {
      return (
        this.population[safeSlot] ??
        this.population[0] ??
        this.championGenome
      );
    }
    if (
      (difficulty === "EASY" ||
        difficulty === "MEDIUM" ||
        difficulty === "HARD") &&
      this.useTrainedPresets[difficulty] &&
      this.savedPresets[difficulty]
    ) {
      return this.savedPresets[difficulty]!;
    }
    return createGenome(
      `builtin_${difficulty.toLowerCase()}`,
      `${difficulty} Heuristic`,
      this.generation,
      DEFAULT_POLICY_WEIGHTS[difficulty]
    );
  }

  public resetEpisodeTelemetry(nextTrackId?: string): void {
    this.snapshotActiveTrackTraces();
    if (nextTrackId) {
      this.activeTrackId = nextTrackId;
    }
    this.accumulators.clear();
  }

  private getOrCreateAccumulator(params: {
    racerId: string;
    slotIndex: number;
    racerName: string;
    characterId: string;
    color: string;
    difficulty: AiDifficulty;
  }): RacerTelemetryAccumulator {
    let acc = this.accumulators.get(params.racerId);
    const genome = this.getGenomeForSlot(params.difficulty, params.slotIndex);
    if (!acc) {
      acc = {
        racerId: params.racerId,
        slotIndex: params.slotIndex,
        racerName: params.racerName,
        characterId: params.characterId,
        color: params.color,
        genomeId: genome.id,
        genomeName: genome.name,
        generation: genome.generation,
        totalTimeSec: 0,
        pavementSec: 0,
        curbSec: 0,
        offRoadSec: 0,
        boostedOffRoadSec: 0,
        unboostedOffRoadSec: 0,
        sumSqLatOffset: 0,
        sumSpeedWeighted: 0,
        sumTopSpeedRatioWeighted: 0,
        driftsInitiated: 0,
        miniTurbosFired: 0,
        tier1Count: 0,
        tier2Count: 0,
        tier3Count: 0,
        abortedDrifts: 0,
        pingPongCrossings: 0,
        wallHits: 0,
        jumpsCount: 0,
        maxJumpHeightMeters: 0,
        airTimeSec: 0,
        currentlyInJump: false,
        collisionsGiven: 0,
        collisionsTaken: 0,
        itemsUsed: 0,
        itemHitsLanded: 0,
        shortcutBoostsUsed: 0,
        defensiveBlocks: 0,
        lastExtremeSide: 0,
        lastExtremeTimeSec: -99,
        wallHitCooldownSec: 0,
        sampleTimerSec: 0,
        lapsCompleted: 0,
        bestLapMs: null,
        lastLapMs: null,
        pathSamples: [],
      };
      this.accumulators.set(params.racerId, acc);
    } else {
      acc.racerName = params.racerName;
      acc.genomeId = genome.id;
      acc.genomeName = genome.name;
      acc.generation = genome.generation;
    }
    return acc;
  }

  public recordStep(params: {
    racerId: string;
    slotIndex: number;
    racerName: string;
    characterId: string;
    color: string;
    difficulty: AiDifficulty;
    dt: number;
    x: number;
    z: number;
    normT: number;
    signedLat: number;
    roadHalfWidth: number;
    wallHalfWidth: number;
    forwardSpeed: number;
    topSpeed: number;
    surface: SurfaceType;
    driftState: DriftState;
    miniTurboTier: MiniTurboTier;
    hasOffRoadImmunity: boolean;
    grounded?: boolean;
    heightAboveRoad?: number;
    lapTimesMs: number[];
    combatDisrupted?: boolean;
  }): void {
    const acc = this.getOrCreateAccumulator(params);
    const dt = Math.max(0.001, params.dt);
    const isCombatDisrupted = Boolean(params.combatDisrupted);

    acc.totalTimeSec += dt;
    if (params.surface === "PAVEMENT") {
      acc.pavementSec += dt;
    } else if (params.surface === "CURB") {
      acc.curbSec += dt;
    } else if (isCombatDisrupted) {
      // Involuntary off-road excursion caused by an item hit / spin-out / Juggernaut shove:
      // do not penalize driving line telemetry or unboosted off-road drag!
      acc.pavementSec += dt;
    } else {
      acc.offRoadSec += dt;
      if (params.hasOffRoadImmunity) {
        acc.boostedOffRoadSec += dt;
      } else {
        acc.unboostedOffRoadSec += dt;
      }
    }

    // Track genuine stunt ramp / hilltop jumps (heightAboveRoad > 0.72m, excluding tiny 0.28m drift entry hops)
    const airHeight = params.heightAboveRoad ?? 0;
    const isGenuineJump = params.grounded === false && airHeight > 0.72;
    if (isGenuineJump) {
      acc.airTimeSec += dt;
      if (!acc.currentlyInJump) {
        acc.currentlyInJump = true;
        acc.jumpsCount += 1;
      }
      if (airHeight > acc.maxJumpHeightMeters) {
        acc.maxJumpHeightMeters = Number(airHeight.toFixed(2));
      }
    } else if (params.grounded !== false || airHeight < 0.25) {
      acc.currentlyInJump = false;
    }

    acc.sumSqLatOffset += params.signedLat * params.signedLat * dt;
    const clampedSpeed = Math.max(0, params.forwardSpeed);
    acc.sumSpeedWeighted += clampedSpeed * dt;
    const rawSpeedRatio = clampedSpeed / Math.max(1, params.topSpeed);
    const speedRatio = Math.min(1.16, rawSpeedRatio);
    acc.sumTopSpeedRatioWeighted += speedRatio * dt;

    // Cross-track ping-pong detector:
    // Detects when a kart swings past ±68% of roadHalfWidth on one side and then overshoots
    // to ∓68% on the opposite side within 3.8 seconds (ignored while combat-disrupted).
    const extremeThreshold = params.roadHalfWidth * 0.68;
    if (!isCombatDisrupted && Math.abs(params.signedLat) >= extremeThreshold) {
      const currentSide: -1 | 1 = params.signedLat > 0 ? 1 : -1;
      if (
        acc.lastExtremeSide !== 0 &&
        acc.lastExtremeSide !== currentSide &&
        acc.totalTimeSec - acc.lastExtremeTimeSec <= 3.8
      ) {
        acc.pingPongCrossings += 1;
      }
      acc.lastExtremeSide = currentSide;
      acc.lastExtremeTimeSec = acc.totalTimeSec;
    }

    // Perimeter wall hit tracking with cooldown
    if (acc.wallHitCooldownSec > 0) {
      acc.wallHitCooldownSec = Math.max(0, acc.wallHitCooldownSec - dt);
    }
    if (
      !isCombatDisrupted &&
      Math.abs(params.signedLat) >= params.wallHalfWidth - 0.95 &&
      acc.wallHitCooldownSec <= 0
    ) {
      acc.wallHits += 1;
      acc.wallHitCooldownSec = 0.85;
    }

    // Update lap splits
    acc.lapsCompleted = params.lapTimesMs.length;
    if (params.lapTimesMs.length > 0) {
      acc.lastLapMs = params.lapTimesMs[params.lapTimesMs.length - 1];
      acc.bestLapMs = Math.min(...params.lapTimesMs);
    }

    // Record 10Hz spatial path trace sample for 2D track visualization
    acc.sampleTimerSec += dt;
    if (acc.sampleTimerSec >= 0.1) {
      acc.sampleTimerSec = 0;
      acc.pathSamples.push({
        x: Number(params.x.toFixed(1)),
        z: Number(params.z.toFixed(1)),
        normT: Number(params.normT.toFixed(3)),
        signedLat: Number(params.signedLat.toFixed(2)),
        speedRatio: Number(speedRatio.toFixed(2)),
        surface: params.surface,
        driftState: params.driftState,
        miniTurboTier: params.miniTurboTier,
        boosting: params.hasOffRoadImmunity,
        combatDisrupted: isCombatDisrupted || undefined,
      });
      if (acc.pathSamples.length > 220) {
        acc.pathSamples.shift();
      }
    }
  }

  public recordDriftInitiated(racerId: string): void {
    const acc = this.accumulators.get(racerId);
    if (acc) {
      acc.driftsInitiated += 1;
    }
  }

  public recordDriftFinished(racerId: string, tierFired: MiniTurboTier): void {
    const acc = this.accumulators.get(racerId);
    if (!acc) return;
    if (tierFired >= 1) {
      acc.miniTurbosFired += 1;
      if (tierFired === 1) acc.tier1Count += 1;
      else if (tierFired === 2) acc.tier2Count += 1;
      else if (tierFired === 3) acc.tier3Count += 1;
    } else {
      acc.abortedDrifts += 1;
    }
  }

  public recordCollision(report: AsymmetricCollisionReport): void {
    const heavyAcc = this.accumulators.get(report.heavyRacerId);
    if (heavyAcc) {
      heavyAcc.collisionsGiven = (heavyAcc.collisionsGiven ?? 0) + 1;
    }
    const lightAcc = this.accumulators.get(report.lightRacerId);
    if (lightAcc) {
      lightAcc.collisionsTaken = (lightAcc.collisionsTaken ?? 0) + 1;
    }
  }

  public recordItemUsed(racerId: string, isShortcutBoost = false): void {
    const acc = this.accumulators.get(racerId);
    if (acc) {
      acc.itemsUsed = (acc.itemsUsed ?? 0) + 1;
      if (isShortcutBoost) {
        acc.shortcutBoostsUsed = (acc.shortcutBoostsUsed ?? 0) + 1;
      }
    }
  }

  public recordItemHitLanded(attackerRacerId: string): void {
    const acc = this.accumulators.get(attackerRacerId);
    if (acc) {
      acc.itemHitsLanded = (acc.itemHitsLanded ?? 0) + 1;
    }
  }

  public recordDefensiveBlock(defenderRacerId: string): void {
    const acc = this.accumulators.get(defenderRacerId);
    if (acc) {
      acc.defensiveBlocks = (acc.defensiveBlocks ?? 0) + 1;
    }
  }

  private summarizeAccumulator(
    acc: RacerTelemetryAccumulator
  ): AiRacerTelemetrySummary {
    const t = Math.max(0.001, acc.totalTimeSec);
    const pavementPct = Number(((acc.pavementSec / t) * 100).toFixed(1));
    const curbPct = Number(((acc.curbSec / t) * 100).toFixed(1));
    const offRoadPct = Number(((acc.offRoadSec / t) * 100).toFixed(1));
    const boostedOffRoadPct = Number(
      ((acc.boostedOffRoadSec / t) * 100).toFixed(1)
    );
    const unboostedOffRoadPct = Number(
      ((acc.unboostedOffRoadSec / t) * 100).toFixed(1)
    );
    const airTimePct = Number(((acc.airTimeSec / t) * 100).toFixed(1));
    const rmsLateralOffset = Number(Math.sqrt(acc.sumSqLatOffset / t).toFixed(2));
    const avgSpeed = Number((acc.sumSpeedWeighted / t).toFixed(1));
    const topSpeedRatioPct = Number(
      ((acc.sumTopSpeedRatioWeighted / t) * 100).toFixed(1)
    );

    // Objective 0-100 Racing Fitness Score (Kart-Stat-Normalized & Track-Length-Independent):
    // Rewards high topSpeedRatioPct (how close the AI drove to its own kart's max speed),
    // staying on pavement/curb or boosted off-road cuts, and landing Mini-Turbos,
    // while penalizing unboosted grass drags, ping-pongs, and wall hits.
    const cleanSurfaceScore =
      pavementPct * 0.42 + curbPct * 0.38 + boostedOffRoadPct * 0.36;
    const speedScore = topSpeedRatioPct * 0.48;
    const mtConversionBonus = Math.min(
      14,
      acc.miniTurbosFired * 1.1 + acc.tier2Count * 0.5 + acc.tier3Count * 0.9
    );
    const combatUtilityBonus = this.itemsEnabled
      ? Math.min(
          6,
          (acc.itemHitsLanded ?? 0) * 1.4 +
            (acc.shortcutBoostsUsed ?? 0) * 1.2 +
            (acc.defensiveBlocks ?? 0) * 1.5
        )
      : 0;
    const penalties =
      unboostedOffRoadPct * 1.15 +
      acc.pingPongCrossings * 2.8 +
      acc.wallHits * 3.5 +
      acc.abortedDrifts * 1.1 +
      Math.max(0, rmsLateralOffset - 4.8) * 1.8;

    const rawFitness =
      cleanSurfaceScore +
      speedScore +
      mtConversionBonus +
      combatUtilityBonus -
      penalties;
    const rawFitnessScore = Number(rawFitness.toFixed(2));
    const fitnessScore = clamp(Number(rawFitness.toFixed(1)), 5, 100);

    return {
      racerId: acc.racerId,
      slotIndex: acc.slotIndex,
      racerName: acc.racerName,
      characterId: acc.characterId,
      color: acc.color,
      genomeId: acc.genomeId,
      genomeName: acc.genomeName,
      generation: acc.generation,
      pavementPct,
      curbPct,
      offRoadPct,
      boostedOffRoadPct,
      unboostedOffRoadPct,
      rmsLateralOffset,
      avgSpeed,
      topSpeedRatioPct,
      driftsInitiated: acc.driftsInitiated,
      miniTurbosFired: acc.miniTurbosFired,
      tier1Count: acc.tier1Count,
      tier2Count: acc.tier2Count,
      tier3Count: acc.tier3Count,
      abortedDrifts: acc.abortedDrifts,
      pingPongCrossings: acc.pingPongCrossings,
      wallHits: acc.wallHits,
      jumpsCount: acc.jumpsCount,
      maxJumpHeightMeters: acc.maxJumpHeightMeters,
      airTimePct,
      collisionsGiven: acc.collisionsGiven ?? 0,
      collisionsTaken: acc.collisionsTaken ?? 0,
      itemsUsed: acc.itemsUsed ?? 0,
      itemHitsLanded: acc.itemHitsLanded ?? 0,
      shortcutBoostsUsed: acc.shortcutBoostsUsed ?? 0,
      defensiveBlocks: acc.defensiveBlocks ?? 0,
      lapsCompleted: acc.lapsCompleted,
      bestLapMs: acc.bestLapMs,
      lastLapMs: acc.lastLapMs,
      fitnessScore,
      rawFitnessScore,
      pathSamples: acc.pathSamples,
    };
  }

  public getCharacterBalanceSummaries(): AiCharacterBalanceStat[] {
    const entries = DEFAULT_CHARACTER_META.map(
      (meta) =>
        this.characterStats[meta.characterId] ?? {
          ...meta,
          racesCompleted: 0,
          wins: 0,
          rankSum: 0,
          lapTimeSumMs: 0,
          lapCount: 0,
          lap1TimeSumMs: 0,
          lap1Count: 0,
          flyingLapTimeSumMs: 0,
          flyingLapCount: 0,
          bestLapMs: null,
          speedSum: 0,
          topSpeedRatioSum: 0,
          onTrackPctSum: 0,
          offRoadPctSum: 0,
          boostedCutPctSum: 0,
          pingPongSum: 0,
          miniTurbosSum: 0,
          shovesGivenSum: 0,
          hitsTakenSum: 0,
          jumpsSum: 0,
          maxJumpHeightSum: 0,
          peakJumpHeightMeters: 0,
        }
    );

    const validLapAverages = entries
      .filter((e) => e.lapCount > 0)
      .map((e) => e.lapTimeSumMs / e.lapCount);
    const fleetMeanLapMs =
      validLapAverages.length > 0
        ? validLapAverages.reduce((a, b) => a + b, 0) / validLapAverages.length
        : null;

    const validSpeedAverages = entries
      .filter((e) => e.racesCompleted > 0)
      .map((e) => e.speedSum / e.racesCompleted);
    const fleetMeanSpeed =
      validSpeedAverages.length > 0
        ? validSpeedAverages.reduce((a, b) => a + b, 0) /
          validSpeedAverages.length
        : null;

    return entries.map((e): AiCharacterBalanceStat => {
      const races = Math.max(0, e.racesCompleted);
      const winRatePct =
        races > 0 ? Number(((e.wins / races) * 100).toFixed(1)) : 0;
      const avgFinishRank =
        races > 0 ? Number((e.rankSum / races).toFixed(2)) : 2.5;
      const avgLapMs =
        e.lapCount > 0 ? Math.round(e.lapTimeSumMs / e.lapCount) : null;
      const avgLap1Ms =
        (e.lap1Count ?? 0) > 0
          ? Math.round((e.lap1TimeSumMs ?? 0) / e.lap1Count)
          : null;
      const avgFlyingLapMs =
        (e.flyingLapCount ?? 0) > 0
          ? Math.round((e.flyingLapTimeSumMs ?? 0) / e.flyingLapCount)
          : null;
      const avgSpeed =
        races > 0 ? Number((e.speedSum / races).toFixed(1)) : 0;
      const avgTopSpeedRatioPct =
        races > 0 ? Number((e.topSpeedRatioSum / races).toFixed(1)) : 0;
      const avgOnTrackPct =
        races > 0 ? Number((e.onTrackPctSum / races).toFixed(1)) : 0;
      const avgOffRoadPct =
        races > 0 ? Number(((e.offRoadPctSum ?? 0) / races).toFixed(1)) : 0;
      const avgBoostedCutPct =
        races > 0 ? Number((e.boostedCutPctSum / races).toFixed(1)) : 0;
      const avgPingPongs =
        races > 0 ? Number((e.pingPongSum / races).toFixed(1)) : 0;
      const avgMiniTurbosPerRace =
        races > 0 ? Number(((e.miniTurbosSum ?? 0) / races).toFixed(1)) : 0;
      const avgShovesPerRace =
        races > 0 ? Number(((e.shovesGivenSum ?? 0) / races).toFixed(1)) : 0;
      const avgHitsTakenPerRace =
        races > 0 ? Number(((e.hitsTakenSum ?? 0) / races).toFixed(1)) : 0;
      const avgJumpsPerRace =
        races > 0 ? Number(((e.jumpsSum ?? 0) / races).toFixed(1)) : 0;
      const avgMaxJumpHeightMeters =
        races > 0 ? Number(((e.maxJumpHeightSum ?? 0) / races).toFixed(2)) : 0;
      const peakJumpHeightMeters = Number(
        (e.peakJumpHeightMeters ?? 0).toFixed(2)
      );

      // Positive paceDeltaPct = character is SLOWER than fleet average (needs buff)
      // Negative paceDeltaPct = character is FASTER than fleet average (overtuned / dominant)
      let paceDeltaPct = 0;
      if (avgLapMs !== null && fleetMeanLapMs !== null && fleetMeanLapMs > 1000) {
        paceDeltaPct = Number(
          (((avgLapMs - fleetMeanLapMs) / fleetMeanLapMs) * 100).toFixed(2)
        );
      } else if (
        races > 0 &&
        fleetMeanSpeed !== null &&
        fleetMeanSpeed > 5 &&
        avgSpeed > 5
      ) {
        paceDeltaPct = Number(
          (((fleetMeanSpeed - avgSpeed) / fleetMeanSpeed) * 100).toFixed(2)
        );
      }

      // Include both Finish Rank Bias and Win-Rate Deviation from 25.0% so pack/collision dominance
      // is captured even when solo lap paceDeltaPct is within ±0.3%!
      const rankBias = races >= 2 ? (avgFinishRank - 2.5) * 0.65 : 0;
      const winRateBias = races >= 6 ? (25.0 - winRatePct) * 0.08 : 0;
      const compositeDeficit = paceDeltaPct + rankBias + winRateBias;

      // Calibrated to empirical Pass #3 <-> Pass #5 sensitivity (0.05 TopSpd + 0.1 Accel ≈ 4-6% Win Rate)
      const suggestedTopSpeedDelta =
        races > 0
          ? clamp(
              Number((Math.round(compositeDeficit * 0.08 * 20) / 20).toFixed(2)),
              -0.5,
              0.5
            )
          : 0;
      const suggestedAccelDelta =
        races > 0
          ? clamp(Number((compositeDeficit * 0.18).toFixed(1)), -1.0, 1.0)
          : 0;
      const suggestedMtBonusDelta =
        races > 0
          ? clamp(Number((compositeDeficit * 0.005).toFixed(2)), -0.02, 0.02)
          : 0;

      const winRateBalanced = races < 8 || Math.abs(winRatePct - 25.0) <= 4.0;
      let recommendation = "Collecting race samples...";
      if (races > 0) {
        if (Math.abs(compositeDeficit) <= 0.75 && winRateBalanced) {
          recommendation = "BALANCED (Matches fleet pace & ~25% win rate)";
        } else if (compositeDeficit > 0) {
          const spd = Math.max(0.05, suggestedTopSpeedDelta);
          const acc = Math.max(0.1, suggestedAccelDelta);
          const mtPct = Math.round(suggestedMtBonusDelta * 100);
          const mtPart = mtPct > 0 ? `, +${mtPct}% MT` : "";
          recommendation = `BUFF: +${spd} TopSpd, +${acc.toFixed(1)} Accel${mtPart} (${winRatePct.toFixed(0)}% Win Rate)`;
        } else {
          const spd = Math.min(-0.05, suggestedTopSpeedDelta);
          const acc = Math.min(-0.1, suggestedAccelDelta);
          const mtPct = Math.round(suggestedMtBonusDelta * 100);
          const mtPart = mtPct < 0 ? `, ${mtPct}% MT` : "";
          recommendation = `TUNE DOWN: ${spd} TopSpd, ${acc.toFixed(1)} Accel${mtPart} (${winRatePct.toFixed(0)}% Win Rate)`;
        }
      }

      return {
        characterId: e.characterId,
        characterName: e.characterName,
        archetypeClass: e.archetypeClass,
        color: e.color,
        racesCompleted: races,
        wins: e.wins,
        winRatePct,
        avgFinishRank,
        avgLapMs,
        avgLap1Ms,
        avgFlyingLapMs,
        bestLapMs: e.bestLapMs,
        avgSpeed,
        avgTopSpeedRatioPct,
        avgOnTrackPct,
        avgOffRoadPct,
        avgBoostedCutPct,
        avgPingPongs,
        avgMiniTurbosPerRace,
        avgShovesPerRace,
        avgHitsTakenPerRace,
        avgJumpsPerRace,
        avgMaxJumpHeightMeters,
        peakJumpHeightMeters,
        paceDeltaPct,
        suggestedTopSpeedDelta,
        suggestedAccelDelta,
        suggestedMtBonusDelta,
        recommendation,
      };
    });
  }

  /**
   * Dynamically applies empirical character balance adjustments when "AUTO-BALANCE ROSTER" is enabled.
   */
  public applyAutoBalanceToStats(
    stats: ResolvedRacerStats
  ): ResolvedRacerStats {
    if (!this.autoBalanceRosterEnabled) return stats;

    let topSpeedAdj = 0;
    let accelAdj = 0;
    let mtBonusAdj = 0;

    // Empirical self-correcting adjustment from recorded character balance telemetry
    const summaries = this.getCharacterBalanceSummaries();
    const charSummary = summaries.find(
      (s) => s.characterId === stats.character.id
    );
    if (charSummary && charSummary.racesCompleted >= 1) {
      topSpeedAdj += charSummary.suggestedTopSpeedDelta * 0.65;
      accelAdj += charSummary.suggestedAccelDelta * 0.65;
      mtBonusAdj += charSummary.suggestedMtBonusDelta * 0.65;
    }

    const balancedTopSpeed = clamp(
      Number((stats.topSpeed + topSpeedAdj).toFixed(2)),
      42.0,
      49.5
    );
    const balancedOffRoadSpeed = Number((balancedTopSpeed * 0.55).toFixed(1));
    const balancedAccel = clamp(
      Number((stats.acceleration + accelAdj).toFixed(1)),
      18,
      40
    );
    const balancedMtBonus = clamp(
      Number((stats.miniTurboDurationBonus + mtBonusAdj).toFixed(2)),
      0,
      0.28
    );

    return {
      ...stats,
      topSpeed: balancedTopSpeed,
      offRoadTopSpeed: balancedOffRoadSpeed,
      acceleration: balancedAccel,
      miniTurboDurationBonus: balancedMtBonus,
    };
  }

  public resetCharacterBalanceStats(): void {
    this.initDefaultCharacterStats();
    this.saveToStorage();
  }

  public getTelemetrySnapshot(
    difficulty: AiDifficulty
  ): AiTrainingLabTelemetry {
    const racers = Array.from(this.accumulators.values())
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((acc) => this.summarizeAccumulator(acc));

    const count = Math.max(1, racers.length);
    const fleetAvgPavementPct = Number(
      (
        racers.reduce((s, r) => s + r.pavementPct + r.curbPct, 0) / count
      ).toFixed(1)
    );
    const fleetAvgOffRoadPct = Number(
      (racers.reduce((s, r) => s + r.offRoadPct, 0) / count).toFixed(1)
    );
    const fleetAvgSpeed = Number(
      (racers.reduce((s, r) => s + r.avgSpeed, 0) / count).toFixed(1)
    );
    const fleetTotalMiniTurbos = racers.reduce(
      (s, r) => s + r.miniTurbosFired,
      0
    );
    const fleetTotalPingPongs = racers.reduce(
      (s, r) => s + r.pingPongCrossings,
      0
    );
    const fleetAvgFitness = Number(
      (racers.reduce((s, r) => s + r.fitnessScore, 0) / count).toFixed(1)
    );

    return {
      difficulty,
      generation: this.generation,
      episodesCompleted: this.episodesCompleted,
      itemsEnabled: this.itemsEnabled,
      autoBalanceRosterEnabled: this.autoBalanceRosterEnabled,
      trainingTrackMode: this.trainingTrackMode,
      championFitness: this.championGenome.fitness,
      championBestLapMs: this.championGenome.bestLapMs,
      baselineFitness: this.baselineMetrics?.fitness ?? null,
      baselinePavementPct: this.baselineMetrics?.pavementPct ?? null,
      baselinePingPongs: this.baselineMetrics?.pingPongs ?? null,
      baselineAvgSpeed: this.baselineMetrics?.avgSpeed ?? null,
      fleetAvgPavementPct,
      fleetAvgOffRoadPct,
      fleetAvgSpeed,
      fleetTotalMiniTurbos,
      fleetTotalPingPongs,
      fleetAvgFitness,
      savedPresetSlots: {
        EASY: this.savedPresets.EASY
          ? {
              savedAt: this.savedPresets.EASY.updatedAt,
              generation: this.savedPresets.EASY.generation,
              fitness: this.savedPresets.EASY.fitness,
              bestLapMs: this.savedPresets.EASY.bestLapMs,
            }
          : null,
        MEDIUM: this.savedPresets.MEDIUM
          ? {
              savedAt: this.savedPresets.MEDIUM.updatedAt,
              generation: this.savedPresets.MEDIUM.generation,
              fitness: this.savedPresets.MEDIUM.fitness,
              bestLapMs: this.savedPresets.MEDIUM.bestLapMs,
            }
          : null,
        HARD: this.savedPresets.HARD
          ? {
              savedAt: this.savedPresets.HARD.updatedAt,
              generation: this.savedPresets.HARD.generation,
              fitness: this.savedPresets.HARD.fitness,
              bestLapMs: this.savedPresets.HARD.bestLapMs,
            }
          : null,
      },
      useTrainedPresets: { ...this.useTrainedPresets },
      racers,
      characterBalance: this.getCharacterBalanceSummaries(),
    };
  }

  /**
   * Evolves the AI population at the end of a race or training episode based on objective telemetry,
   * and updates cumulative per-character balance statistics.
   */
  public evolveGenerationFromEpisode(
    difficulty: AiDifficulty,
    finishRanksByRacerId?: Record<string, number>,
    lapSplitsByRacerId?: Record<string, number[]>
  ): {
    newGeneration: number;
    championName: string;
    championFitness: number;
  } {
    const snapshot = this.getTelemetrySnapshot(difficulty);
    const racers = snapshot.racers;
    if (racers.length === 0) {
      return {
        newGeneration: this.generation,
        championName: this.championGenome.name,
        championFitness: this.championGenome.fitness,
      };
    }

    // 1. Update cumulative Character Balance statistics across episodes
    const fallbackRanked = [...racers].sort(
      (a, b) =>
        (a.bestLapMs ?? 999999) - (b.bestLapMs ?? 999999) ||
        b.fitnessScore - a.fitnessScore
    );
    racers.forEach((r) => {
      const charStat = this.characterStats[r.characterId];
      if (!charStat) return;
      const rank =
        finishRanksByRacerId?.[r.racerId] ??
        fallbackRanked.findIndex((fr) => fr.racerId === r.racerId) + 1;
      charStat.racesCompleted += 1;
      if (rank === 1) {
        charStat.wins += 1;
      }
      charStat.rankSum += rank;
      charStat.speedSum += r.avgSpeed;
      charStat.topSpeedRatioSum += r.topSpeedRatioPct;
      charStat.onTrackPctSum += r.pavementPct + r.curbPct;
      charStat.offRoadPctSum = (charStat.offRoadPctSum ?? 0) + r.offRoadPct;
      charStat.boostedCutPctSum += r.boostedOffRoadPct;
      charStat.pingPongSum += r.pingPongCrossings;
      charStat.miniTurbosSum =
        (charStat.miniTurbosSum ?? 0) + r.miniTurbosFired;
      charStat.shovesGivenSum =
        (charStat.shovesGivenSum ?? 0) + (r.collisionsGiven ?? 0);
      charStat.hitsTakenSum =
        (charStat.hitsTakenSum ?? 0) + (r.collisionsTaken ?? 0);
      charStat.jumpsSum = (charStat.jumpsSum ?? 0) + r.jumpsCount;
      charStat.maxJumpHeightSum =
        (charStat.maxJumpHeightSum ?? 0) + r.maxJumpHeightMeters;
      charStat.peakJumpHeightMeters = Math.max(
        charStat.peakJumpHeightMeters ?? 0,
        r.maxJumpHeightMeters
      );

      const splits = lapSplitsByRacerId?.[r.racerId] ?? [];
      const validLaps = splits.filter((ms) => Number.isFinite(ms) && ms > 1000);
      if (validLaps.length > 0) {
        validLaps.forEach((ms, idx) => {
          charStat.lapTimeSumMs += ms;
          charStat.lapCount += 1;
          if (idx === 0) {
            charStat.lap1TimeSumMs = (charStat.lap1TimeSumMs ?? 0) + ms;
            charStat.lap1Count = (charStat.lap1Count ?? 0) + 1;
          } else {
            charStat.flyingLapTimeSumMs =
              (charStat.flyingLapTimeSumMs ?? 0) + ms;
            charStat.flyingLapCount = (charStat.flyingLapCount ?? 0) + 1;
          }
          if (charStat.bestLapMs === null || ms < charStat.bestLapMs) {
            charStat.bestLapMs = ms;
          }
        });
      } else if (r.bestLapMs !== null && r.bestLapMs > 1000) {
        charStat.lapTimeSumMs += r.bestLapMs;
        charStat.lapCount += 1;
        if (charStat.bestLapMs === null || r.bestLapMs < charStat.bestLapMs) {
          charStat.bestLapMs = r.bestLapMs;
        }
      }
    });

    this.episodesCompleted += 1;

    // Capture baseline metrics on the first completed episode if none stored yet
    if (!this.baselineMetrics) {
      this.baselineMetrics = {
        fitness: snapshot.fleetAvgFitness,
        pavementPct: snapshot.fleetAvgPavementPct,
        pingPongs: snapshot.fleetTotalPingPongs,
        avgSpeed: snapshot.fleetAvgSpeed,
      };
    }

    // Compute episode-mean best lap so we can reward faster laps relative to this specific track/episode
    const validEpisodeBestLaps = racers
      .map((r) => r.bestLapMs)
      .filter((ms): ms is number => ms !== null && ms > 1000);
    const episodeMeanBestLapMs =
      validEpisodeBestLaps.length > 0
        ? validEpisodeBestLaps.reduce((a, b) => a + b, 0) /
          validEpisodeBestLaps.length
        : null;

    // Score each genome in our population (matching by genomeId so rotated slots map accurately)
    // Uses unclamped rawFitnessScore + episode finish rank + episode-relative lap bonus so ties at 100.0
    // never freeze evolution on Slot 0 across different-length tracks in ALL_CUPS!
    const scoredEntries = racers
      .map((r) => {
        const g =
          this.population.find((popG) => popG.id === r.genomeId) ??
          this.population[r.slotIndex % 4] ??
          createGenome(
            r.genomeId,
            r.genomeName,
            this.generation,
            DEFAULT_POLICY_WEIGHTS.SELF_LEARNING
          );
        const rank =
          finishRanksByRacerId?.[r.racerId] ??
          fallbackRanked.findIndex((fr) => fr.racerId === r.racerId) + 1;
        const rawFit = r.rawFitnessScore ?? r.fitnessScore;
        const rankBonus = (2.5 - rank) * 1.35;
        const relLapBonus =
          episodeMeanBestLapMs !== null &&
          episodeMeanBestLapMs > 1000 &&
          r.bestLapMs !== null
            ? clamp(
                ((episodeMeanBestLapMs - r.bestLapMs) / episodeMeanBestLapMs) *
                  35.0,
                -6.0,
                6.0
              )
            : 0;
        const episodeCompScore = Number(
          (rawFit + rankBonus + relLapBonus).toFixed(3)
        );

        const updated: AiPolicyGenome = {
          ...g,
          fitness: r.fitnessScore,
          bestLapMs:
            r.bestLapMs !== null &&
            (g.bestLapMs === null || r.bestLapMs < g.bestLapMs)
              ? r.bestLapMs
              : g.bestLapMs,
          pavementPct: r.pavementPct + r.curbPct,
          pingPongCount: r.pingPongCrossings,
          miniTurbosFired: r.miniTurbosFired,
          updatedAt: Date.now(),
        };
        return {
          genome: updated,
          episodeCompScore,
          episodeBestLapMs: r.bestLapMs,
          rawFit,
        };
      })
      .sort((a, b) => b.episodeCompScore - a.episodeCompScore);

    const scored = scoredEntries.map((s) => s.genome);
    const bestEntry = scoredEntries[0];
    const reigningChampEntry = scoredEntries.find((s) =>
      s.genome.id.endsWith("_slot0")
    );

    if (bestEntry) {
      const bestOfEpisode = bestEntry.genome;
      const strictlyHigherFitness =
        bestOfEpisode.fitness > this.championGenome.fitness ||
        this.championGenome.fitness === 0;
      const tiedFitnessFasterLap =
        bestOfEpisode.fitness === this.championGenome.fitness &&
        bestOfEpisode.bestLapMs !== null &&
        (this.championGenome.bestLapMs === null ||
          bestOfEpisode.bestLapMs <= this.championGenome.bestLapMs);

      // Head-to-head promotion across ALL_CUPS:
      // If a mutated challenger (slot 1/2/3) cleanly beats the reigning Champion (slot 0) in the SAME race
      // on the SAME track (with higher unclamped fitness + faster episode lap and >= 95% on-track discipline),
      // promote the challenger even if this track is longer than the all-time shortest track!
      const beatReigningChampHeadToHead =
        reigningChampEntry !== undefined &&
        bestOfEpisode.id !== reigningChampEntry.genome.id &&
        bestOfEpisode.pavementPct >= 95.0 &&
        bestEntry.episodeCompScore >
          reigningChampEntry.episodeCompScore + 0.35 &&
        bestEntry.rawFit >= reigningChampEntry.rawFit &&
        (bestEntry.episodeBestLapMs === null ||
          reigningChampEntry.episodeBestLapMs === null ||
          bestEntry.episodeBestLapMs <= reigningChampEntry.episodeBestLapMs);

      if (
        strictlyHigherFitness ||
        tiedFitnessFasterLap ||
        beatReigningChampHeadToHead
      ) {
        const preservedBestLapMs =
          bestOfEpisode.bestLapMs !== null &&
          this.championGenome.bestLapMs !== null
            ? Math.min(bestOfEpisode.bestLapMs, this.championGenome.bestLapMs)
            : bestOfEpisode.bestLapMs ?? this.championGenome.bestLapMs;
        this.championGenome = {
          ...bestOfEpisode,
          bestLapMs: preservedBestLapMs,
          id: `champ_g${this.generation}`,
          name: `Gen-${this.generation} Champion`,
        };
      }
    }

    // Only mutate/advance the population when in SELF_LEARNING mode (or when explicitly training)
    if (difficulty === "SELF_LEARNING") {
      this.generation += 1;
      const nextGen = this.generation;
      const parent1 = this.championGenome;
      const parent2 = scored[1] ?? scored[0] ?? this.championGenome;

      // Adaptive mutation scale: starts exploratory (0.68) and refines to precision micro-tuning (0.22) as fitness reaches >= 95
      const mutScale =
        this.championGenome.fitness >= 95
          ? 0.22
          : this.championGenome.fitness > 88
          ? 0.32
          : this.championGenome.fitness > 78
          ? 0.48
          : 0.68;

      this.population = [
        // Slot 0: Elitist Champion (unmutated so we never regress!)
        {
          ...parent1,
          id: `g${nextGen}_slot0`,
          name: `G${nextGen} Elite Champion`,
          generation: nextGen,
        },
        // Slot 1: Fine-tuned mutation of Champion
        createGenome(
          `g${nextGen}_slot1`,
          `G${nextGen} Fine-Tuned`,
          nextGen,
          mutatePolicyWeights(parent1.weights, mutScale * 0.55),
          parent1.id
        ),
        // Slot 2: Crossover of Top-2 Elites + mutation
        createGenome(
          `g${nextGen}_slot2`,
          `G${nextGen} Crossover`,
          nextGen,
          mutatePolicyWeights(
            crossoverPolicyWeights(parent1.weights, parent2.weights),
            mutScale * 0.72
          ),
          parent1.id
        ),
        // Slot 3: Explorer mutation (bounded so all 4 racers remain highly competitive)
        createGenome(
          `g${nextGen}_slot3`,
          `G${nextGen} Explorer`,
          nextGen,
          mutatePolicyWeights(parent1.weights, mutScale * 0.92),
          parent1.id
        ),
      ];
    }

    this.snapshotActiveTrackTraces();
    this.saveToStorage();
    return {
      newGeneration: this.generation,
      championName: this.championGenome.name,
      championFitness: this.championGenome.fitness,
    };
  }

  public saveCurrentBaseline(difficulty: AiDifficulty): void {
    const snap = this.getTelemetrySnapshot(difficulty);
    this.baselineMetrics = {
      fitness: snap.fleetAvgFitness,
      pavementPct: snap.fleetAvgPavementPct,
      pingPongs: snap.fleetTotalPingPongs,
      avgSpeed: snap.fleetAvgSpeed,
    };
    this.saveToStorage();
  }

  public saveChampionToPreset(target: "EASY" | "MEDIUM" | "HARD"): void {
    this.savedPresets[target] = {
      ...this.championGenome,
      id: `trained_${target.toLowerCase()}_g${this.generation}`,
      name: `Trained ${target} (Gen ${this.generation})`,
      weights: cloneWeights(this.championGenome.weights),
      updatedAt: Date.now(),
    };
    this.useTrainedPresets[target] = true;
    this.saveToStorage();
  }

  public toggleUseTrainedPreset(target: "EASY" | "MEDIUM" | "HARD"): boolean {
    if (!this.savedPresets[target]) return false;
    this.useTrainedPresets[target] = !this.useTrainedPresets[target];
    this.saveToStorage();
    return this.useTrainedPresets[target];
  }

  public resetBrainToSeed(alsoResetBalance = true): void {
    this.generation = 15992;
    this.episodesCompleted = 15991;
    this.baselineMetrics = null;
    this.championGenome = createGenome(
      "gen15992_champ",
      "Gen-15992 Seed Ace",
      15992,
      DEFAULT_POLICY_WEIGHTS.SELF_LEARNING
    );
    this.championGenome.fitness = 100.0;
    this.championGenome.bestLapMs = 16580;
    this.championGenome.pavementPct = 99.0;
    this.initDefaultPopulation();
    if (alsoResetBalance) {
      this.initDefaultCharacterStats();
    }
    this.resetEpisodeTelemetry();
    this.saveToStorage();
  }

  public formatClipboardReport(
    difficulty: AiDifficulty,
    trackName = "Active Circuit"
  ): string {
    const snap = this.getTelemetrySnapshot(difficulty);
    const fmtLap = (ms: number | null) => {
      if (ms === null || ms < 0) return "--:--.--";
      const totalSec = ms / 1000;
      const mins = Math.floor(totalSec / 60);
      const secs = Math.floor(totalSec % 60);
      const hundredths = Math.floor((ms % 1000) / 10);
      return `${mins}:${secs.toString().padStart(2, "0")}.${hundredths
        .toString()
        .padStart(2, "0")}`;
    };

    const lines: string[] = [
      `### Gutsy Karts AI Training & Character Balance Report`,
      `- **Build**: ${BUILD_INFO_STAMP}`,
      `- **Generation / Episodes**: Gen #${snap.generation} (${snap.episodesCompleted} episodes completed)`,
      `- **Regime**: Items=${snap.itemsEnabled ? "ON (Combat)" : "OFF (Pure Driving)"}, Loop=${snap.trainingTrackMode}, AutoBalance=${snap.autoBalanceRosterEnabled ? "ON" : "OFF"}, Track=${trackName}`,
      `- **Champion Fitness**: ${snap.championFitness.toFixed(1)}/100 | **Best AI Lap**: ${fmtLap(snap.championBestLapMs)}`,
      `- **Live Fleet Metrics**: On-Track=${snap.fleetAvgPavementPct.toFixed(1)}%, Off-Road=${snap.fleetAvgOffRoadPct.toFixed(1)}%, PingPongs=${snap.fleetTotalPingPongs}, FleetFitness=${snap.fleetAvgFitness.toFixed(1)}/100`,
      ``,
      `#### Character Balance Matrix & Advisor Recommendations`,
      `| Character | Races | Win % (Wins) | Avg Rank | Avg Lap (L1 / Fly) | Best Lap | Bumps (Shove/Hit) | MTs/Race | Max Air (Peak / Avg) | Pace Δ | Advisor Recommendation |`,
      `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |`,
    ];

    for (const cb of snap.characterBalance) {
      const paceStr = cb.avgLapMs
        ? `${cb.paceDeltaPct > 0 ? "+" : ""}${cb.paceDeltaPct.toFixed(1)}%`
        : "--";
      const airStr =
        cb.racesCompleted > 0
          ? `${cb.peakJumpHeightMeters.toFixed(1)}m / ${cb.avgMaxJumpHeightMeters.toFixed(1)}m`
          : "--";
      const lapSplitStr =
        cb.avgLap1Ms && cb.avgFlyingLapMs
          ? `${fmtLap(cb.avgLapMs)} (${fmtLap(cb.avgLap1Ms)} / ${fmtLap(cb.avgFlyingLapMs)})`
          : fmtLap(cb.avgLapMs);
      const bumpsStr =
        cb.racesCompleted > 0
          ? `${cb.avgShovesPerRace.toFixed(1)} / ${cb.avgHitsTakenPerRace.toFixed(1)}`
          : "--";
      const mtStr =
        cb.racesCompleted > 0 ? cb.avgMiniTurbosPerRace.toFixed(1) : "--";
      lines.push(
        `| **${cb.characterName}** | ${cb.racesCompleted} | ${cb.winRatePct.toFixed(0)}% (${cb.wins}W) | ${cb.racesCompleted > 0 ? cb.avgFinishRank.toFixed(2) : "--"} | ${lapSplitStr} | ${fmtLap(cb.bestLapMs)} | ${bumpsStr} | ${mtStr} | ${airStr} | ${paceStr} | ${cb.recommendation} |`
      );
    }

    lines.push(
      ``,
      `#### Suggested Stat Deltas (JSON)`,
      "```json",
      JSON.stringify(
        {
          generation: snap.generation,
          episodesCompleted: snap.episodesCompleted,
          itemsEnabled: snap.itemsEnabled,
          autoBalanceRosterEnabled: snap.autoBalanceRosterEnabled,
          trainingTrackMode: snap.trainingTrackMode,
          characterAdjustments: snap.characterBalance.map((cb) => ({
            characterId: cb.characterId,
            characterName: cb.characterName,
            races: cb.racesCompleted,
            winRatePct: cb.winRatePct,
            avgFinishRank: cb.avgFinishRank,
            avgLapMs: cb.avgLapMs,
            avgLap1Ms: cb.avgLap1Ms,
            avgFlyingLapMs: cb.avgFlyingLapMs,
            paceDeltaPct: cb.paceDeltaPct,
            avgShovesPerRace: cb.avgShovesPerRace,
            avgHitsTakenPerRace: cb.avgHitsTakenPerRace,
            avgMiniTurbosPerRace: cb.avgMiniTurbosPerRace,
            avgOffRoadPct: cb.avgOffRoadPct,
            avgJumpsPerRace: cb.avgJumpsPerRace,
            avgMaxJumpHeightMeters: cb.avgMaxJumpHeightMeters,
            peakJumpHeightMeters: cb.peakJumpHeightMeters,
            suggestedTopSpeedDelta: cb.suggestedTopSpeedDelta,
            suggestedAccelDelta: cb.suggestedAccelDelta,
            suggestedMtBonusDelta: cb.suggestedMtBonusDelta,
            recommendation: cb.recommendation,
          })),
          championWeights: this.championGenome.weights,
        },
        null,
        2
      ),
      "```"
    );

    return lines.join("\n");
  }

  public exportBrainDatasetJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        generation: this.generation,
        episodesCompleted: this.episodesCompleted,
        itemsEnabled: this.itemsEnabled,
        autoBalanceRosterEnabled: this.autoBalanceRosterEnabled,
        trainingTrackMode: this.trainingTrackMode,
        championGenome: this.championGenome,
        population: this.population,
        savedPresets: this.savedPresets,
        useTrainedPresets: this.useTrainedPresets,
        characterBalance: this.getCharacterBalanceSummaries(),
      },
      null,
      2
    );
  }
}

export const globalAiBrain = new AiBrainManager();
