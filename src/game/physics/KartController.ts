import { Ray, Scene, Vector3 } from "@babylonjs/core";
import "@babylonjs/core/Culling/ray";
import {
  AiDifficulty,
  ControlInputState,
  DriftChargeSubState,
  DriftState,
  KartNetState,
  MiniTurboTier,
  NetCollisionImpulsePayload,
  PowerUpType,
  RacerControlMode,
  ResolvedRacerStats,
  SurfaceType,
} from "@/src/types/game";
import { BuiltTrack, ClosestTrackQuery } from "@/src/game/world/TrackBuilder";
import {
  buildProceduralKart,
  KartAssembly,
} from "@/src/game/entities/KartMeshFactory";
import {
  classifyTerrainSurface,
  CollidableKartBody,
  computeUnilateralDriftArcMultiplier,
  getMiniTurboReward,
  getMiniTurboTier,
  PHYSICS_CONSTANTS,
  stepManualDriftAlternation,
} from "@/src/game/physics/KartPhysics";
import {
  evaluateNeuralResidualSteer,
  globalAiBrain,
} from "@/src/game/ai/AiBrainTrainer";

export class KartController implements CollidableKartBody {
  public readonly racerId: string;
  public name: string;
  public isPlayer: boolean;
  public controlMode: RacerControlMode;
  public ownerPeerId: string | null = null;
  public stats: ResolvedRacerStats;
  public assembly: KartAssembly;
  public readonly slotIndex: number;

  // Spatial & kinematic state (Decoupled Heading vs. Velocity)
  public position: Vector3;
  public velocity: Vector3 = Vector3.Zero();
  public knockVelocity: Vector3 = Vector3.Zero();
  public headingYaw = 0; // Radians, 0 = +Z (ForwardHeadingVector angle)
  public forwardSpeed = 0;
  public lateralSpeed = 0;
  public verticalVelocity = 0;
  public grounded = true;
  public groundOffsetY = 0;

  // Remote network interpolation targets
  private netTargetPos: Vector3 = Vector3.Zero();
  private netTargetVel: Vector3 = Vector3.Zero();
  private netTargetYaw = 0;
  private hasNetTarget = false;
  private swapCount = 0;

  // Terrain & surface state
  public surface: SurfaceType = "PAVEMENT";
  public distToCenter = 0;
  public closestTrack: ClosestTrackQuery;
  public slopeAngle = 0;

  // 5-Phase Powerslide & Hop State Machine
  public driftState: DriftState = "NONE";
  public driftDirection: -1 | 0 | 1 = 0;
  public driftChargeSeconds = 0;
  public driftChargeSubState: DriftChargeSubState = 0;
  public miniTurboTier: MiniTurboTier = 0;
  private hopTimer = 0;
  private hopDirectionLocked = false;
  private driftExitRecoveryTimer = 0;
  private pumpPhaseHoldSec = 0;
  private pumpOutsideHoldSec = 0;
  private smoothedSteer = 0;
  private visualSlipAngle = 0;
  private visualPitch = 0;
  private visualRoll = 0;
  private prevRideY = 0;
  private hasPrevRideY = false;
  private slopeVerticalSpeed = 0;
  public airborneTime = 0;

  // Boosts, Prolonged Rocket Boost (PRB), power-ups & stun timers
  public boostTimer = 0;
  public boostMultiplier = 1.0;
  public activeBoostLabel: string | null = null;
  public prolongedRocketBoostActive = false;
  public nitroBoostTimer = 0;
  public novaOverdriveTimer = 0;
  public goldenOverclockTimer = 0;
  public warpAutopilotTimer = 0;
  public warpAutopilotElapsed = 0;
  public oilSquallTimer = 0;
  public phaseCloakTimer = 0;
  public empShrinkTimer = 0;
  public spinOutTimer = 0;
  public spinOutMercyTimer = 0;
  public spinOutAngle = 0;
  public wobbleTimer = 0;
  public combatRecoveryTimer = 0;
  public collisionCooldown = 0;
  public cameraShakeTimer = 0;
  private padBoostCooldown = 0;
  private obstacleHitCooldown = 0;
  private burnoutTimer = 0;
  private countdownThrottleHoldSec = 0;
  private wasRaceActive = false;

  // Item inventory, multi-charge items & roulette
  public heldItem: PowerUpType | null = null;
  public heldItemCharges = 0;
  public orbitalShieldCharges = 0;
  public tripleSeekerCharges = 0;
  public tripleCryoMineCharges = 0;
  public incomingThreatCount = 0;
  public lastItemAimDir: -1 | 0 | 1 = 0;
  public rouletteTimer = 0;
  public roulettePreviewItem: PowerUpType | null = null;
  private pendingAwardedItem: PowerUpType | null = null;
  public aiItemUseDelay = 0;

  // Lap & checkpoint progression
  public lap = 1;
  public maxLapReached = 1;
  public checkpointsMask = 0; // Bits 0, 1, 2 for 25%, 50%, 75% around lap
  public lastNormalizedT = 0;
  public totalProgressDistance = 0;
  public finished = false;
  public finishTimeMs: number | null = null;
  public lapStartElapsedMs = 0;
  public lapTimesMs: number[] = [];
  public rank = 1;
  public wrongWay = false;

  // AI navigation & thinking parameters
  public aiDifficulty: AiDifficulty = "MEDIUM";
  private readonly aiSlotIndex: number;
  private aiPreferredLateralOffset = 0;
  private aiSteerNoisePhase = 0;
  private aiOffTrackTimer = 0;
  private aiDriftCooldown = 0;
  private aiLastDriftDir: -1 | 0 | 1 = 0;

  private readonly scene: Scene;
  private readonly track: BuiltTrack;

  constructor(params: {
    scene: Scene;
    track: BuiltTrack;
    racerId: string;
    stats: ResolvedRacerStats;
    isPlayer: boolean;
    spawnPosition: Vector3;
    spawnYaw: number;
    aiSlotIndex?: number;
    aiDifficulty?: AiDifficulty;
    controlMode?: RacerControlMode;
    ownerPeerId?: string | null;
    customDisplayName?: string;
  }) {
    this.scene = params.scene;
    this.track = params.track;
    this.racerId = params.racerId;
    this.stats = params.stats;
    this.name = params.customDisplayName ?? params.stats.character.name;
    this.isPlayer = params.isPlayer;
    this.controlMode =
      params.controlMode ?? (params.isPlayer ? "LOCAL_HUMAN" : "AI");
    this.ownerPeerId = params.ownerPeerId ?? null;
    this.position = params.spawnPosition.clone();
    this.netTargetPos = params.spawnPosition.clone();
    this.headingYaw = params.spawnYaw;
    this.netTargetYaw = params.spawnYaw;
    this.aiSlotIndex = params.aiSlotIndex ?? 0;
    this.slotIndex = this.aiSlotIndex;
    this.aiDifficulty = params.aiDifficulty ?? "MEDIUM";

    this.assembly = buildProceduralKart(
      this.scene,
      this.racerId,
      this.stats,
      this.track.shadowGenerator
    );
    this.assembly.kartRoot.position.copyFrom(this.position);
    this.assembly.kartRoot.rotation.y = this.headingYaw;
    this.assembly.updateNameplate(
      this.name,
      this.controlMode === "REMOTE_HUMAN"
    );

    this.closestTrack = this.track.queryClosestTrackPoint(this.position);
    this.lastNormalizedT = this.closestTrack.normalizedSplineT;

    const slot = this.aiSlotIndex;
    const maxSafeOffset = Math.min(4.8, this.track.roadHalfWidth * 0.34);
    this.aiPreferredLateralOffset = Math.max(
      -maxSafeOffset,
      Math.min(maxSafeOffset, (slot - 2) * 2.6)
    );
    this.aiSteerNoisePhase = slot * 2.1;
  }


  public get effectiveMass(): number {
    if (this.novaOverdriveTimer > 0 || this.warpAutopilotTimer > 0) {
      return PHYSICS_CONSTANTS.NOVA_OVERDRIVE_MASS;
    }
    if (this.empShrinkTimer > 0) {
      return Math.max(25, Math.round(this.stats.baseMass * 0.5));
    }
    return this.stats.baseMass;
  }

  public get forwardVector(): Vector3 {
    return new Vector3(Math.sin(this.headingYaw), 0, Math.cos(this.headingYaw));
  }

  public get rightVector(): Vector3 {
    return new Vector3(Math.cos(this.headingYaw), 0, -Math.sin(this.headingYaw));
  }

  public equipPowerUpImmediate(
    item: PowerUpType | null,
    chargesOverride?: number
  ): void {
    this.rouletteTimer = 0;
    this.roulettePreviewItem = null;
    this.pendingAwardedItem = null;
    this.heldItem = item;
    if (!item) {
      this.heldItemCharges = 0;
      this.orbitalShieldCharges = 0;
      this.tripleSeekerCharges = 0;
      this.tripleCryoMineCharges = 0;
      this.goldenOverclockTimer = 0;
      return;
    }
    const defaultCharges =
      item === "TRIPLE_NITRO" ||
      item === "ORBITAL_SHIELD" ||
      item === "TRIPLE_SEEKER" ||
      item === "TRIPLE_CRYO_MINE"
        ? 3
        : 1;
    const charges = Math.max(1, chargesOverride ?? defaultCharges);
    this.heldItemCharges = charges;
    this.orbitalShieldCharges = item === "ORBITAL_SHIELD" ? charges : 0;
    this.tripleSeekerCharges = item === "TRIPLE_SEEKER" ? charges : 0;
    this.tripleCryoMineCharges = item === "TRIPLE_CRYO_MINE" ? charges : 0;
    this.goldenOverclockTimer = item === "GOLDEN_OVERCLOCK" ? 7.5 : 0;
  }

  public awardItemWithRoulette(item: PowerUpType): void {
    if (this.heldItem || this.rouletteTimer > 0) return;
    const safeItem: PowerUpType =
      (item === "LIL_SAUCER" ||
        item === "EMP_SHOCKWAVE" ||
        item === "WARP_AUTOPILOT" ||
        item === "OIL_SQUALL") &&
      this.rank <= 1
        ? "NITRO_CORE"
        : item;
    this.pendingAwardedItem = safeItem;
    this.rouletteTimer = 1.15;
    this.roulettePreviewItem = safeItem;
    if (!this.isPlayer) {
      if (this.aiDifficulty === "EASY") {
        this.aiItemUseDelay = 2.6 + Math.random() * 2.2;
      } else if (this.aiDifficulty === "MEDIUM") {
        this.aiItemUseDelay = 0.48 + Math.random() * 0.65;
      } else {
        // HARD / SELF_LEARNING: Crisp tactical reflex
        this.aiItemUseDelay = 0.22 + Math.random() * 0.35;
      }
    }
  }

  public triggerSpinOut(durationSec = 1.15, upwardKnock = 3.2): void {
    if (
      this.novaOverdriveTimer > 0 ||
      this.phaseCloakTimer > 0 ||
      this.warpAutopilotTimer > 0 ||
      this.spinOutTimer > 0 ||
      this.spinOutMercyTimer > 0
    ) {
      return; // Immune during active invulnerability, active spin-out, or post-spinout recovery grace window
    }
    this.spinOutTimer = Math.max(this.spinOutTimer, durationSec);
    this.combatRecoveryTimer = Math.max(
      this.combatRecoveryTimer,
      durationSec + 2.5
    );
    this.nitroBoostTimer = 0;
    this.boostTimer = 0;
    this.boostMultiplier = 1.0;
    this.activeBoostLabel = null;
    this.prolongedRocketBoostActive = false;
    this.forwardSpeed *= 0.2;
    this.lateralSpeed = 0;
    this.velocity.scaleInPlace(0.2);
    this.driftState = "NONE";
    this.driftDirection = 0;
    this.driftChargeSeconds = 0;
    this.driftChargeSubState = 0;
    this.miniTurboTier = 0;
    this.hopDirectionLocked = false;
    this.pumpPhaseHoldSec = 0;
    this.pumpOutsideHoldSec = 0;
    if (upwardKnock > 0) {
      this.verticalVelocity = Math.max(this.verticalVelocity, upwardKnock);
      this.grounded = false;
    }
    this.cameraShakeTimer = Math.max(this.cameraShakeTimer, 0.45);
  }

  public triggerRocketStartBoost(): void {
    if (this.spinOutTimer > 0) return;
    this.boostTimer = Math.max(
      this.boostTimer,
      PHYSICS_CONSTANTS.ROCKET_START_DURATION_SEC
    );
    this.boostMultiplier = Math.max(
      this.boostMultiplier,
      PHYSICS_CONSTANTS.ROCKET_START_BOOST_MULT
    );
    this.prolongedRocketBoostActive = true;
    this.activeBoostLabel = "PERFECT ROCKET BOOST (+28%)";
    this.forwardSpeed = Math.max(
      this.forwardSpeed,
      this.stats.topSpeed * PHYSICS_CONSTANTS.ROCKET_START_BOOST_MULT
    );
    this.lateralSpeed = 0;
    this.velocity = this.forwardVector.scale(this.forwardSpeed);
    this.cameraShakeTimer = Math.max(this.cameraShakeTimer, 0.16);
  }

  public activateNitroCore(): void {
    if (this.spinOutTimer > 0) return;
    const isOffRoadShortcut =
      this.surface === "OFFROAD" ||
      this.distToCenter > this.track.roadHalfWidth * 0.78;
    globalAiBrain.recordItemUsed(this.racerId, isOffRoadShortcut);
    this.oilSquallTimer = 0;
    this.nitroBoostTimer = 2.0;
    this.boostTimer = Math.max(this.boostTimer, 2.0);
    this.boostMultiplier = 1.45;
    this.prolongedRocketBoostActive = true;
    this.activeBoostLabel = "NITRO CORE (+45%)";
    this.forwardSpeed = Math.max(
      this.forwardSpeed,
      this.stats.topSpeed * 1.35
    );
    this.lateralSpeed = 0;
    const fwd = this.forwardVector;
    this.velocity = fwd.scale(this.forwardSpeed);
  }

  public activateGoldenOverclock(): void {
    if (this.spinOutTimer > 0) return;
    if (this.goldenOverclockTimer <= 0) {
      this.goldenOverclockTimer = 7.5;
    }
    this.activateNitroCore();
    this.activeBoostLabel = "GOLDEN OVERCLOCK (+45%)";
  }

  public activateWarpAutopilot(durationSec = 6.5): void {
    globalAiBrain.recordItemUsed(this.racerId, true);
    this.warpAutopilotTimer = Math.max(4.5, Math.min(10.0, durationSec));
    this.warpAutopilotElapsed = 0;
    this.empShrinkTimer = 0;
    this.oilSquallTimer = 0;
    this.combatRecoveryTimer = 0;
    this.spinOutTimer = 0;
    this.spinOutMercyTimer = 0;
    this.wobbleTimer = 0;
    this.driftState = "NONE";
    this.driftDirection = 0;
    this.prolongedRocketBoostActive = true;
    this.activeBoostLabel = "HYPER-SHUTTLE AUTOPILOT (108 U/S)";
    this.forwardSpeed = Math.max(this.forwardSpeed, 108.0);
    this.lateralSpeed = 0;
    this.velocity = this.forwardVector.scale(this.forwardSpeed);
  }

  public applyOilSquallDebuff(): boolean {
    if (
      this.novaOverdriveTimer > 0 ||
      this.phaseCloakTimer > 0 ||
      this.warpAutopilotTimer > 0 ||
      this.nitroBoostTimer > 0
    ) {
      globalAiBrain.recordDefensiveBlock(this.racerId);
      return false;
    }
    this.oilSquallTimer = 5.0;
    this.wobbleTimer = Math.max(this.wobbleTimer, 0.25);
    this.activeBoostLabel = "OIL SQUALL! VISOR SLICK (-20% GRIP)";
    return true;
  }

  public activateNovaOverdrive(): void {
    globalAiBrain.recordItemUsed(this.racerId, this.surface === "OFFROAD");
    this.novaOverdriveTimer = 7.5;
    this.empShrinkTimer = 0;
    this.oilSquallTimer = 0;
    this.combatRecoveryTimer = 0;
    this.prolongedRocketBoostActive = true;
    this.activeBoostLabel = "NOVA OVERDRIVE (9999 KG)";
    this.spinOutTimer = 0;
    this.wobbleTimer = 0;
    this.forwardSpeed = Math.max(
      this.forwardSpeed,
      this.stats.topSpeed * 1.25
    );
  }

  public activatePhaseCloak(): void {
    globalAiBrain.recordItemUsed(this.racerId, this.surface === "OFFROAD");
    this.phaseCloakTimer = 4.5;
    this.empShrinkTimer = 0;
    this.combatRecoveryTimer = 0;
    this.wobbleTimer = 0;
    this.prolongedRocketBoostActive = true;
    this.activeBoostLabel = "PHANTOM PHASE CLOAK (INTANGIBLE)";
  }

  public applyEmpShockwaveDebuff(): boolean {
    if (
      this.novaOverdriveTimer > 0 ||
      this.phaseCloakTimer > 0 ||
      this.warpAutopilotTimer > 0
    ) {
      globalAiBrain.recordDefensiveBlock(this.racerId);
      return false;
    }
    this.equipPowerUpImmediate(null);
    this.empShrinkTimer = 4.5;
    this.combatRecoveryTimer = Math.max(this.combatRecoveryTimer, 5.0);
    this.triggerSpinOut(0.65, 2.2);
    this.activeBoostLabel = "ION ZAP! MICRO-CHASSIS (-25% SPD)";
    return true;
  }

  private evaluateShortcutCorridor(
    normT: number,
    signedLat: number,
    roadHalfWidth: number
  ): {
    onPavedShortcut: boolean;
    onBoostShortcut: boolean;
    onShallowWater: boolean;
  } {
    let onPavedShortcut = false;
    let onBoostShortcut = false;
    let onShallowWater = false;

    // In Tropical Atoll biome, the outer coastal beach slopes into a shallow turquoise tidal lagoon
    if (
      this.track.biome === "TROPICAL_ATOLL" &&
      Math.abs(signedLat) > roadHalfWidth + 6.0
    ) {
      onShallowWater = true;
    }

    if (!this.track.trackMasks || this.track.trackMasks.length === 0) {
      return { onPavedShortcut, onBoostShortcut, onShallowWater };
    }
    const totalLen = Math.max(100, this.track.totalTrackLength);
    for (const mask of this.track.trackMasks) {
      if (
        mask.type !== "PAVED_SHORTCUT" &&
        mask.type !== "BOOST_SHORTCUT" &&
        mask.type !== "SHALLOW_WATER"
      ) {
        continue;
      }
      let dtMask = normT - mask.normT;
      if (dtMask > 0.5) dtMask -= 1.0;
      if (dtMask < -0.5) dtMask += 1.0;
      const longOffset = dtMask * totalLen;
      const halfLen = mask.length * 0.5;
      if (Math.abs(longOffset) <= halfLen) {
        const u = Math.max(
          0,
          Math.min(1, (longOffset + halfLen) / Math.max(1, mask.length))
        );
        const sideSign = mask.lateral >= 0 ? 1 : -1;
        if (mask.type === "SHALLOW_WATER") {
          const isOffCenter = Math.abs(mask.lateral) > 4.0;
          const latCenter = isOffCenter
            ? sideSign * 6.0 +
              (mask.lateral - sideSign * 6.0) * Math.sin(u * Math.PI)
            : mask.lateral;
          const halfW = mask.width * 0.5 + 0.85;
          if (Math.abs(signedLat - latCenter) <= halfW) {
            onShallowWater = true;
          }
        } else {
          const edgeAnchor = sideSign * Math.max(6.5, roadHalfWidth - 1.0);
          const archLatCenter =
            edgeAnchor + (mask.lateral - edgeAnchor) * Math.sin(u * Math.PI);
          const halfW = mask.width * 0.5 + 1.05;
          if (Math.abs(signedLat - archLatCenter) <= halfW) {
            if (mask.type === "PAVED_SHORTCUT") {
              onPavedShortcut = true;
            } else {
              onBoostShortcut = true;
            }
          }
        }
      }
    }
    return { onPavedShortcut, onBoostShortcut, onShallowWater };
  }

  public computeAiInputs(
    dt: number,
    activeItemBoxPositions?: Vector3[],
    allRacers?: KartController[],
    activeTrapPositions?: Vector3[]
  ): ControlInputState {
    this.aiSteerNoisePhase += dt * 1.15;
    if (this.aiDriftCooldown > 0) {
      this.aiDriftCooldown = Math.max(0, this.aiDriftCooldown - dt);
    }
    const diff = this.aiDifficulty;
    const isProOrLearning = diff === "HARD" || diff === "SELF_LEARNING";
    const policy = globalAiBrain.getGenomeForSlot(
      diff,
      this.aiSlotIndex,
      this.stats.character.id
    ).weights;
    const totalLen = Math.max(120, this.track.totalTrackLength);
    const baseT = this.closestTrack.normalizedSplineT;
    const roadHalf =
      this.closestTrack.localRoadHalfWidth || this.track.roadHalfWidth;
    const localWallHalf =
      this.closestTrack.localWallHalfWidth || this.track.wallHalfWidth;

    const hasReadyBoostItem =
      (this.heldItem === "NITRO_CORE" ||
        this.heldItem === "TRIPLE_NITRO" ||
        this.heldItem === "GOLDEN_OVERCLOCK" ||
        this.heldItem === "NOVA_OVERDRIVE" ||
        this.heldItem === "WARP_AUTOPILOT" ||
        this.heldItem === "PHASE_CLOAK") &&
      this.rouletteTimer <= 0 &&
      this.aiItemUseDelay <= 0.15 &&
      diff !== "EASY";

    const hasActiveOffRoadImmunity =
      this.boostTimer > 0 ||
      this.nitroBoostTimer > 0 ||
      this.novaOverdriveTimer > 0 ||
      this.warpAutopilotTimer > 0 ||
      this.phaseCloakTimer > 0 ||
      this.prolongedRocketBoostActive;

    const hasSustainedShortcutImmunity =
      this.boostTimer > 0.75 ||
      this.nitroBoostTimer > 0.55 ||
      this.novaOverdriveTimer > 0.55 ||
      this.warpAutopilotTimer > 0.55 ||
      this.phaseCloakTimer > 0.55;

    if (
      this.distToCenter > localWallHalf - 2.2 ||
      this.spinOutTimer > 0
    ) {
      this.aiDriftCooldown = Math.max(this.aiDriftCooldown, 0.45);
    }

    // 1. Sample upcoming track curvature in physical meters (+10m immediate, +20m near, +32m mid, +46m far, +preemptiveLeadDist)
    const preemptiveLeadDist = Math.max(
      18,
      Math.min(58, policy.preemptiveDriftLeadMeters ?? 38.0)
    );
    const immProbeT = (baseT + 10 / totalLen) % 1.0;
    const nearProbeT = (baseT + 20 / totalLen) % 1.0;
    const midProbeT = (baseT + 32 / totalLen) % 1.0;
    const farProbeT = (baseT + 46 / totalLen) % 1.0;
    const leadProbeT = (baseT + preemptiveLeadDist / totalLen) % 1.0;
    const immProbe = this.track.getPointAtNormalizedT(immProbeT, 0);
    const nearProbe = this.track.getPointAtNormalizedT(nearProbeT, 0);
    const midProbe = this.track.getPointAtNormalizedT(midProbeT, 0);
    const farProbe = this.track.getPointAtNormalizedT(farProbeT, 0);
    const leadProbe = this.track.getPointAtNormalizedT(leadProbeT, 0);

    const curveDot = Math.min(
      Vector3.Dot(this.closestTrack.tangent, immProbe.tangent),
      Vector3.Dot(this.closestTrack.tangent, nearProbe.tangent),
      Vector3.Dot(this.closestTrack.tangent, midProbe.tangent)
    );

    // Signed turn projections (+ = right turn, - = left turn) relative to current track cross-section
    const immTurnRight = Vector3.Dot(
      immProbe.tangent,
      this.closestTrack.binormal
    );
    const nearTurnRight = Vector3.Dot(
      nearProbe.tangent,
      this.closestTrack.binormal
    );
    const midTurnRight = Vector3.Dot(
      midProbe.tangent,
      this.closestTrack.binormal
    );
    const farTurnRight = Vector3.Dot(
      farProbe.tangent,
      this.closestTrack.binormal
    );
    const leadTurnRight = Vector3.Dot(
      leadProbe.tangent,
      this.closestTrack.binormal
    );

    const localBlendedTurn =
      immTurnRight * 0.35 +
      nearTurnRight * 0.3 +
      midTurnRight * 0.22 +
      leadTurnRight * 0.13;
    const turnStrength = Math.max(
      Math.abs(immTurnRight * 0.9),
      Math.abs(nearTurnRight),
      Math.abs(midTurnRight * 0.94),
      Math.abs(leadTurnRight * 0.85)
    );
    const cornerTurnDir: -1 | 0 | 1 =
      Math.abs(localBlendedTurn) > 0.045
        ? localBlendedTurn > 0
          ? 1
          : -1
        : Math.abs(nearTurnRight) > 0.06
        ? nearTurnRight > 0
          ? 1
          : -1
        : Math.abs(leadTurnRight) > 0.08
        ? leadTurnRight > 0
          ? 1
          : -1
        : 0;

    // 2. Predictive Jump Ramp Alignment
    // When approaching an actual stunt jump ramp (`JUMP_RAMP`), the kart will be launched airborne
    // for ~46m-68m where steering authority is minimal. Line up with the safe ballistic landing zone
    // on the final approach to the ramp without interfering with normal corner drifting elsewhere!
    const isNearEdge = this.distToCenter > roadHalf * 0.68;
    let isAligningForJump = false;
    let jumpTargetWorldPos: Vector3 | null = null;

    if (this.spinOutTimer <= 0) {
      const estLaunchSpeed = Math.max(
        this.forwardSpeed,
        this.stats.topSpeed * 1.32
      );
      const estFlightMeters = Math.min(
        68,
        Math.max(46, estLaunchSpeed * 1.02)
      );
      const maxRampSetupDist = isProOrLearning
        ? 48
        : diff === "MEDIUM"
        ? 42
        : 34;
      const maxRampSetupLat = isProOrLearning
        ? roadHalf * 0.58
        : diff === "MEDIUM"
        ? roadHalf * 0.48
        : 4.5;

      let bestRampDistToLip = Number.POSITIVE_INFINITY;

      for (const obs of this.track.obstacles) {
        if (obs.type !== "JUMP_RAMP") continue;
        const scale = obs.scale ?? 1.0;
        const halfW = 2.65 * scale;
        const halfL = 2.7 * scale;

        const sinY = Math.sin(obs.rotationY);
        const cosY = Math.cos(obs.rotationY);
        const rampFwd = new Vector3(sinY, 0, cosY);
        const rampRight = new Vector3(cosY, 0, -sinY);

        const dx = this.position.x - obs.position.x;
        const dz = this.position.z - obs.position.z;
        const localZ = dx * sinY + dz * cosY;
        const localX = dx * cosY - dz * sinY;
        const distToLip = halfL - localZ;

        if (distToLip < -1.0 || distToLip > maxRampSetupDist) continue;

        const inDirectRampPath =
          distToLip <= 22.0 && Math.abs(localX) <= halfW + 1.0;
        const canMergeEarly =
          this.grounded &&
          this.driftState === "NONE" &&
          !isNearEdge &&
          distToLip > 18.0 &&
          Math.abs(localX) <= maxRampSetupLat;

        if (!inDirectRampPath && !canMergeEarly) continue;
        if (distToLip >= bestRampDistToLip) continue;

        bestRampDistToLip = distToLip;

        // Query the ballistic landing zone (~46m-68m past the ramp) and mid-air apex (~55% flight distance)
        const rampTrack = this.track.queryClosestTrackPoint(
          obs.position,
          this.closestTrack.sampleIndex
        );
        const midAirT =
          (rampTrack.normalizedSplineT + (estFlightMeters * 0.55) / totalLen) %
          1.0;
        const landingT =
          (rampTrack.normalizedSplineT + estFlightMeters / totalLen) % 1.0;
        const postLandingT =
          (rampTrack.normalizedSplineT + (estFlightMeters + 18) / totalLen) %
          1.0;

        const midAirSample = this.track.getPointAtNormalizedT(midAirT, 0);
        const landingSample = this.track.getPointAtNormalizedT(landingT, 0);
        const postLandingSample = this.track.getPointAtNormalizedT(
          postLandingT,
          0
        );

        // Bias landing target slightly toward the inside of any curve at the touchdown zone
        const landingTurnRight = Vector3.Dot(
          postLandingSample.tangent,
          landingSample.binormal
        );
        const insideLandingLat = Math.max(
          -roadHalf * 0.3,
          Math.min(roadHalf * 0.3, landingTurnRight * roadHalf * 0.5)
        );
        const safeLandingPos = this.track
          .getPointAtNormalizedT(landingT, insideLandingLat)
          .position.clone();

        // Ensure the straight-line airborne chord from the ramp to safeLandingPos stays safely over the road at mid-flight
        const chordMid = Vector3.Lerp(obs.position, safeLandingPos, 0.55);
        const midAirOffset = Vector3.Dot(
          chordMid.subtract(midAirSample.position),
          midAirSample.binormal
        );
        if (Math.abs(midAirOffset) > roadHalf * 0.38) {
          Vector3.LerpToRef(
            safeLandingPos,
            midAirSample.position,
            0.38,
            safeLandingPos
          );
        }

        // Optimal horizontal takeoff direction vector from the ramp to the landing zone
        const launchDir = safeLandingPos.subtract(obs.position);
        launchDir.y = 0;
        if (launchDir.lengthSquared() > 1e-4) {
          launchDir.normalize();
        } else {
          launchDir.copyFrom(rampFwd);
        }

        if (distToLip > 14.0) {
          // Early setup phase (> 14m before ramp lip): aim at a pre-ramp lead-in waypoint behind the ramp along -launchDir
          const leadInMeters = Math.min(
            14.0,
            Math.max(5.0, (distToLip - 9.0) * 0.45)
          );
          jumpTargetWorldPos = obs.position.subtract(
            launchDir.scale(leadInMeters)
          );
        } else if (distToLip > 4.5) {
          // Final approach to ramp base (4.5m..14m): straighten out for the ramp and sight down launchDir
          isAligningForJump = true;
          jumpTargetWorldPos = this.position
            .add(launchDir.scale(32.0))
            .subtract(rampRight.scale(localX * 0.65));
        } else {
          // On the ramp wedge up to the launch lip (<= 4.5m): lock steering purely parallel to launchDir
          isAligningForJump = true;
          jumpTargetWorldPos = this.position.add(launchDir.scale(40.0));
        }
      }
    }

    // 3. Adaptive Look-Ahead Distance (driven by Policy Genome)
    const isCommittedToDrift =
      !isAligningForJump &&
      (this.driftState === "DRIFT_ACTIVE" || this.driftState === "HOPPING");
    let lookAheadMeters = policy.lookAheadBase;
    if (!this.grounded && this.driftState !== "HOPPING") {
      // While airborne off a jump, sight toward the touchdown corridor ahead
      lookAheadMeters = Math.min(
        48.0,
        Math.max(28.0, this.forwardSpeed * 0.68)
      );
    } else if (isNearEdge && !hasActiveOffRoadImmunity) {
      lookAheadMeters = 15.0;
    } else if (isCommittedToDrift) {
      lookAheadMeters = policy.lookAheadDrift;
    } else if (curveDot < 0.78) {
      lookAheadMeters = policy.lookAheadCurve;
    } else if (curveDot < 0.9) {
      lookAheadMeters = 0.5 * (policy.lookAheadBase + policy.lookAheadCurve);
    }

    const lookAheadT = (baseT + lookAheadMeters / totalLen) % 1.0;

    // 4. Base Lateral Target + Controlled Inside Apex Cutting
    const cornerCentering = Math.max(0, Math.min(1, (curveDot - 0.8) / 0.18));
    const edgeCentering = hasActiveOffRoadImmunity
      ? 0.85
      : Math.max(0, Math.min(1, 1 - this.distToCenter / (roadHalf * 0.8)));

    // High-handling karts (Pip 2.15, Nyx 2.10) naturally carve tighter, so slightly moderate their target inside cut
    // so they hug the apex cleanly instead of diving too far inside!
    const handlingCutMod = Math.max(
      0.78,
      1.0 - Math.max(0, this.stats.handling - 1.8) * 0.35
    );

    let desiredLateral = 0;
    if (!this.grounded && this.driftState !== "HOPPING") {
      // Aim toward safe center-inside of the landing curve while airborne
      desiredLateral = Math.max(
        -roadHalf * 0.25,
        Math.min(roadHalf * 0.25, midTurnRight * roadHalf * 0.4)
      );
    } else if (isCommittedToDrift && this.driftDirection !== 0) {
      const baseDriftCut = policy.driftCutRatio * handlingCutMod;
      const insideCutRatio = hasActiveOffRoadImmunity
        ? Math.min(0.48, baseDriftCut * 1.35)
        : hasReadyBoostItem
        ? Math.min(0.44, baseDriftCut * 1.18)
        : baseDriftCut;
      desiredLateral = this.driftDirection * roadHalf * insideCutRatio;
    } else {
      const boostCutBonus = hasActiveOffRoadImmunity
        ? 1.25
        : hasReadyBoostItem
        ? 1.15
        : 1.0;
      const preemptiveApexSignal =
        nearTurnRight * 0.65 + leadTurnRight * 0.35;
      const apexLateralBias =
        Math.max(-1, Math.min(1, preemptiveApexSignal * 2.35)) *
        (roadHalf * policy.apexCutRatio * handlingCutMod * boostCutBonus);

      const noiseAmp =
        diff === "SELF_LEARNING"
          ? 0.15
          : diff === "HARD"
          ? 0.32
          : diff === "MEDIUM"
          ? 0.58
          : 1.15;
      const rawOffset =
        (this.aiPreferredLateralOffset * 0.7 +
          Math.sin(this.aiSteerNoisePhase) * noiseAmp) *
          cornerCentering *
          edgeCentering +
        apexLateralBias * edgeCentering;

      const maxSafeLat =
        roadHalf *
        (hasActiveOffRoadImmunity
          ? 0.72
          : isProOrLearning
          ? 0.58
          : diff === "MEDIUM"
          ? 0.52
          : 0.44);
      desiredLateral = Math.max(-maxSafeLat, Math.min(maxSafeLat, rawOffset));
    }

    const baseTargetSample = this.track.getPointAtNormalizedT(
      lookAheadT,
      desiredLateral
    );
    let targetWorldPos = jumpTargetWorldPos
      ? jumpTargetWorldPos
      : baseTargetSample.position.clone();

    // Helper to check if an item box crystal is booby-trapped by a nearby Cryo Mine, Glitch Prism, or Obstacle
    const isPositionBoobyTrapped = (pos: Vector3): boolean => {
      if (diff === "EASY") return false;
      const trapCheckRadiusSq = 3.8 * 3.8;
      if (activeTrapPositions && activeTrapPositions.length > 0) {
        for (const trapPos of activeTrapPositions) {
          const dx = pos.x - trapPos.x;
          const dz = pos.z - trapPos.z;
          if (dx * dx + dz * dz <= trapCheckRadiusSq) {
            return true;
          }
        }
      }
      for (const obs of this.track.obstacles) {
        if (obs.type === "JUMP_RAMP") continue;
        const dx = pos.x - obs.position.x;
        const dz = pos.z - obs.position.z;
        const r = obs.radius + 2.2;
        if (dx * dx + dz * dz <= r * r) {
          return true;
        }
      }
      return false;
    };

    // 5. Active Speed Booster Pad & Trap-Aware Item Box Seeking (only when grounded, settled on straightaways/gentle curves, and not drifting)
    if (
      this.grounded &&
      !isAligningForJump &&
      !jumpTargetWorldPos &&
      !isNearEdge &&
      !isCommittedToDrift &&
      curveDot > 0.84 &&
      this.spinOutTimer <= 0
    ) {
      const maxPadForward = isProOrLearning ? 56 : diff === "MEDIUM" ? 48 : 24;
      const maxPadLateralReach = isProOrLearning
        ? roadHalf * 0.65
        : diff === "MEDIUM"
        ? roadHalf * 0.58
        : 2.8;

      let bestPadScore = Number.POSITIVE_INFINITY;
      let chosenPadPos: Vector3 | null = null;

      for (let pIdx = 0; pIdx < this.track.boostPads.length; pIdx++) {
        if (diff === "EASY" && (pIdx + this.aiSlotIndex) % 4 !== 0) continue;
        if (diff === "MEDIUM" && (pIdx + this.aiSlotIndex) % 4 === 0) continue;

        const pad = this.track.boostPads[pIdx];
        const toPad = pad.position.subtract(this.position);
        toPad.y = 0;
        const fwdDist = Vector3.Dot(toPad, this.closestTrack.tangent);
        if (fwdDist < 5.0 || fwdDist > maxPadForward) continue;

        const latDiff = Math.abs(Vector3.Dot(toPad, this.closestTrack.binormal));
        if (latDiff > maxPadLateralReach) continue;
        if (isPositionBoobyTrapped(pad.position)) continue;

        // Check curvature 20m and 38m past the boost pad so AI doesn't hit a +38% boost straight into a hairpin wall
        const padTrack = this.track.queryClosestTrackPoint(
          pad.position,
          this.closestTrack.sampleIndex
        );
        const padAfter20 = this.track.getPointAtNormalizedT(
          (padTrack.normalizedSplineT + 20 / totalLen) % 1.0,
          0
        );
        const padAfter38 = this.track.getPointAtNormalizedT(
          (padTrack.normalizedSplineT + 38 / totalLen) % 1.0,
          0
        );
        const postPadCurveDot = Math.min(
          Vector3.Dot(padTrack.tangent, padAfter20.tangent),
          Vector3.Dot(padTrack.tangent, padAfter38.tangent)
        );
        const postPadTurnRight = Vector3.Dot(
          padAfter20.tangent,
          padTrack.binormal
        );
        // Skip boost pads that launch directly into a severe hairpin (< 0.56) or sit on the outside edge before a sharp turn (< 0.72)
        if (
          postPadCurveDot < 0.56 ||
          (postPadCurveDot < 0.72 &&
            postPadTurnRight * padTrack.signedLateralOffset < -1.2)
        ) {
          continue;
        }

        const score = fwdDist + latDiff * 1.4;
        if (score < bestPadScore) {
          bestPadScore = score;
          chosenPadPos = pad.position;
        }
      }

      // Active Item Box Hunting when empty-handed (MEDIUM, HARD, SELF_LEARNING)
      // Automatically inspects item box crystals for nearby Cryo Mines / Glitch Prisms and selects a clean crystal!
      let isSeekingItemBox = false;
      if (
        !chosenPadPos &&
        !this.heldItem &&
        this.rouletteTimer <= 0 &&
        activeItemBoxPositions &&
        activeItemBoxPositions.length > 0 &&
        diff !== "EASY"
      ) {
        const maxBoxForward = isProOrLearning ? 52 : 44;
        const maxBoxLateral = isProOrLearning
          ? roadHalf * 0.65
          : roadHalf * 0.56;
        let bestBoxScore = Number.POSITIVE_INFINITY;

        for (let bIdx = 0; bIdx < activeItemBoxPositions.length; bIdx++) {
          const boxPos = activeItemBoxPositions[bIdx];
          const toBox = boxPos.subtract(this.position);
          toBox.y = 0;
          const fwdDist = Vector3.Dot(toBox, this.closestTrack.tangent);
          if (fwdDist < 5.0 || fwdDist > maxBoxForward) continue;
          const latDiff = Math.abs(
            Vector3.Dot(toBox, this.closestTrack.binormal)
          );
          if (latDiff > maxBoxLateral) continue;

          // Skip booby-trapped item box crystals so AI steers to an adjacent clean crystal in the row
          if (isPositionBoobyTrapped(boxPos)) continue;

          const score = fwdDist + latDiff * 1.3;
          if (score < bestBoxScore) {
            bestBoxScore = score;
            chosenPadPos = boxPos;
            isSeekingItemBox = true;
          }
        }
      }

      if (chosenPadPos) {
        const seekBlend = isSeekingItemBox
          ? policy.itemSeekWeight ?? policy.padSeekWeight
          : policy.padSeekWeight;
        targetWorldPos = Vector3.Lerp(
          targetWorldPos,
          chosenPadPos,
          seekBlend
        );
      }
    }

    // 5b. Track Masks: Shortcut Discovery (`PAVED_SHORTCUT` & `BOOST_SHORTCUT`), Split Medians (`SPLIT_MEDIAN`), & Road Holes (`ROAD_HOLE`)
    let emergencyHoleHop = false;
    let activeBoostShortcutTrigger = false;
    let isRidingShortcutCorridor = false;
    const shortcutSeekWeight =
      diff === "EASY" ? 0 : policy.shortcutSeekWeight ?? 0.85;

    if (
      this.grounded &&
      !isAligningForJump &&
      this.track.trackMasks &&
      this.track.trackMasks.length > 0
    ) {
      const currentLat = this.closestTrack.signedLateralOffset;
      for (const mask of this.track.trackMasks) {
        let dtMask = baseT - mask.normT;
        if (dtMask > 0.5) dtMask -= 1.0;
        if (dtMask < -0.5) dtMask += 1.0;
        const longOffset = dtMask * totalLen; // negative = approaching mask center, positive = past mask center
        const halfLen = mask.length * 0.5;

        if (mask.type === "ROAD_HOLE") {
          if (longOffset > -(halfLen + 36.0) && longOffset < halfLen) {
            const sideSign = currentLat >= mask.lateral ? 1 : -1;
            const laneOffset =
              mask.lateral + sideSign * (mask.width * 0.5 + 3.8);
            const safeLanePt = this.track.getPointAtNormalizedT(
              lookAheadT,
              laneOffset
            );
            targetWorldPos = Vector3.Lerp(
              targetWorldPos,
              safeLanePt.position,
              0.85
            );
            if (
              longOffset > -(halfLen + 7.5) &&
              longOffset < halfLen + 2.0 &&
              Math.abs(currentLat - mask.lateral) < mask.width * 0.5 + 1.2
            ) {
              emergencyHoleHop = true;
            }
          }
        } else if (mask.type === "SPLIT_MEDIAN") {
          // Parallel Split Route: choose the cleaner/inside branch early (-halfLen - 40m) and hold that route smoothly
          if (longOffset > -(halfLen + 40.0) && longOffset < halfLen + 6.0) {
            const sideSign =
              Math.abs(currentLat - mask.lateral) > 1.2
                ? currentLat >= mask.lateral
                  ? 1
                  : -1
                : cornerTurnDir !== 0
                ? cornerTurnDir
                : this.aiSlotIndex % 2 === 0
                ? 1
                : -1;
            const branchCenterOffset =
              mask.lateral + sideSign * (mask.width * 0.5 + 4.2);
            const safeLanePt = this.track.getPointAtNormalizedT(
              lookAheadT,
              branchCenterOffset
            );
            targetWorldPos = Vector3.Lerp(
              targetWorldPos,
              safeLanePt.position,
              0.88
            );
          }
        } else if (
          mask.type === "PAVED_SHORTCUT" &&
          shortcutSeekWeight > 0.32
        ) {
          // Technical Paved Shortcut Bypass: requires precision steering, no boost item needed!
          if (longOffset > -(halfLen + 26.0) && longOffset < halfLen - 2.0) {
            const sideSign = mask.lateral >= 0 ? 1 : -1;
            const edgeAnchor = sideSign * Math.max(6.5, roadHalf - 1.0);
            const uNow = Math.max(
              0,
              Math.min(1, (longOffset + halfLen) / Math.max(1, mask.length))
            );
            const archLatNow =
              edgeAnchor + (mask.lateral - edgeAnchor) * Math.sin(uNow * Math.PI);
            const alreadyInCorridor =
              longOffset >= -halfLen &&
              Math.abs(currentLat - archLatNow) <= mask.width * 0.5 + 3.2;
            const canEnterCleanly =
              longOffset < -halfLen + 10.0 &&
              sideSign * currentLat > -roadHalf * 0.35;

            if (alreadyInCorridor || canEnterCleanly) {
              isRidingShortcutCorridor = true;
              const uLook = Math.max(
                0,
                Math.min(
                  1,
                  (longOffset + 15.0 + halfLen) / Math.max(1, mask.length)
                )
              );
              const archLatLook =
                edgeAnchor +
                (mask.lateral - edgeAnchor) * Math.sin(uLook * Math.PI);
              const lookShortcutT =
                (mask.normT +
                  ((uLook - 0.5) * mask.length) / totalLen +
                  1.0) %
                1.0;
              const shortcutPt = this.track.getPointAtNormalizedT(
                lookShortcutT,
                archLatLook
              );
              targetWorldPos = Vector3.Lerp(
                targetWorldPos,
                shortcutPt.position,
                Math.min(0.95, 0.55 + shortcutSeekWeight * 0.38)
              );
            }
          }
        } else if (
          mask.type === "BOOST_SHORTCUT" &&
          shortcutSeekWeight > 0.38
        ) {
          // Boosted Off-Road Shortcut Zone: only commit if carrying a ready boost item, already boost-immune, or already inside the shortcut!
          if (longOffset > -(halfLen + 24.0) && longOffset < halfLen - 2.0) {
            const sideSign = mask.lateral >= 0 ? 1 : -1;
            const edgeAnchor = sideSign * Math.max(6.5, roadHalf - 1.0);
            const uNow = Math.max(
              0,
              Math.min(1, (longOffset + halfLen) / Math.max(1, mask.length))
            );
            const archLatNow =
              edgeAnchor + (mask.lateral - edgeAnchor) * Math.sin(uNow * Math.PI);
            const alreadyInCorridor =
              longOffset >= -halfLen &&
              Math.abs(currentLat - archLatNow) <= mask.width * 0.5 + 2.8;
            const canCommitWithBoost =
              (hasSustainedShortcutImmunity || hasReadyBoostItem) &&
              sideSign * currentLat > -roadHalf * 0.3;

            if (alreadyInCorridor || canCommitWithBoost) {
              isRidingShortcutCorridor = true;
              const uLook = Math.max(
                0,
                Math.min(
                  1,
                  (longOffset + 16.0 + halfLen) / Math.max(1, mask.length)
                )
              );
              const archLatLook =
                edgeAnchor +
                (mask.lateral - edgeAnchor) * Math.sin(uLook * Math.PI);
              const lookShortcutT =
                (mask.normT +
                  ((uLook - 0.5) * mask.length) / totalLen +
                  1.0) %
                1.0;
              const shortcutPt = this.track.getPointAtNormalizedT(
                lookShortcutT,
                archLatLook
              );
              targetWorldPos = Vector3.Lerp(
                targetWorldPos,
                shortcutPt.position,
                Math.min(0.95, 0.58 + shortcutSeekWeight * 0.35)
              );

              // Trigger held boost item as soon as wheels enter or approach the off-road shortcut cut!
              if (
                longOffset >= -halfLen - 4.0 &&
                !hasActiveOffRoadImmunity &&
                hasReadyBoostItem
              ) {
                activeBoostShortcutTrigger = true;
              }
            }
          }
        }
      }
    }

    // 6. Curved-Spline Track-Hazard & Deployed Trap Avoidance (Oil Slicks, Water Puddles, Crates, Cones, Cryo Mines & Glitch Prisms)
    const hazardAvoidWeight =
      diff === "EASY" ? 0 : policy.hazardAvoidanceWeight ?? 1.0;
    if (
      this.grounded &&
      !isAligningForJump &&
      hazardAvoidWeight > 0.1 &&
      !hasActiveOffRoadImmunity
    ) {
      const maxHazardLookAhead = Math.min(
        46.0,
        28.0 + hazardAvoidWeight * 12.0
      );
      const avoidHazardAt = (obsPos: Vector3, radius: number) => {
        const toObs = obsPos.subtract(this.position);
        toObs.y = 0;
        const approxDistSq = toObs.lengthSquared();
        if (
          approxDistSq < 1.5 ||
          approxDistSq > (maxHazardLookAhead + 6) * (maxHazardLookAhead + 6)
        ) {
          return;
        }
        // Project hazard into curved-spline coordinates so we detect traps around curved corners!
        const obsTrack = this.track.queryClosestTrackPoint(
          obsPos,
          this.closestTrack.sampleIndex
        );
        let dT = obsTrack.normalizedSplineT - baseT;
        if (dT > 0.5) dT -= 1.0;
        if (dT < -0.5) dT += 1.0;
        const fwdArcDist = dT * totalLen;
        if (fwdArcDist < 1.8 || fwdArcDist > maxHazardLookAhead) return;

        const obsLat = obsTrack.signedLateralOffset;
        const plannedLatAtObs =
          this.closestTrack.signedLateralOffset *
            Math.max(0, 1 - fwdArcDist / Math.max(15, lookAheadMeters)) +
          desiredLateral *
            Math.min(1, fwdArcDist / Math.max(15, lookAheadMeters));
        const safeClearance =
          (radius + 2.8) * Math.min(1.25, 0.75 + hazardAvoidWeight * 0.35);
        const latDelta = plannedLatAtObs - obsLat;

        if (Math.abs(latDelta) < safeClearance) {
          // Pick the side with more room on the road so avoiding a trap never pushes us into an outer wall
          const roomRight = roadHalf * 0.78 - obsLat;
          const roomLeft = roadHalf * 0.78 + obsLat;
          let evadeSign: -1 | 1 = latDelta >= 0 ? 1 : -1;
          if (evadeSign === 1 && roomRight < 2.2) evadeSign = -1;
          if (evadeSign === -1 && roomLeft < 2.2) evadeSign = 1;

          const urgency =
            (1 - fwdArcDist / maxHazardLookAhead) *
            (1 - Math.abs(latDelta) / safeClearance);
          const shiftMeters =
            evadeSign * safeClearance * (0.65 + urgency * 0.55);
          targetWorldPos.addInPlace(
            this.closestTrack.binormal.scale(shiftMeters)
          );
        }
      };

      for (const obs of this.track.obstacles) {
        if (obs.type === "JUMP_RAMP") continue;
        avoidHazardAt(obs.position, obs.radius);
      }
      if (activeTrapPositions && activeTrapPositions.length > 0) {
        for (const trapPos of activeTrapPositions) {
          avoidHazardAt(trapPos, 1.55);
        }
      }
    }

    // 6b. Juggernaut & Pack Lateral Spacing (prevents lighter AI karts from steering into heavier Juggernauts)
    let packLateralShift = 0;
    const juggernautAvoidScale = policy.juggernautAvoidanceWeight ?? 1.0;
    if (
      this.grounded &&
      !isAligningForJump &&
      diff !== "EASY" &&
      allRacers &&
      allRacers.length > 1
    ) {
      for (const other of allRacers) {
        if (other.racerId === this.racerId) continue;
        const massAdvantage = other.effectiveMass - this.effectiveMass;
        if (massAdvantage < 20) continue;

        const toOther = other.position.subtract(this.position);
        toOther.y = 0;
        const fwdDist = Vector3.Dot(toOther, this.closestTrack.tangent);
        if (fwdDist < -2.4 || fwdDist > 13.5) continue;

        const latSep = Vector3.Dot(toOther, this.closestTrack.binormal);
        const absLatSep = Math.abs(latSep);
        if (absLatSep < 4.2) {
          // Steer toward the open side away from the heavier kart unless near the road edge
          const rawAwaySign = latSep >= 0 ? -1 : 1;
          const currentLat = this.closestTrack.signedLateralOffset;
          const safeEdgeLimit = roadHalf * 0.68;
          const awaySign =
            rawAwaySign * currentLat > safeEdgeLimit
              ? -rawAwaySign
              : rawAwaySign;
          const urgency = (1 - absLatSep / 4.2) * Math.min(1.3, massAdvantage / 90);
          const lateralShift =
            awaySign * 2.35 * urgency * juggernautAvoidScale;
          packLateralShift += lateralShift;
          targetWorldPos.addInPlace(
            this.closestTrack.binormal.scale(lateralShift)
          );
        }
      }
    }

    const toTarget = targetWorldPos.subtract(this.position);
    toTarget.y = 0;
    if (toTarget.lengthSquared() > 1e-4) {
      toTarget.normalize();
    }

    const fwd = this.forwardVector;
    const right = this.rightVector;
    const lateralDot = Vector3.Dot(toTarget, right);
    const forwardDot = Vector3.Dot(toTarget, fwd);

    const signedLat = this.closestTrack.signedLateralOffset;
    const trackLateralVel = Vector3.Dot(
      this.velocity,
      this.closestTrack.binormal
    );
    const signedLatRatio = signedLat / Math.max(1, roadHalf);
    const latVelRatio = trackLateralVel / Math.max(15, this.forwardSpeed);
    const handlingNorm = (this.stats.handling - 1.75) / 0.4;

    // Signed angular error in radians [-pi, pi] toward the look-ahead target + cross-track velocity damping
    const angleError = Math.atan2(lateralDot, forwardDot);
    const baseSteerGain = policy.steerGain;
    const steerGain = isAligningForJump
      ? Math.max(baseSteerGain, 2.65)
      : baseSteerGain;

    const neuralResidual = evaluateNeuralResidualSteer(policy, {
      angleError,
      signedLatRatio,
      latVelRatio,
      nearTurnRight,
      midTurnRight,
      speedRatio: this.forwardSpeed / Math.max(1, this.stats.topSpeed),
      driftDir: this.driftDirection,
      handlingNorm,
    });

    // Include cross-track lateral velocity damping so high-speed boosts never oscillate across the road centerline
    const normalLatDamping = !isAligningForJump ? -latVelRatio * 0.55 : 0;
    let steer = Math.max(
      -1,
      Math.min(1, angleError * steerGain + normalLatDamping + neuralResidual)
    );

    // 7. Committed Hop-Drift Execution & Off-Road Boost Strategy
    const predPos = this.position.add(this.velocity.scale(0.42));
    const predTrack = this.track.queryClosestTrackPoint(
      predPos,
      this.closestTrack.sampleIndex
    );
    const predWallHalf =
      predTrack.localWallHalfWidth || this.track.wallHalfWidth;

    const preferredCharge = policy.preferredChargeSec;
    const maxHoldCharge = policy.maxHoldChargeSec;

    let wantDrift = false;
    let hopSwitchDrift = false;

    if (
      this.spinOutTimer <= 0 &&
      !isAligningForJump &&
      !isRidingShortcutCorridor
    ) {
      if (this.driftState === "HOPPING") {
        // Always hold drift throughout the entire airborne entry hop so landing locks cleanly into DRIFT_ACTIVE!
        const hopDir =
          this.driftDirection !== 0
            ? this.driftDirection
            : cornerTurnDir !== 0
            ? cornerTurnDir
            : (Math.sign(steer) as -1 | 1) || 1;
        if (this.distToCenter <= localWallHalf - 2.0) {
          wantDrift = true;
          steer = hopDir * Math.max(0.76, Math.abs(steer));
        } else {
          wantDrift = false;
        }
      } else if (
        this.driftState === "DRIFT_ACTIVE" &&
        this.driftDirection !== 0
      ) {
        const insideSignedLat = this.driftDirection * signedLat;
        const insideTrackVel = this.driftDirection * trackLateralVel;
        const alignedError = this.driftDirection * angleError;

        // Abort drift if approaching outer wall OR if heading has rotated > 48 deg away from the track tangent toward the edge
        const tangentAlignDot = Vector3.Dot(fwd, this.closestTrack.tangent);
        const hittingOuterWall =
          this.distToCenter > localWallHalf - 2.6 ||
          predTrack.horizontalDistance > predWallHalf - 2.0 ||
          (tangentAlignDot < 0.55 && this.distToCenter > roadHalf * 0.85);

        // Off-Road Grass Boost Strategy:
        // If on un-immune off-road grass:
        // - If `miniTurboTier === 0`, keep holding the drift until Tier 1 Blue Sparks (1.0s) locks in (unless hitting wall).
        // - Once `miniTurboTier >= 1`, cash in the boost immediately unless within ~0.32s of the next tier!
        const nearNextTierOnGrass =
          (this.driftChargeSeconds >= 0.65 && this.driftChargeSeconds < 1.02) ||
          (diff !== "EASY" &&
            this.driftChargeSeconds >= 1.88 &&
            this.driftChargeSeconds < 2.22) ||
          (isProOrLearning &&
            this.driftChargeSeconds >= 3.28 &&
            this.driftChargeSeconds < 3.62);

        const cashInBoostForOffRoad =
          this.surface === "OFFROAD" &&
          !hasActiveOffRoadImmunity &&
          this.miniTurboTier >= 1 &&
          !nearNextTierOnGrass &&
          this.distToCenter > (this.closestTrack.localCurbWidth || this.track.curbWidth) + 0.9;

        // Also cash in a charged Mini-Turbo if the kart has hooked too deep onto the inside shoulder and is moving further inward
        const hookedTooDeepInside =
          this.miniTurboTier >= 1 &&
          insideSignedLat > roadHalf * 0.78 &&
          insideTrackVel > 2.5;

        // S-curve reversal detection
        const oppositeTurnAhead =
          this.driftDirection * immTurnRight < -0.14 &&
          this.driftDirection * nearTurnRight < -0.2 &&
          alignedError < -0.14;

        if (
          oppositeTurnAhead &&
          !hittingOuterWall &&
          diff !== "EASY" &&
          this.miniTurboTier >= 1 &&
          Math.abs( signedLatRatio ) < 0.72
        ) {
          wantDrift = true;
          hopSwitchDrift = true;
          steer = -this.driftDirection * 0.85;
        } else if (
          hittingOuterWall ||
          cashInBoostForOffRoad ||
          hookedTooDeepInside
        ) {
          wantDrift = false;
        } else {
          const cornerStillTurning =
            this.driftDirection * immTurnRight > -0.01 ||
            this.driftDirection * nearTurnRight > 0.02 ||
            this.driftDirection * midTurnRight > 0.03 ||
            this.driftDirection * farTurnRight > 0.05;
          const needMinimumBoost = this.miniTurboTier === 0;
          const chargingTargetTier =
            this.driftChargeSeconds < preferredCharge &&
            this.driftDirection * nearTurnRight > -0.1;

          wantDrift =
            (needMinimumBoost ||
              chargingTargetTier ||
              (cornerStillTurning && this.driftChargeSeconds < maxHoldCharge)) &&
            this.forwardSpeed > this.stats.topSpeed * 0.42;

          if (wantDrift) {
            // Parameterized PD Drift-Line Controller with Handling Compensation:
            // High-handling karts (Pip, Nyx, Aero) begin counter-steering earlier so they glide smoothly
            // along the inside apex without hooking too far inward!
            const insideLatRatio = insideSignedLat / Math.max(1, roadHalf);
            const insideVelRatio =
              insideTrackVel / Math.max(15, this.forwardSpeed);
            const packApexShift = Math.max(
              -0.22,
              Math.min(
                0.22,
                (this.driftDirection * packLateralShift) / Math.max(1, roadHalf) * 0.5
              )
            );
            const effectiveApexTarget =
              policy.insideApexTarget - handlingNorm * 0.09 + packApexShift;

            let alignedSteerCmd =
              alignedError * policy.driftAngleGain -
              (insideLatRatio - effectiveApexTarget) * policy.driftLatGain -
              insideVelRatio * policy.driftVelDamping +
              this.driftDirection * neuralResidual;

            if (insideLatRatio > 0.42) {
              // Approaching or riding the inside apex/curb -> authoritative outward counter-steer (-1)
              // to open the drift arc and keep heading aligned down the track while charging the boost!
              alignedSteerCmd -= (insideLatRatio - 0.42) * 3.2;
            } else if (insideLatRatio < -0.35) {
              // Sliding wide toward outside edge -> carve inward toward the apex
              alignedSteerCmd += (-0.35 - insideLatRatio) * 2.8;
            }

            const minSafeCounterSteer =
              insideLatRatio < -0.28
                ? 0.25
                : insideLatRatio < -0.05
                ? -0.45
                : -1.0;
            const clampedAligned = Math.max(
              minSafeCounterSteer,
              Math.min(1.0, alignedSteerCmd)
            );
            steer = this.driftDirection * clampedAligned;
          }
        }
      } else if (
        this.driftState === "NONE" &&
        this.grounded &&
        this.aiDriftCooldown <= 0
      ) {
        // Initiate a new hop-drift via three learned pathways:
        // (A) Preemptive Corner Drift (35m-50m before corners to charge Mini-Turbo early and carve the inside apex)
        // (B) Off-Road Grass Drift-Boost Escape (hop-drift on grass to charge a 1.0s Blue Spark and boost back onto the road)
        // (C) Chained Opposite-Direction Powerslide (experimentation on wide sections when chainDriftWeight > 0; locked off on EASY)
        const entryTurnThreshold = policy.driftEntryThreshold;
        const localCurbW =
          this.closestTrack.localCurbWidth || this.track.curbWidth;
        const offRoadRecoveryWeight =
          diff === "EASY" ? 0 : policy.offRoadDriftRecoveryWeight ?? 0.78;
        const canOffRoadDriftEscape =
          this.surface === "OFFROAD" &&
          !hasActiveOffRoadImmunity &&
          offRoadRecoveryWeight > 0.25 &&
          this.distToCenter < localWallHalf - 2.4 &&
          this.forwardSpeed > this.stats.topSpeed * 0.38;

        const maxEntryDist = canOffRoadDriftEscape
          ? localWallHalf - 2.4
          : hasActiveOffRoadImmunity
          ? localCurbW + 4.5
          : localCurbW + 2.4;
        const easySectorAllowed =
          diff !== "EASY" ||
          (Math.floor(baseT * 12) + this.aiSlotIndex) % 2 === 0;

        // Preemptive corner detection: looks at near (+20m), mid (+32m), AND preemptive lead probe (+38m..+55m)
        const insideEntryOffset = cornerTurnDir * signedLat;
        const cornerReady =
          cornerTurnDir !== 0 &&
          turnStrength >= entryTurnThreshold &&
          cornerTurnDir * immTurnRight > -0.05 &&
          (cornerTurnDir * nearTurnRight >= entryTurnThreshold * 0.68 ||
            cornerTurnDir * midTurnRight >= entryTurnThreshold * 0.72 ||
            cornerTurnDir * leadTurnRight >= entryTurnThreshold * 0.72);

        // Chained opposite-direction powerslide experimentation on wide sections (disabled on EASY)
        const chainWeight =
          diff === "EASY" ? 0 : policy.chainDriftWeight ?? 0.42;
        const canChainStraightDrift =
          diff !== "EASY" &&
          chainWeight > 0.28 &&
          !isNearEdge &&
          this.distToCenter < roadHalf * (0.32 + chainWeight * 0.22) &&
          Math.abs(immTurnRight) < 0.24 &&
          this.forwardSpeed > this.stats.topSpeed * 0.82 &&
          (this.boostTimer > 0.08 ||
            chainWeight > 0.52 ||
            Math.abs(leadTurnRight) > entryTurnThreshold * 0.55);

        // Anti-Ping-Pong Gate: prevent starting a drift if the kart is currently crossing the track laterally
        // at high sideways speed or if its heading is badly misaligned with the track tangent.
        const tangentAlignDot = Vector3.Dot(fwd, this.closestTrack.tangent);
        const notCrossingTrackWildly =
          Math.abs(latVelRatio) < (canOffRoadDriftEscape ? 0.36 : 0.28) &&
          Math.abs(angleError) < (canOffRoadDriftEscape ? 0.58 : 0.48) &&
          tangentAlignDot > (canOffRoadDriftEscape ? 0.68 : 0.78);

        const minEntrySpeed = canOffRoadDriftEscape
          ? this.stats.topSpeed * 0.38
          : this.stats.topSpeed * 0.52;

        if (
          easySectorAllowed &&
          notCrossingTrackWildly &&
          this.distToCenter < maxEntryDist &&
          predTrack.horizontalDistance < predWallHalf - 3.6 &&
          forwardDot > 0.62 &&
          this.forwardSpeed > minEntrySpeed
        ) {
          if (canOffRoadDriftEscape) {
            // Drift inward toward the asphalt centerline (or into the upcoming corner) to charge a 1.0s Blue Spark and boost back onto the road!
            const toCenterSign: -1 | 1 = signedLat >= 0 ? -1 : 1;
            const escapeDir: -1 | 1 =
              cornerTurnDir !== 0 ? cornerTurnDir : toCenterSign;
            wantDrift = true;
            steer = escapeDir * Math.max(0.8, Math.abs(steer));
          } else if (cornerReady && insideEntryOffset < roadHalf * 0.7) {
            wantDrift = true;
            steer = cornerTurnDir * Math.max(0.76, Math.abs(steer));
          } else if (canChainStraightDrift) {
            const chainDir: -1 | 1 =
              cornerTurnDir !== 0
                ? cornerTurnDir
                : this.aiLastDriftDir !== 0
                ? (-this.aiLastDriftDir as -1 | 1)
                : signedLat > 0
                ? -1
                : 1;
            wantDrift = true;
            steer = chainDir * Math.max(0.75, Math.abs(steer));
          }
        }
      }
    }

    const hopJustPressed =
      (wantDrift && this.driftState === "NONE") ||
      hopSwitchDrift ||
      (emergencyHoleHop && this.grounded && this.driftState === "NONE");

    // 8. Throttle & Hairpin Trail-Braking Discipline
    // Modulate throttle and apply proportional trail-braking when entering or rounding an extreme hairpin
    // at excessive speed (or sliding toward the outside edge), while keeping speed safely above the drift threshold.
    let throttle =
      !isAligningForJump && diff === "EASY"
        ? 0.92
        : !isAligningForJump && diff === "MEDIUM"
        ? 0.97
        : 1.0;
    let brake = 0;
    if (Math.abs(angleError) > 1.05 && !isCommittedToDrift) {
      throttle = 0.65;
    }

    const worstLookAheadDot = Math.min(
      curveDot,
      Vector3.Dot(this.closestTrack.tangent, farProbe.tangent)
    );
    const activeTurnSign =
      this.driftState === "DRIFT_ACTIVE" && this.driftDirection !== 0
        ? this.driftDirection
        : cornerTurnDir;
    const outsideLatRatio =
      activeTurnSign !== 0
        ? (-activeTurnSign * signedLat) / Math.max(1, roadHalf)
        : Math.abs(signedLatRatio);
    const outsideVel =
      activeTurnSign !== 0
        ? -activeTurnSign * trackLateralVel
        : Math.abs(trackLateralVel);
    const speedRatio = this.forwardSpeed / Math.max(1, this.stats.topSpeed);

    if (
      this.grounded &&
      !isAligningForJump &&
      !isRidingShortcutCorridor &&
      !hasActiveOffRoadImmunity &&
      this.forwardSpeed > this.stats.topSpeed * 0.68
    ) {
      // Case A: Extreme hairpin ahead or mid-corner (worstLookAheadDot < 0.54 or turnStrength > 0.50) while wide of apex
      if (
        (worstLookAheadDot < 0.54 || turnStrength > 0.50) &&
        outsideLatRatio > 0.22
      ) {
        const safeHairpinSpeedRatio = Math.max(
          0.76,
          0.82 +
            (worstLookAheadDot - 0.35) * 0.72 -
            Math.max(0, outsideLatRatio - 0.3) * 0.25
        );
        if (speedRatio > safeHairpinSpeedRatio) {
          const excess = speedRatio - safeHairpinSpeedRatio;
          throttle = Math.max(0.42, 0.85 - excess * 1.25);
          brake = Math.min(0.48, excess * 1.1);
        }
      }

      // Case B: Imminent outer-edge overshoot rescue on any sharp turn
      if (
        outsideLatRatio > 0.56 &&
        outsideVel > 3.0 &&
        (turnStrength > 0.26 || worstLookAheadDot < 0.78)
      ) {
        throttle = Math.min(throttle, 0.38);
        brake = Math.max(
          brake,
          Math.min(
            0.55,
            (outsideLatRatio - 0.5) * 0.65 + (outsideVel - 2.5) * 0.06
          )
        );
      }
    }

    // 9. Tactical AI Power-Up Brain (Context-Aware Utility across all 16 Power-Ups + Forward/Backward Aiming & Item-Box Booby-Trapping)
    let useItemJustPressed = false;
    let itemAimDirection: -1 | 0 | 1 = 0;
    const patienceScale = policy.itemHoldPatience ?? 0.85;
    if (this.heldItem && this.rouletteTimer <= 0 && this.spinOutTimer <= 0) {
      this.aiItemUseDelay -= dt;

      // Emergency defensive override: if an incoming seeker/saucer is locked on, react immediately on MEDIUM/HARD/SELF_LEARNING
      const urgentThreat = this.incomingThreatCount > 0 && diff !== "EASY";

      // Check if an active Item Box Row is just ahead (within 22m) so we cash in our held item before picking up a new one,
      // OR if we are passing directly over an Item Box crystal (< 5.2m) so HARD/SELF_LEARNING can booby-trap it with a mine/prism!
      let nearUpcomingItemBox = false;
      let passingOverItemBoxForTrap = false;
      if (activeItemBoxPositions && activeItemBoxPositions.length > 0 && diff !== "EASY") {
        for (const boxPos of activeItemBoxPositions) {
          const toBox = boxPos.subtract(this.position);
          toBox.y = 0;
          const distSq = toBox.lengthSquared();
          if (distSq <= 5.2 * 5.2 && isProOrLearning) {
            passingOverItemBoxForTrap = true;
          } else if (distSq > 9 && distSq < 22 * 22) {
            const d = Math.sqrt(distSq);
            if (Vector3.Dot(fwd, toBox.scale(1 / d)) > 0.72) {
              nearUpcomingItemBox = true;
              break;
            }
          }
        }
      }

      if (
        this.aiItemUseDelay <= 0 ||
        urgentThreat ||
        activeBoostShortcutTrigger
      ) {
        const item = this.heldItem;

        if (diff === "EASY") {
          useItemJustPressed = this.aiItemUseDelay <= 0;
        } else if (
          item === "NITRO_CORE" ||
          item === "TRIPLE_NITRO" ||
          item === "GOLDEN_OVERCLOCK"
        ) {
          // Tactical Boost Timing:
          // 1. Immediate recovery if slowed down (< 78% top speed)
          // 2. Immediate off-road grass/curb shortcut cut (`BOOST_SHORTCUT` or shoulder cut) when not already boost-immune
          // 3. Corner exit onto straightaway (curveDot >= 0.85 & not already boosting)
          // 4. Rapid-fire surges during GOLDEN_OVERCLOCK
          const recoveringSpeed = speedRatio < 0.78;
          const cuttingOffRoad =
            activeBoostShortcutTrigger ||
            ((this.surface === "OFFROAD" || this.distToCenter > roadHalf * 0.76) &&
              this.nitroBoostTimer <= 0.15);
          const cleanStraightOrExit =
            curveDot >= 0.85 &&
            worstLookAheadDot >= 0.78 &&
            this.nitroBoostTimer <= 0.2 &&
            this.boostTimer <= 0.25;
          const multiChargeChain =
            (item === "TRIPLE_NITRO" &&
              this.heldItemCharges >= 2 &&
              curveDot >= 0.78 &&
              this.nitroBoostTimer <= 0.15) ||
            (item === "GOLDEN_OVERCLOCK" && this.nitroBoostTimer <= 0.55);
          const patienceExpired = this.aiItemUseDelay < -3.2 * patienceScale;

          useItemJustPressed =
            recoveringSpeed ||
            cuttingOffRoad ||
            cleanStraightOrExit ||
            multiChargeChain ||
            nearUpcomingItemBox ||
            patienceExpired;
        } else if (item === "ORBITAL_SHIELD") {
          // 3 emerald drones orbit immediately upon roulette completion:
          // Keep at least 1 drone for defense when in 1st place or under threat (unless near an item box),
          // or fire a drone forward or backward like a Ricochet Disc when a rival is in our forward or rear cone!
          const aggressionScale = policy.itemSeekWeight ?? 0.65;
          const canSpareOffensiveDrone =
            nearUpcomingItemBox ||
            (this.orbitalShieldCharges >= 2 && !urgentThreat) ||
            (this.rank > 1 &&
              !urgentThreat &&
              this.aiItemUseDelay < (-1.8 + aggressionScale * 0.6) * patienceScale);

          if (canSpareOffensiveDrone && allRacers && allRacers.length > 1) {
            let hasTargetInCone = nearUpcomingItemBox;
            let rearTargetFound = false;
            const maxRearSnipeDist = isProOrLearning
              ? 28 + aggressionScale * 14
              : 20;
            const rearMinDot = isProOrLearning ? -0.76 : -0.84;
            if (!hasTargetInCone) {
              for (const other of allRacers) {
                if (other.racerId === this.racerId) continue;
                const toOther = other.position.subtract(this.position);
                toOther.y = 0;
                const d = toOther.length();
                if (d > 3 && d < 88) {
                  const dot = Vector3.Dot(fwd, toOther.scale(1 / d));
                  if (dot > 0.74) {
                    hasTargetInCone = true;
                    itemAimDirection = 1;
                    break;
                  } else if (d < maxRearSnipeDist && dot < rearMinDot) {
                    rearTargetFound = true;
                  }
                }
              }
            }
            if (!hasTargetInCone && rearTargetFound) {
              hasTargetInCone = true;
              itemAimDirection = -1;
            }
            useItemJustPressed = hasTargetInCone;
          }
        } else if (item === "TRIPLE_SEEKER") {
          // 3 crimson homing seekers orbit immediately upon roulette completion:
          // Keep 1 seeker in orbit if in 1st place or under threat (unless near an item box),
          // and launch homing seekers when the road ahead is reasonably open!
          const canFireHomingSeeker =
            nearUpcomingItemBox ||
            (this.tripleSeekerCharges >= 2 && !urgentThreat) ||
            (this.rank > 1 &&
              !urgentThreat &&
              this.aiItemUseDelay < -1.1 * patienceScale);
          useItemJustPressed =
            canFireHomingSeeker &&
            (curveDot > 0.7 ||
              nearUpcomingItemBox ||
              this.aiItemUseDelay < -1.6 * patienceScale);
        } else if (item === "RICOCHET_DISC") {
          const aggressionScale = policy.itemSeekWeight ?? 0.65;
          const maxHoldWait =
            (isProOrLearning ? -2.0 : -1.3) * patienceScale;
          let hasTargetInCone =
            this.aiItemUseDelay < maxHoldWait || nearUpcomingItemBox;
          let rearTargetFound = false;
          const maxRearSnipeDist = isProOrLearning
            ? 30 + aggressionScale * 14
            : 22;
          const rearMinDot = isProOrLearning ? -0.74 : -0.84;
          if (allRacers && allRacers.length > 1) {
            for (const other of allRacers) {
              if (other.racerId === this.racerId) continue;
              const toOther = other.position.subtract(this.position);
              toOther.y = 0;
              const d = toOther.length();
              if (d > 3 && d < 95) {
                const dot = Vector3.Dot(fwd, toOther.scale(1 / d));
                if (dot > 0.72) {
                  hasTargetInCone = true;
                  itemAimDirection = 1;
                  break;
                } else if (d < maxRearSnipeDist && dot < rearMinDot) {
                  rearTargetFound = true;
                }
              }
            }
          }
          if (!hasTargetInCone && rearTargetFound) {
            hasTargetInCone = true;
            itemAimDirection = -1;
          }
          useItemJustPressed = hasTargetInCone;
        } else if (
          item === "CRYO_MINE" ||
          item === "TRIPLE_CRYO_MINE" ||
          item === "GLITCH_PRISM"
        ) {
          // Tactical Trap Placement (Scaled by Difficulty & AI Brain itemAggressionWeight):
          // - Drop backward immediately if an incoming seeker is chasing us (tail block)
          // - Drop backward right on top of an Item Box crystal (`passingOverItemBoxForTrap`) or inside shortcut apex to booby-trap it!
          // - Lob FORWARD (+1) if a rival is in our forward lob window (12-24m on MEDIUM, up to 40m with predictive lead on HARD/SELF_LEARNING)
          // - Drop BACKWARD (-1) on tight inside corner apexes, boost pads/ramps, or when an opponent is drafting behind
          const aggressionScale = policy.itemSeekWeight ?? 0.65;
          const maxLobDist = isProOrLearning
            ? 28 + aggressionScale * 12
            : 24;
          const minLobDot = isProOrLearning ? 0.75 : 0.85;
          let tailingOpponentBehind = false;
          let targetAheadForLob = false;
          if (allRacers && allRacers.length > 1) {
            for (const other of allRacers) {
              if (other.racerId === this.racerId) continue;
              const toOther = other.position.subtract(this.position);
              toOther.y = 0;
              const d = toOther.length();
              if (d > 2.5 && d < 42) {
                const dot = Vector3.Dot(fwd, toOther.scale(1 / d));
                if (d < 30 && dot < -0.68) {
                  tailingOpponentBehind = true;
                } else if (
                  !urgentThreat &&
                  d >= 10 &&
                  d <= maxLobDist &&
                  dot > minLobDot
                ) {
                  targetAheadForLob = true;
                }
              }
            }
          }
          const onTightApexLine =
            (turnStrength > 0.22 && Math.abs(signedLatRatio) < 0.52) ||
            isRidingShortcutCorridor;
          const patienceExpired = this.aiItemUseDelay < -2.4 * patienceScale;

          if (
            targetAheadForLob &&
            !urgentThreat &&
            !tailingOpponentBehind &&
            !passingOverItemBoxForTrap
          ) {
            itemAimDirection = 1;
          } else {
            itemAimDirection = -1;
          }

          useItemJustPressed =
            urgentThreat ||
            passingOverItemBoxForTrap ||
            targetAheadForLob ||
            nearUpcomingItemBox ||
            tailingOpponentBehind ||
            onTightApexLine ||
            patienceExpired;
        } else if (item === "PHASE_CLOAK") {
          // Activate Phase Cloak to dodge incoming threats, steal an item from a racer ahead, or power through a BOOST_SHORTCUT / off-road cut
          let opponentAheadHasItem = false;
          if (allRacers && allRacers.length > 1) {
            for (const other of allRacers) {
              if (other.racerId === this.racerId) continue;
              if (other.rank < this.rank && other.heldItem) {
                opponentAheadHasItem = true;
                break;
              }
            }
          }
          const cuttingCorner =
            activeBoostShortcutTrigger ||
            this.surface === "OFFROAD" ||
            (turnStrength > 0.26 && Math.abs(signedLatRatio) > 0.35);
          useItemJustPressed =
            urgentThreat ||
            opponentAheadHasItem ||
            cuttingCorner ||
            nearUpcomingItemBox ||
            this.aiItemUseDelay < -1.8 * patienceScale;
        } else if (item === "EMP_SHOCKWAVE" || item === "OIL_SQUALL") {
          // Trigger global Ion Storm or Slick-Cloud Discharger when leaders ahead are at high speed, cornering, or airborne
          let highValueLeaderTarget =
            this.aiItemUseDelay < -1.6 * patienceScale || nearUpcomingItemBox;
          if (!highValueLeaderTarget && allRacers) {
            for (const other of allRacers) {
              if (other.racerId === this.racerId || other.rank >= this.rank) continue;
              if (
                !other.grounded ||
                other.boostTimer > 0 ||
                other.driftState === "DRIFT_ACTIVE" ||
                other.forwardSpeed > other.stats.topSpeed * 0.88
              ) {
                highValueLeaderTarget = true;
                break;
              }
            }
          }
          useItemJustPressed = highValueLeaderTarget;
        } else if (item === "PULSE_SEEKER") {
          // Fire homing seeker when road ahead is reasonably open so it doesn't clip a sharp hairpin wall immediately
          useItemJustPressed =
            curveDot > 0.72 ||
            nearUpcomingItemBox ||
            this.aiItemUseDelay < -1.5 * patienceScale;
        } else {
          // NOVA_OVERDRIVE, WARP_AUTOPILOT & LIL_SAUCER
          useItemJustPressed = true;
        }
      }
    }

    return {
      throttle,
      brake,
      steer,
      driftHeld: wantDrift,
      hopJustPressed,
      useItemJustPressed,
      itemAimDirection,
    };
  }

  public update(
    rawDt: number,
    input: ControlInputState,
    raceActive: boolean,
    elapsedRaceMs: number,
    totalLaps: number,
    onUseItem?: (racer: KartController, item: PowerUpType) => void,
    playerProgressDistance?: number
  ): void {
    // 1. Clamp timestep to 0.05s per AGENTS.md invariant
    const dt = Math.min(rawDt, PHYSICS_CONSTANTS.MAX_DT);

    // Asymmetric steering smoothing:
    // - During DRIFT_ACTIVE, counter-steering (reducing inward steer or steering outward toward -driftDirection)
    //   responds briskly (22/s) so agile karts never lag and hook into the inside apex, while steering deeper inward ramps at 10.5/s.
    // - During normal driving, ramp in smoothly (8.5/s) and snap back quickly (15/s) on release.
    const isReleasingOrReversingSteer =
      Math.abs(input.steer) < Math.abs(this.smoothedSteer) ||
      input.steer * this.smoothedSteer < 0;
    const isCounterSteeringInDrift =
      this.driftState === "DRIFT_ACTIVE" &&
      this.driftDirection !== 0 &&
      this.driftDirection * input.steer <
        this.driftDirection * this.smoothedSteer;
    const isDriftingOrHopping =
      this.driftState === "DRIFT_ACTIVE" || this.driftState === "HOPPING";
    const steerSmoothRate = isCounterSteeringInDrift
      ? 22.0
      : isDriftingOrHopping
      ? 10.5
      : isReleasingOrReversingSteer
      ? 15.0
      : 8.5;
    this.smoothedSteer +=
      (input.steer - this.smoothedSteer) * Math.min(1, dt * steerSmoothRate);
    if (Math.abs(this.smoothedSteer) < 0.01 && Math.abs(input.steer) < 0.01) {
      this.smoothedSteer = 0;
    }

    // Update timers & Prolonged Rocket Boost (PRB) state
    if (this.collisionCooldown > 0) this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    if (this.cameraShakeTimer > 0) this.cameraShakeTimer = Math.max(0, this.cameraShakeTimer - dt);
    if (this.wobbleTimer > 0 || this.knockVelocity.lengthSquared() > 3.5) {
      this.combatRecoveryTimer = Math.max(this.combatRecoveryTimer, 1.8);
    }
    if (this.combatRecoveryTimer > 0) {
      this.combatRecoveryTimer = Math.max(0, this.combatRecoveryTimer - dt);
    }
    if (this.wobbleTimer > 0) this.wobbleTimer = Math.max(0, this.wobbleTimer - dt);
    if (this.padBoostCooldown > 0) this.padBoostCooldown = Math.max(0, this.padBoostCooldown - dt);
    if (this.oilSquallTimer > 0) {
      this.oilSquallTimer = Math.max(0, this.oilSquallTimer - dt);
      if (
        this.oilSquallTimer <= 0 &&
        this.activeBoostLabel?.includes("OIL SQUALL")
      ) {
        this.activeBoostLabel = null;
      }
    }
    if (this.goldenOverclockTimer > 0) {
      this.goldenOverclockTimer = Math.max(0, this.goldenOverclockTimer - dt);
      if (
        this.goldenOverclockTimer <= 0 &&
        this.heldItem === "GOLDEN_OVERCLOCK"
      ) {
        this.equipPowerUpImmediate(null);
      }
    }
    if (this.spinOutMercyTimer > 0) {
      this.spinOutMercyTimer = Math.max(0, this.spinOutMercyTimer - dt);
    }
    if (this.warpAutopilotTimer > 0) {
      this.warpAutopilotElapsed += dt;
      this.warpAutopilotTimer = Math.max(0, this.warpAutopilotTimer - dt);
      if (this.warpAutopilotTimer <= 0) {
        this.warpAutopilotElapsed = 0;
        this.spinOutMercyTimer = Math.max(this.spinOutMercyTimer, 1.0);
        this.boostTimer = Math.max(this.boostTimer, 1.1);
        this.boostMultiplier = Math.max(this.boostMultiplier, 1.35);
        this.prolongedRocketBoostActive = true;
        this.activeBoostLabel = "SHUTTLE EXIT BOOST (+35%)";
      }
    }
    if (this.phaseCloakTimer > 0) {
      this.phaseCloakTimer = Math.max(0, this.phaseCloakTimer - dt);
      if (
        this.phaseCloakTimer <= 0 &&
        this.boostTimer <= 0 &&
        this.nitroBoostTimer <= 0 &&
        this.novaOverdriveTimer <= 0 &&
        this.warpAutopilotTimer <= 0
      ) {
        this.prolongedRocketBoostActive = false;
        if (this.activeBoostLabel?.includes("PHASE CLOAK")) {
          this.activeBoostLabel = null;
        }
      }
    }
    if (this.empShrinkTimer > 0) {
      this.empShrinkTimer = Math.max(0, this.empShrinkTimer - dt);
      if (
        this.empShrinkTimer <= 0 &&
        this.activeBoostLabel?.includes("ION ZAP")
      ) {
        this.activeBoostLabel = null;
      }
    }
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      if (
        this.boostTimer <= 0 &&
        this.novaOverdriveTimer <= 0 &&
        this.warpAutopilotTimer <= 0
      ) {
        this.boostMultiplier = 1.0;
        this.activeBoostLabel = null;
        if (this.nitroBoostTimer <= 0 && this.phaseCloakTimer <= 0) {
          this.prolongedRocketBoostActive = false;
        }
      }
    }
    if (this.nitroBoostTimer > 0) {
      this.nitroBoostTimer = Math.max(0, this.nitroBoostTimer - dt);
      if (
        this.nitroBoostTimer <= 0 &&
        this.boostTimer <= 0 &&
        this.novaOverdriveTimer <= 0 &&
        this.warpAutopilotTimer <= 0 &&
        this.phaseCloakTimer <= 0
      ) {
        this.prolongedRocketBoostActive = false;
      }
    }
    if (this.novaOverdriveTimer > 0) {
      this.novaOverdriveTimer = Math.max(0, this.novaOverdriveTimer - dt);
      if (
        this.novaOverdriveTimer <= 0 &&
        this.boostTimer <= 0 &&
        this.warpAutopilotTimer <= 0
      ) {
        this.activeBoostLabel = null;
        if (this.nitroBoostTimer <= 0 && this.phaseCloakTimer <= 0) {
          this.prolongedRocketBoostActive = false;
        }
      }
    }

    // Item Roulette countdown
    if (this.rouletteTimer > 0) {
      this.rouletteTimer -= dt;
      const allItems: PowerUpType[] =
        this.rank > 1
          ? [
              "NITRO_CORE",
              "TRIPLE_NITRO",
              "GOLDEN_OVERCLOCK",
              "PULSE_SEEKER",
              "TRIPLE_SEEKER",
              "RICOCHET_DISC",
              "ORBITAL_SHIELD",
              "CRYO_MINE",
              "TRIPLE_CRYO_MINE",
              "GLITCH_PRISM",
              "OIL_SQUALL",
              "PHASE_CLOAK",
              "EMP_SHOCKWAVE",
              "NOVA_OVERDRIVE",
              "WARP_AUTOPILOT",
              "LIL_SAUCER",
            ]
          : [
              "NITRO_CORE",
              "PULSE_SEEKER",
              "RICOCHET_DISC",
              "ORBITAL_SHIELD",
              "CRYO_MINE",
              "TRIPLE_CRYO_MINE",
              "GLITCH_PRISM",
            ];
      const cycleIdx = Math.floor(this.rouletteTimer * 14) % allItems.length;
      this.roulettePreviewItem = allItems[cycleIdx];
      if (this.rouletteTimer <= 0) {
        this.equipPowerUpImmediate(this.pendingAwardedItem);
      }
    }

    if (this.driftExitRecoveryTimer > 0) {
      this.driftExitRecoveryTimer = Math.max(0, this.driftExitRecoveryTimer - dt);
    }

    // Trigger held power-up if requested (disabled while spinning out)
    if (
      raceActive &&
      this.spinOutTimer <= 0 &&
      input.useItemJustPressed &&
      this.heldItem &&
      this.rouletteTimer <= 0
    ) {
      this.lastItemAimDir = input.itemAimDirection ?? 0;
      const itemToFire = this.heldItem;
      if (itemToFire === "TRIPLE_NITRO") {
        this.heldItemCharges = Math.max(0, this.heldItemCharges - 1);
        if (this.heldItemCharges <= 0) {
          this.heldItem = null;
        } else if (!this.isPlayer) {
          this.aiItemUseDelay = 0.65;
        }
        onUseItem?.(this, itemToFire);
      } else if (itemToFire === "GOLDEN_OVERCLOCK") {
        if (this.goldenOverclockTimer <= 0) {
          this.goldenOverclockTimer = 7.5;
        }
        if (!this.isPlayer) {
          this.aiItemUseDelay = 0.38;
        }
        onUseItem?.(this, itemToFire);
      } else if (
        itemToFire === "ORBITAL_SHIELD" ||
        itemToFire === "TRIPLE_SEEKER" ||
        itemToFire === "TRIPLE_CRYO_MINE"
      ) {
        // ItemManager fires 1 orbiting orb/seeker or drops 1 trailing mine per press and decrements remaining charges
        onUseItem?.(this, itemToFire);
        if (
          !this.isPlayer &&
          (this.heldItem === "ORBITAL_SHIELD" ||
            this.heldItem === "TRIPLE_SEEKER" ||
            this.heldItem === "TRIPLE_CRYO_MINE")
        ) {
          this.aiItemUseDelay = 0.72;
        }
      } else {
        this.equipPowerUpImmediate(null);
        onUseItem?.(this, itemToFire);
      }
    }

    // 2. Ground Raycasting, Ramp Surface Riding & Path3D Centerline Query (with continuity hint)
    this.closestTrack = this.track.queryClosestTrackPoint(
      this.position,
      this.closestTrack?.sampleIndex
    );
    this.distToCenter = this.closestTrack.horizontalDistance;
    const localRoadHalf =
      this.closestTrack.localRoadHalfWidth || this.track.roadHalfWidth;
    const localCurbWidth =
      this.closestTrack.localCurbWidth || this.track.curbWidth;
    const localWallHalf =
      this.closestTrack.localWallHalfWidth || this.track.wallHalfWidth;

    const preShortcut = this.evaluateShortcutCorridor(
      this.closestTrack.normalizedSplineT,
      this.closestTrack.signedLateralOffset,
      localRoadHalf
    );

    // Terrain classification via horizontal distance d_perp relative to local W_road and W_curb (or technical PAVED_SHORTCUT / SHALLOW_WATER ribbon)
    this.surface = preShortcut.onPavedShortcut
      ? "PAVEMENT"
      : preShortcut.onShallowWater
      ? "SHALLOW_WATER"
      : classifyTerrainSurface(
          this.distToCenter,
          localRoadHalf,
          localCurbWidth
        );

    const isOnRoadOrCurb =
      this.distToCenter <= localCurbWidth ||
      preShortcut.onPavedShortcut ||
      preShortcut.onBoostShortcut ||
      preShortcut.onShallowWater;
    let targetGroundY = this.closestTrack.roadY;
    let surfaceNormal = this.closestTrack.normal.clone();

    if (!isOnRoadOrCurb) {
      const rayOrigin = new Vector3(
        this.position.x,
        this.position.y + 4.5,
        this.position.z
      );
      const downwardRay = new Ray(
        rayOrigin,
        new Vector3(0, -1, 0),
        PHYSICS_CONSTANTS.RAY_LENGTH
      );
      const pickInfo = this.scene.pickWithRay(
        downwardRay,
        (mesh) => mesh === this.track.groundMesh
      );

      if (pickInfo?.hit && pickInfo.pickedPoint) {
        targetGroundY = Math.max(
          this.closestTrack.roadY - 3.5,
          pickInfo.pickedPoint.y
        );
        const pickedNormal = pickInfo.getNormal(true);
        if (pickedNormal) {
          if (pickedNormal.y < 0) {
            pickedNormal.scaleInPlace(-1);
          }
          if (pickedNormal.y > 0.35) {
            surfaceNormal = pickedNormal;
          }
        }
      }
    }

    // Sample C1-smooth road + ramp wedge elevation at center, front nose (+1.55m), and rear axle (-1.45m)
    const fwdInitial = this.forwardVector;
    const centerSample = this.sampleRoadAndRampY(
      this.position.x,
      this.position.z,
      this.closestTrack?.sampleIndex
    );
    const frontSample = this.sampleRoadAndRampY(
      this.position.x + fwdInitial.x * 1.55,
      this.position.z + fwdInitial.z * 1.55,
      this.closestTrack?.sampleIndex
    );
    const rearSample = this.sampleRoadAndRampY(
      this.position.x - fwdInitial.x * 1.45,
      this.position.z - fwdInitial.z * 1.45,
      this.closestTrack?.sampleIndex
    );

    if (isOnRoadOrCurb || centerSample.onRamp || frontSample.onRamp) {
      targetGroundY = Math.max(
        centerSample.y,
        0.5 * (frontSample.y + rearSample.y)
      );
    } else {
      targetGroundY = Math.max(targetGroundY, centerSample.y - 3.5);
    }

    // Slope angle: theta_slope = pi/2 - arcsin(|n_y|)
    const clampedNy = Math.max(-1, Math.min(1, Math.abs(surfaceNormal.y)));
    this.slopeAngle = Math.PI / 2 - Math.asin(clampedNy);

    // Subtle vertical camera jitter when riding the rumble strip curb
    if (this.surface === "CURB" && Math.abs(this.forwardSpeed) > 10) {
      this.cameraShakeTimer = Math.max(this.cameraShakeTimer, 0.06);
    }

    if (!raceActive) {
      this.wasRaceActive = false;
      this.burnoutTimer = 0;
      if (input.throttle >= 0.8 && input.brake === 0) {
        this.countdownThrottleHoldSec += dt;
      } else {
        this.countdownThrottleHoldSec = 0;
      }
      this.position.y = targetGroundY + PHYSICS_CONSTANTS.RIDE_HEIGHT;
      this.assembly.kartRoot.position.copyFrom(this.position);
      this.assembly.kartRoot.rotation.y = this.headingYaw;
      this.assembly.updateNameplate(
        this.name,
        this.controlMode === "REMOTE_HUMAN"
      );
      this.assembly.updateVisuals({
        dt,
        forwardSpeed: 0,
        maxSpeed: this.stats.topSpeed,
        steerInput: this.smoothedSteer,
        miniTurboTier: 0,
        isDrifting: false,
        isBoosting: false,
        novaOverdriveActive: false,
        surface: this.surface,
        grounded: true,
        isBurnoutActive: this.countdownThrottleHoldSec > 0.1,
      });
      return;
    }

    // Check Perfect Rocket Boost timing on the transition from COUNTDOWN -> RACING
    // (Achieved by holding throttle as the number 2 begins to fade on the countdown: 0.45s..2.15s hold)
    if (!this.wasRaceActive) {
      this.wasRaceActive = true;
      if (
        this.countdownThrottleHoldSec >= 0.45 &&
        this.countdownThrottleHoldSec <= 2.15
      ) {
        this.triggerRocketStartBoost();
      }
      this.countdownThrottleHoldSec = 0;
    }

    // Visual-only tire burnout streak trigger when accelerating at full throttle from a stop (0 speed)
    if (this.grounded && this.spinOutTimer <= 0) {
      if (
        Math.abs(this.forwardSpeed) < 3.5 &&
        input.throttle >= 0.85 &&
        input.brake === 0
      ) {
        this.burnoutTimer = Math.max(this.burnoutTimer, 0.78);
      } else if (this.burnoutTimer > 0) {
        if (
          input.throttle < 0.7 ||
          this.forwardSpeed > this.stats.topSpeed * 0.52
        ) {
          this.burnoutTimer = 0;
        } else {
          this.burnoutTimer = Math.max(0, this.burnoutTimer - dt);
        }
      }
    } else {
      this.burnoutTimer = 0;
    }

    // Compute smooth analytical vertical slope velocity along the kart's travel vector
    // Guard against side-clipping a JUMP_RAMP where one wheel is on the ramp and the other is off the side edge!
    const bothWheelsSameSurface = frontSample.onRamp === rearSample.onRamp;
    const rawWheelGradient = bothWheelsSameSurface
      ? (frontSample.y - rearSample.y) / 3.0
      : centerSample.onRamp
      ? 0.28
      : 0;
    const wheelSlopeGradient = Math.max(-0.35, Math.min(0.34, rawWheelGradient));
    const wheelSlopeVy = Math.min(
      11.5,
      Math.max(-16.0, this.forwardSpeed * wheelSlopeGradient)
    );
    const tangentHorizLen = Math.max(
      0.2,
      Math.hypot(this.closestTrack.tangent.x, this.closestTrack.tangent.z)
    );
    const splineHorizSpeed =
      (this.velocity.x * this.closestTrack.tangent.x +
        this.velocity.z * this.closestTrack.tangent.z) /
      tangentHorizLen;
    const splineSlopeVy =
      splineHorizSpeed * (this.closestTrack.tangent.y / tangentHorizLen);
    const instantGroundVy = Math.min(
      11.5,
      Math.max(
        -16.0,
        centerSample.onRamp
          ? wheelSlopeVy
          : 0.65 * wheelSlopeVy + 0.35 * splineSlopeVy
      )
    );

    // Check Yellow Chevron Speed Booster Pads on the ground
    if (this.obstacleHitCooldown > 0) {
      this.obstacleHitCooldown = Math.max(0, this.obstacleHitCooldown - dt);
    }

    if (this.padBoostCooldown <= 0 && this.spinOutTimer <= 0) {
      for (const pad of this.track.boostPads) {
        const dx = this.position.x - pad.position.x;
        const dz = this.position.z - pad.position.z;
        if (dx * dx + dz * dz <= pad.radius * pad.radius) {
          this.padBoostCooldown = 0.65;
          this.boostMultiplier = Math.max(this.boostMultiplier, 1.35);
          this.boostTimer = Math.max(this.boostTimer, 1.4);
          this.prolongedRocketBoostActive = true;
          this.activeBoostLabel = "BOOST PAD (+35%)";
          this.forwardSpeed = Math.max(
            this.forwardSpeed,
            this.stats.topSpeed * 1.3
          );
          this.lateralSpeed = 0;
          const fwd = this.forwardVector;
          this.velocity = fwd.scale(this.forwardSpeed);
          break;
        }
      }
    }

    // Stunt Jump Ramp (`JUMP_RAMP`) surface climb & controlled top-lip launch
    if ((centerSample.onRamp || frontSample.onRamp) && this.spinOutTimer <= 0) {
      this.boostMultiplier = Math.max(this.boostMultiplier, 1.35);
      this.boostTimer = Math.max(this.boostTimer, 1.25);
      this.prolongedRocketBoostActive = true;
      this.activeBoostLabel = "STUNT RAMP (+35%)";
      this.forwardSpeed = Math.max(
        this.forwardSpeed,
        this.stats.topSpeed * 1.28
      );
      this.lateralSpeed = 0;
      this.velocity = this.forwardVector.scale(this.forwardSpeed);

      if (centerSample.atRampLip && this.obstacleHitCooldown <= 0) {
        this.obstacleHitCooldown = 0.85;
        // Controlled, speed-proportional launch vertical velocity (12.8..14.8 u/s -> ~3.3m..3.8m peak jump height)
        // with only a subtle 4% weight-class feel difference so lightweight karts never sky-rocket off ramps!
        const speedBonusVy = Math.min(
          2.2,
          Math.max(0, (this.forwardSpeed - 38.0) * 0.065)
        );
        const massAirFactor =
          1.02 - ((this.stats.baseMass - 50) / 170) * 0.04;
        const controlledLaunchVy =
          (12.6 + speedBonusVy) *
          Math.max(0.96, Math.min(1.03, massAirFactor));
        this.verticalVelocity = Math.min(14.8, controlledLaunchVy);
        this.grounded = false;
        this.airborneTime = 0;
        if (this.driftState === "HOPPING") {
          this.driftState = "NONE";
        }
        // Pitch nose distinctly upward as the kart leaves the top lip of the jump
        this.visualPitch = Math.min(this.visualPitch, -0.34);
      }
    }

    // Check Custom Placed Track Hazards (Oil Slicks, Water Puddles, Barrier Crates, Pylon Cones)
    if (this.obstacleHitCooldown <= 0 && this.track.obstacles.length > 0) {
      for (const obs of this.track.obstacles) {
        if (obs.type === "JUMP_RAMP") continue;
        const dx = this.position.x - obs.position.x;
        const dz = this.position.z - obs.position.z;
        if (dx * dx + dz * dz <= obs.radius * obs.radius) {
          if (obs.type === "WATER_PUDDLE") {
            if (!this.grounded) continue; // Hopping or jumping clears water puddles!
            this.obstacleHitCooldown = 0.65;
            if (
              this.novaOverdriveTimer <= 0 &&
              this.warpAutopilotTimer <= 0 &&
              this.phaseCloakTimer <= 0 &&
              this.nitroBoostTimer <= 0
            ) {
              this.forwardSpeed *= 0.8;
              this.velocity.scaleInPlace(0.8);
              this.wobbleTimer = Math.max(this.wobbleTimer, 0.35);
              this.cameraShakeTimer = Math.max(this.cameraShakeTimer, 0.16);
              this.activeBoostLabel = "HYDROPLANE PUDDLE (-20% SPD)";
            }
          } else {
            this.obstacleHitCooldown = 0.9;
            if (
              this.novaOverdriveTimer <= 0 &&
              this.warpAutopilotTimer <= 0 &&
              this.phaseCloakTimer <= 0
            ) {
              if (obs.type === "OIL_SLICK") {
                if (!this.grounded) continue;
                this.triggerSpinOut(0.75, 0);
                this.activeBoostLabel = "OIL SLICK SLIDE!";
              } else if (obs.type === "BARRIER_CRATE") {
                this.triggerSpinOut(0.95, 2.5);
                this.activeBoostLabel = "CRATE IMPACT!";
              } else if (obs.type === "PYLON_CONE") {
                this.forwardSpeed *= 0.85;
                this.velocity.scaleInPlace(0.85);
                const away = new Vector3(dx, 0, dz);
                if (away.lengthSquared() > 1e-4) away.normalize();
                this.knockVelocity.copyFrom(away.scale(14));
                this.cameraShakeTimer = 0.2;
              }
            }
          }
          break;
        }
      }
    }

    // Check Track Masks (Road Holes / Pit Cutouts & Parallel Split-Lane Medians)
    if (this.track.trackMasks && this.track.trackMasks.length > 0) {
      const totalTrackLen = Math.max(100, this.track.totalTrackLength);
      const currDist = this.closestTrack.distanceAlongTrack;
      const currLat = this.closestTrack.signedLateralOffset;

      for (const mask of this.track.trackMasks) {
        const maskCenterDist =
          (((mask.normT % 1) + 1) % 1) * totalTrackLen;
        const rawDiff = Math.abs(currDist - maskCenterDist);
        const longDist = Math.min(rawDiff, totalTrackLen - rawDiff);
        const halfLen = mask.length * 0.5;
        const halfW = mask.width * 0.5;

        if (
          mask.type === "ROAD_HOLE" &&
          longDist <= halfLen * 0.92 &&
          Math.abs(currLat - mask.lateral) <= halfW * 0.92
        ) {
          // Grounded karts fall into the road hole unless hopping/airborne above the road or in Shuttle/Cloak mode
          if (
            this.grounded &&
            this.warpAutopilotTimer <= 0 &&
            this.phaseCloakTimer <= 0 &&
            this.obstacleHitCooldown <= 0
          ) {
            this.obstacleHitCooldown = 1.25;
            this.triggerSpinOut(1.05, 8.2);
            const escapeSign = currLat >= mask.lateral ? 1 : -1;
            this.knockVelocity.copyFrom(
              this.closestTrack.binormal.scale(escapeSign * 14.0)
            );
            this.activeBoostLabel = "TRACK PIT HAZARD!";
          }
        } else if (
          mask.type === "SPLIT_MEDIAN" &&
          longDist <= halfLen &&
          Math.abs(currLat - mask.lateral) <= halfW + 0.55
        ) {
          this.surface = "OFFROAD";
          if (this.grounded && this.warpAutopilotTimer <= 0) {
            const pushSign = currLat >= mask.lateral ? 1 : -1;
            this.knockVelocity.addInPlace(
              this.closestTrack.binormal.scale(pushSign * 18.0 * dt)
            );
          }
        }
      }
    }

    // 3. Five-Phase Powerslide & Entry Hop State Machine
    const speedRatio = this.forwardSpeed / this.stats.topSpeed;
    const minDriftSpeed =
      this.stats.topSpeed * PHYSICS_CONSTANTS.MIN_DRIFT_SPEED_RATIO;

    const alignAiHeadingToExitCorridor = (blendStrength: number): void => {
      if (this.isPlayer) return;
      const totalLen = Math.max(120, this.track.totalTrackLength);
      const exitT =
        (this.closestTrack.normalizedSplineT + 16 / totalLen) % 1.0;
      const roadHalf =
        this.closestTrack.localRoadHalfWidth || this.track.roadHalfWidth;
      const safeExitLat = Math.max(
        -roadHalf * 0.4,
        Math.min(roadHalf * 0.4, this.closestTrack.signedLateralOffset * 0.32)
      );
      const safeExitSample = this.track.getPointAtNormalizedT(
        exitT,
        safeExitLat
      );
      const toExit = safeExitSample.position.subtract(this.position);
      toExit.y = 0;
      if (toExit.lengthSquared() > 1e-4) {
        toExit.normalize();
        const exitYaw = Math.atan2(toExit.x, toExit.z);
        let yawDiff = exitYaw - this.headingYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        this.headingYaw += yawDiff * Math.max(0, Math.min(0.88, blendStrength));
      }
    };

    const triggerChargedMiniTurboBurst = (): boolean => {
      if (this.miniTurboTier <= 0 || this.spinOutTimer > 0) return false;
      const reward = getMiniTurboReward(
        this.miniTurboTier,
        this.stats.miniTurboDurationBonus,
        this.stats.miniTurboDurationSec,
        this.driftChargeSubState,
        this.driftChargeSeconds
      );
      if (!reward) return false;

      const chainingActiveBoost =
        this.boostTimer > 0 ||
        this.nitroBoostTimer > 0 ||
        this.prolongedRocketBoostActive;

      this.boostMultiplier = Math.max(
        this.boostMultiplier,
        reward.speedMultiplier
      );
      this.boostTimer = Math.max(this.boostTimer, reward.durationSec);
      this.prolongedRocketBoostActive = true;
      this.activeBoostLabel = chainingActiveBoost
        ? `${reward.label} • PRB!`
        : reward.label;
      this.forwardSpeed = Math.max(
        this.forwardSpeed,
        this.stats.topSpeed * reward.speedMultiplier
      );

      // Align AI heading toward the forward track exit corridor before projecting boost velocity
      // so the Mini-Turbo surge rockets the kart down the track instead of diagonally across it!
      if (!this.isPlayer) {
        const policy = globalAiBrain.getGenomeForSlot(
          this.aiDifficulty,
          this.aiSlotIndex,
          this.stats.character.id
        ).weights;
        const edgeBonus =
          this.distToCenter > this.track.roadHalfWidth * 0.65 ? 0.14 : 0;
        alignAiHeadingToExitCorridor(policy.exitTangentAlignBlend + edgeBonus);
        this.visualSlipAngle = 0;
        this.lateralSpeed = 0;
        this.velocity = this.forwardVector.scale(this.forwardSpeed);
      } else {
        // Smooth momentum-conserving exit alignment for human player:
        // Blend headingYaw toward the actual world travel vector so the Mini-Turbo surges along the player's
        // current line without a sideways traction snap, and let visualSlipAngle unwind smoothly over ~8 frames!
        const horizSpeedSq =
          this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (horizSpeedSq > 4.0) {
          const velYaw = Math.atan2(this.velocity.x, this.velocity.z);
          let yawDiff = velYaw - this.headingYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          this.headingYaw += yawDiff * 0.42;
        }
        this.lateralSpeed = 0;
        this.velocity = this.forwardVector.scale(this.forwardSpeed);
        this.driftExitRecoveryTimer = 0.16;
      }

      this.cameraShakeTimer = Math.max(
        this.cameraShakeTimer,
        this.miniTurboTier === 3 ? 0.2 : this.miniTurboTier === 2 ? 0.14 : 0.1
      );
      return true;
    };

    // Mandatory Entry Hop (State 1: HOPPING):
    // Pressing Drift/Hop applies an upward vertical impulse (vy = 6.5 relative to slope climb rate) for a 10-frame (~0.167s) window.
    // While airborne in the hop, the player can steer or counter-steer to set their intended driftDirection before landing!
    if (
      input.hopJustPressed &&
      this.grounded &&
      !centerSample.onRamp &&
      !frontSample.onRamp &&
      this.spinOutTimer <= 0
    ) {
      if (this.driftState === "DRIFT_ACTIVE") {
        const tierBeforeSwitch = this.miniTurboTier;
        if (this.driftDirection !== 0) {
          this.aiLastDriftDir = this.driftDirection;
        }
        if (tierBeforeSwitch > 0) {
          triggerChargedMiniTurboBurst();
        }
        globalAiBrain.recordDriftFinished(this.racerId, tierBeforeSwitch);
      }
      this.driftChargeSeconds = 0;
      this.driftChargeSubState = 0;
      this.miniTurboTier = 0;
      this.pumpPhaseHoldSec = 0;
      this.pumpOutsideHoldSec = 0;
      this.verticalVelocity =
        Math.min(6.0, Math.max(-4.0, instantGroundVy)) +
        PHYSICS_CONSTANTS.HOP_VELOCITY_Y;
      this.grounded = false;
      this.airborneTime = 0;
      this.hopTimer = PHYSICS_CONSTANTS.HOP_DURATION_SEC;
      this.driftState = "HOPPING";
      this.hopDirectionLocked = false;
      if (
        Math.abs(input.steer) > PHYSICS_CONSTANTS.HOP_DIRECTION_LOCK_THRESHOLD
      ) {
        this.driftDirection = input.steer > 0 ? 1 : -1;
      } else {
        this.driftDirection = 0;
      }
    }

    // While airborne in the hop window, allow the player to freely steer/counter-steer to choose or switch
    // their driftDirection in mid-air right up until the tires touch down on landing!
    if (this.driftState === "HOPPING") {
      this.hopTimer = Math.max(0, this.hopTimer - dt);
      if (
        Math.abs(input.steer) > PHYSICS_CONSTANTS.HOP_DIRECTION_LOCK_THRESHOLD
      ) {
        this.driftDirection = input.steer > 0 ? 1 : -1;
      }
    }

    const sinPitchPre = Math.sin(this.visualPitch);
    const rideY = Math.max(
      targetGroundY + PHYSICS_CONSTANTS.RIDE_HEIGHT,
      frontSample.y + PHYSICS_CONSTANTS.RIDE_HEIGHT + 1.45 * sinPitchPre,
      rearSample.y + PHYSICS_CONSTANTS.RIDE_HEIGHT - 1.4 * sinPitchPre
    );
    this.prevRideY = rideY;
    this.hasPrevRideY = true;

    // When grounded, track upward hill climb momentum and detect genuine hilltop crest jumps
    // (Never detaches while still climbing an uphill face where frontSample.y > centerSample.y, or on a JUMP_RAMP)
    if (this.grounded && !centerSample.onRamp && !frontSample.onRamp) {
      if (instantGroundVy >= this.slopeVerticalSpeed) {
        this.slopeVerticalSpeed = instantGroundVy;
      } else {
        this.slopeVerticalSpeed = Math.max(
          instantGroundVy,
          this.slopeVerticalSpeed + PHYSICS_CONSTANTS.GRAVITY * dt
        );
      }

      const crestDropRate = this.slopeVerticalSpeed - instantGroundVy;
      const hasReachedHilltopCrest =
        frontSample.y <= centerSample.y + 0.14 && instantGroundVy <= 1.8;

      const isCrestingHillJump =
        this.forwardSpeed > 24.0 &&
        this.slopeVerticalSpeed > 4.5 &&
        crestDropRate > 4.5 &&
        hasReachedHilltopCrest;

      if (isCrestingHillJump) {
        this.grounded = false;
        this.verticalVelocity = Math.min(12.5, this.slopeVerticalSpeed * 0.92);
        this.slopeVerticalSpeed = 0;
        this.airborneTime = 0;
        this.visualPitch = Math.min(this.visualPitch, -0.22);
      }
    }

    // Integrate vertical velocity (parabolic airborne arc) or zero-lag ground tracking
    if (!this.grounded) {
      this.airborneTime += dt;
      this.position.y += this.verticalVelocity * dt;
      // Crisp ~0.18s entry hop arc (vy = 6.5 for ~0.18s per AGENTS.md) vs normal ramp/hill jump gravity
      const gravityMult =
        this.driftState === "HOPPING"
          ? 2.2
          : this.verticalVelocity < 0
          ? PHYSICS_CONSTANTS.FALL_GRAVITY_MULT
          : 1.0;
      this.verticalVelocity += PHYSICS_CONSTANTS.GRAVITY * gravityMult * dt;

      const isInitialHopOrRampAscent =
        this.airborneTime < 0.045 &&
        this.verticalVelocity > instantGroundVy + 1.0;

      if (this.position.y <= rideY && !isInitialHopOrRampAscent) {
        this.position.y = rideY;
        this.verticalVelocity = 0;
        this.grounded = true;
        this.slopeVerticalSpeed = instantGroundVy;
        if (this.airborneTime > 0.3) {
          this.cameraShakeTimer = Math.max(this.cameraShakeTimer, 0.12);
        }
        this.airborneTime = 0;

        // Upon landing from a hop:
        // - If Drift button is still held AND driftDirection != 0, transition into State 2 (DRIFT_ACTIVE / GRAY_SMOKE)
        // - If Drift button was released or no direction was locked, return to normal driving (single alignment hop / SSMT)
        if (this.driftState === "HOPPING") {
          if (
            input.driftHeld &&
            this.forwardSpeed >= minDriftSpeed &&
            (this.driftDirection !== 0 ||
              Math.abs(input.steer) >
                PHYSICS_CONSTANTS.HOP_DIRECTION_LOCK_THRESHOLD)
          ) {
            if (this.driftDirection === 0) {
              this.driftDirection = input.steer >= 0 ? 1 : -1;
            }
            this.hopDirectionLocked = true;
            this.aiLastDriftDir = this.driftDirection;
            this.driftState = "DRIFT_ACTIVE";
            this.driftChargeSubState = 0; // Phase 0: GRAY_SMOKE
            this.pumpPhaseHoldSec = 0;
            this.pumpOutsideHoldSec = 0;
            globalAiBrain.recordDriftInitiated(this.racerId);
          } else {
            this.driftState = "NONE";
            this.driftDirection = 0;
            this.hopDirectionLocked = false;
            this.driftChargeSeconds = 0;
            this.driftChargeSubState = 0;
            this.miniTurboTier = 0;
            this.pumpPhaseHoldSec = 0;
            this.pumpOutsideHoldSec = 0;
          }
        }
      }
    } else {
      this.airborneTime = 0;
      this.verticalVelocity = 0;
      this.position.y = rideY;
    }

    // 4. Surface Speed Multipliers, Off-Road Immunity (Mini-Turbo + PRB + Power-Ups) & 5-Phase Spark Progression
    let hasOffRoadImmunity =
      this.boostTimer > 0 ||
      this.nitroBoostTimer > 0 ||
      this.novaOverdriveTimer > 0 ||
      this.warpAutopilotTimer > 0 ||
      this.phaseCloakTimer > 0 ||
      this.prolongedRocketBoostActive;

    if (this.driftState === "DRIFT_ACTIVE") {
      const offRoadWallBreak =
        this.surface === "OFFROAD" &&
        !hasOffRoadImmunity &&
        this.distToCenter > localWallHalf - 1.8;
      if (
        !input.driftHeld ||
        this.forwardSpeed < minDriftSpeed * 0.72 ||
        this.spinOutTimer > 0 ||
        this.warpAutopilotTimer > 0 ||
        offRoadWallBreak
      ) {
        // Release drift -> trigger Mini-Turbo speed boost if charged, or convert remaining lateral slip into forward speed
        const tierAtRelease = this.miniTurboTier;
        if (this.driftDirection !== 0) {
          this.aiLastDriftDir = this.driftDirection;
        }
        const firedBoost = triggerChargedMiniTurboBurst();
        globalAiBrain.recordDriftFinished(
          this.racerId,
          firedBoost ? tierAtRelease : 0
        );
        if (!firedBoost && this.spinOutTimer <= 0) {
          const currentTotalSpeed = Math.hypot(
            this.velocity.x,
            this.velocity.z
          );
          this.forwardSpeed = Math.min(
            Math.max(this.forwardSpeed, currentTotalSpeed),
            this.stats.topSpeed * 1.05
          );
          if (!this.isPlayer) {
            alignAiHeadingToExitCorridor(0.45);
            this.lateralSpeed = 0;
            this.velocity = this.forwardVector.scale(this.forwardSpeed);
          } else {
            // Smooth momentum-conserving exit without abrupt lateral traction snap (Section 4C):
            // Preserve the world-space velocity direction and blend headingYaw smoothly toward it over the exit recovery window!
            if (currentTotalSpeed > 2.0) {
              const velYaw = Math.atan2(this.velocity.x, this.velocity.z);
              let yawDiff = velYaw - this.headingYaw;
              while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
              while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
              this.headingYaw += yawDiff * 0.55;
            }
            const rightNow = this.rightVector;
            this.lateralSpeed =
              this.velocity.x * rightNow.x + this.velocity.z * rightNow.z;
            this.driftExitRecoveryTimer = 0.16;
          }
        }
        this.driftState = "NONE";
        this.driftDirection = 0;
        this.hopDirectionLocked = false;
        this.driftChargeSeconds = 0;
        this.driftChargeSubState = 0;
        this.miniTurboTier = 0;
        this.pumpPhaseHoldSec = 0;
        this.pumpOutsideHoldSec = 0;
        const chainWeight =
          this.aiDifficulty === "EASY"
            ? 0
            : globalAiBrain.getGenomeForSlot(
                this.aiDifficulty,
                this.aiSlotIndex,
                this.stats.character.id
              ).weights.chainDriftWeight ?? 0.42;
        const minAiCooldown =
          chainWeight > 0.35 && firedBoost ? 0.14 : firedBoost ? 0.36 : 0.28;
        this.aiDriftCooldown = Math.max(
          this.aiDriftCooldown,
          offRoadWallBreak ? 0.6 : minAiCooldown
        );
      } else if (this.grounded) {
        // A. Advance the 5-Phase Manual Alternation State Machine (GRAY_SMOKE -> PUMP_1_OUTSIDE -> BLUE_SPARKS -> PUMP_2_OUTSIDE -> ORANGE_SPARKS)
        const rawInsideSteer = this.driftDirection * input.steer;
        const nextPump = stepManualDriftAlternation(
          {
            subState: this.driftChargeSubState,
            phaseHoldSec: this.pumpPhaseHoldSec,
            outsideHoldSec: this.pumpOutsideHoldSec,
          },
          rawInsideSteer,
          dt
        );
        this.driftChargeSubState = nextPump.subState;
        this.pumpPhaseHoldSec = nextPump.phaseHoldSec;
        this.pumpOutsideHoldSec = nextPump.outsideHoldSec;

        // B. Continuous Drift Charge: accumulates throughout the entire drift (including while counter-steering!)
        // Steering inward charges fastest, neutral charges at full 1.0x rate, and counter-steering still builds charge briskly (>= 0.82x).
        const speedChargeFactor = Math.max(0.8, Math.min(1.25, speedRatio));
        const steerChargeBonus =
          rawInsideSteer >= 0
            ? 1.0 + 0.5 * rawInsideSteer
            : 1.0 + 0.18 * rawInsideSteer;
        this.driftChargeSeconds += dt * speedChargeFactor * steerChargeBonus;

        this.miniTurboTier = getMiniTurboTier(
          this.driftChargeSeconds,
          this.driftChargeSubState
        );
      }
    }

    // Re-evaluate off-road immunity after drift release so a freshly triggered Mini-Turbo immediately powers through grass!
    hasOffRoadImmunity =
      this.boostTimer > 0 ||
      this.nitroBoostTimer > 0 ||
      this.novaOverdriveTimer > 0 ||
      this.warpAutopilotTimer > 0 ||
      this.phaseCloakTimer > 0 ||
      this.prolongedRocketBoostActive;

    let surfaceSpeedMult = PHYSICS_CONSTANTS.PAVEMENT_SPEED_MULT;
    let lateralGrip = PHYSICS_CONSTANTS.PAVEMENT_GRIP;

    if (this.surface === "CURB") {
      surfaceSpeedMult = PHYSICS_CONSTANTS.CURB_SPEED_MULT;
      lateralGrip = PHYSICS_CONSTANTS.CURB_GRIP;
    } else if (this.surface === "SHALLOW_WATER") {
      // Hopping/airborne or any active boost skims across shallow lagoon water at full speed
      if (hasOffRoadImmunity || !this.grounded) {
        surfaceSpeedMult = 1.0;
        lateralGrip = 0.88;
      } else {
        surfaceSpeedMult = PHYSICS_CONSTANTS.SHALLOW_WATER_SPEED_MULT; // 85% mild lagoon cap
        lateralGrip = PHYSICS_CONSTANTS.SHALLOW_WATER_GRIP; // 0.78 wet-tire traction
      }
    } else if (this.surface === "OFFROAD") {
      if (hasOffRoadImmunity) {
        surfaceSpeedMult = 1.0;
        lateralGrip = 0.88;
      } else {
        surfaceSpeedMult = PHYSICS_CONSTANTS.OFFROAD_SPEED_MULT; // 55% clamp
        lateralGrip = PHYSICS_CONSTANTS.OFFROAD_GRIP; // 0.45 off-road traction
      }
    }

    // Slick-Cloud Discharger (OIL_SQUALL) reduces lateral tire traction by 20% while active
    if (this.oilSquallTimer > 0 && !hasOffRoadImmunity) {
      lateralGrip *= 0.8;
    }

    let powerSpeedMult = 1.0;
    // Powersliding preserves 100% of entry top speed around corners (DRIFT_ACTIVE_SPEED_MULT = 1.0)
    if (this.driftState === "DRIFT_ACTIVE" && this.grounded) {
      powerSpeedMult = Math.max(
        powerSpeedMult,
        PHYSICS_CONSTANTS.DRIFT_ACTIVE_SPEED_MULT
      );
    }
    if (this.phaseCloakTimer > 0) {
      powerSpeedMult = Math.max(powerSpeedMult, 1.08);
    }
    if (this.novaOverdriveTimer > 0) {
      powerSpeedMult = Math.max(powerSpeedMult, 1.35);
    }
    if (this.nitroBoostTimer > 0) {
      powerSpeedMult = Math.max(powerSpeedMult, 1.45);
    }
    if (this.warpAutopilotTimer > 0) {
      powerSpeedMult = Math.max(
        powerSpeedMult,
        Math.max(2.5, 108.0 / Math.max(25.0, this.stats.topSpeed))
      );
    }
    if (this.boostTimer > 0) {
      powerSpeedMult = Math.max(powerSpeedMult, this.boostMultiplier);
    }

    const empShrinkSpeedScale =
      this.empShrinkTimer > 0 && this.warpAutopilotTimer <= 0 ? 0.75 : 1.0;

    // AI Racers use 100% of their character/kart's true physical topSpeed and acceleration across all difficulties;
    // EASY, MEDIUM, and HARD differ strictly through driving skill, racing line precision, drift mastery, and item aggressiveness.
    const aiPaceScale = 1.0;
    const aiAccelScale = 1.0;

    const effectiveMaxSpeed =
      this.stats.topSpeed *
      surfaceSpeedMult *
      powerSpeedMult *
      empShrinkSpeedScale *
      aiPaceScale;

    // 5. Longitudinal Acceleration (Non-Linear Launch Torque Curve), Normal-Turn Speed Drag & Off-Road Damping
    const isPowerBoosting =
      this.boostTimer > 0 ||
      this.nitroBoostTimer > 0 ||
      this.novaOverdriveTimer > 0 ||
      this.warpAutopilotTimer > 0;

    if (this.warpAutopilotTimer > 0) {
      // Hyper-Shuttle Autopilot locks cruise speed to 108 u/s along the track spline
      this.spinOutTimer = 0;
      this.spinOutAngle = 0;
      this.forwardSpeed = 108.0;
    } else if (this.spinOutTimer > 0) {
      this.spinOutTimer = Math.max(0, this.spinOutTimer - dt);
      this.spinOutAngle += dt * Math.PI * 4; // 720-degree spin-out
      this.forwardSpeed *= Math.max(0, 1 - 2.8 * dt);
      if (this.spinOutTimer <= 0) {
        // Grant 1.35s post-spinout mercy grace window so recovering karts cannot be chain-stunned at 0 speed
        this.spinOutMercyTimer = Math.max(this.spinOutMercyTimer, 1.35);
        this.burnoutTimer = Math.max(this.burnoutTimer, 0.55);
      }
    } else {
      this.spinOutAngle = 0;
      const effectiveThrottle =
        isPowerBoosting && input.brake === 0
          ? Math.max(0.95, input.throttle)
          : input.throttle;

      const accelBoost = isPowerBoosting
        ? 1.65
        : this.spinOutMercyTimer > 0
        ? 1.35
        : this.driftState === "DRIFT_ACTIVE" && this.grounded
        ? PHYSICS_CONSTANTS.DRIFT_ACTIVE_ACCEL_MULT
        : 1.0;

      // Analytical dt-independent steady-state equilibrium offset matching the 60Hz accel vs. 5.5s^-1 top-speed damper balance:
      // Preserves each archetype's exact Pass #19 cruising speed (v_eq = effectiveMaxSpeed + accel * 0.16515) with zero frame-time oscillation.
      const isUnboostedOffRoad =
        this.grounded && this.surface === "OFFROAD" && !hasOffRoadImmunity;
      const isUnboostedShallowWater =
        this.grounded &&
        this.surface === "SHALLOW_WATER" &&
        !hasOffRoadImmunity;
      const steadyBonusFactor = isUnboostedOffRoad
        ? 0.0825
        : isUnboostedShallowWater
        ? 0.125
        : (1 - 5.5 / 60) / 5.5;
      const steadyStateAccelBonus =
        effectiveThrottle > 0
          ? this.stats.acceleration *
            aiAccelScale *
            accelBoost *
            effectiveThrottle *
            steadyBonusFactor
          : 0;

      // Normal-Turning Speed Bleed:
      // Executing sharp turns without drifting slightly trims the non-drift equilibrium ceiling, whereas DRIFT_ACTIVE preserves 100% speed!
      const absSteer = Math.abs(this.smoothedSteer);
      const nonDriftTurnTrim =
        this.grounded &&
        this.driftState === "NONE" &&
        !isPowerBoosting &&
        absSteer > 0.35
          ? 1.0 - (0.36 * absSteer) / (5.5 + 0.36 * absSteer)
          : 1.0;
      const targetCruiseSpeed =
        (effectiveMaxSpeed + steadyStateAccelBonus) * nonDriftTurnTrim;

      if (effectiveThrottle > 0 && this.forwardSpeed < targetCruiseSpeed) {
        // Non-linear acceleration curve: high initial punch (+55% off-the-line), tapering near top speed
        const lowSpeedProgress = Math.min(
          1,
          Math.max(0, this.forwardSpeed) / (this.stats.topSpeed * 0.65)
        );
        const launchTorque = 1.0 + 0.55 * (1.0 - lowSpeedProgress);
        this.forwardSpeed = Math.min(
          targetCruiseSpeed,
          this.forwardSpeed +
            this.stats.acceleration *
              aiAccelScale *
              launchTorque *
              accelBoost *
              effectiveThrottle *
              dt
        );
      }

      // While a drift booster / power boost is active, maintain full boosted speed right through off-road grass and dirt!
      if (isPowerBoosting && input.brake === 0) {
        const minBoosterSpeed = this.stats.topSpeed * powerSpeedMult;
        if (this.forwardSpeed < minBoosterSpeed) {
          this.forwardSpeed = minBoosterSpeed;
        }
      }

      if (input.brake > 0) {
        if (this.forwardSpeed > 1.0) {
          this.forwardSpeed -= this.stats.acceleration * 1.65 * input.brake * dt;
        } else {
          // Reverse gear
          this.forwardSpeed -= this.stats.acceleration * 0.75 * input.brake * dt;
        }
      }
      if (effectiveThrottle === 0 && input.brake === 0) {
        // Natural rolling resistance
        this.forwardSpeed *= Math.max(0, 1 - 1.15 * dt);
      }

      // Off-Road Linear Damping (lambda_drag = 4.5 s^-1) or Shallow Water Drag (1.8 s^-1)
      if (isUnboostedOffRoad && this.forwardSpeed > targetCruiseSpeed) {
        const excess = this.forwardSpeed - targetCruiseSpeed;
        this.forwardSpeed -=
          excess * Math.min(1, PHYSICS_CONSTANTS.OFFROAD_LINEAR_DRAG * dt);
      } else if (
        isUnboostedShallowWater &&
        this.forwardSpeed > targetCruiseSpeed
      ) {
        const excess = this.forwardSpeed - targetCruiseSpeed;
        this.forwardSpeed -=
          excess *
          Math.min(1, PHYSICS_CONSTANTS.SHALLOW_WATER_LINEAR_DRAG * dt);
      }

      // Smoothly decay any leftover post-boost overspeed down to targetCruiseSpeed
      if (this.forwardSpeed > targetCruiseSpeed) {
        this.forwardSpeed +=
          (targetCruiseSpeed - this.forwardSpeed) * (1 - Math.exp(-5.5 * dt));
        if (this.forwardSpeed - targetCruiseSpeed < 0.02) {
          this.forwardSpeed = targetCruiseSpeed;
        }
      }
      const maxReverse = -this.stats.topSpeed * 0.35;
      if (this.forwardSpeed < maxReverse) {
        this.forwardSpeed = maxReverse;
      }
    }

    // 6. Mathematical Steering Remapping & Unilateral Drift Yaw Lock
    let yawRate = 0;
    const handlingGripBonus = Math.max(
      0,
      (this.stats.handling - 1.75) * 0.14
    );

    if (this.warpAutopilotTimer > 0) {
      // Hyper-Shuttle Autopilot locks heading along the spline lookahead point (steering cleanly around any split median or pit mask)
      const lookaheadT =
        (this.closestTrack.normalizedSplineT +
          28.0 / Math.max(250, this.track.totalTrackLength)) %
        1.0;
      const sampleCount = this.track.samples.length;
      const idx = Math.floor(lookaheadT * sampleCount) % sampleCount;
      let targetLateral = 0;
      for (const mask of this.track.trackMasks) {
        let dtMask = lookaheadT - mask.normT;
        if (dtMask > 0.5) dtMask -= 1.0;
        if (dtMask < -0.5) dtMask += 1.0;
        const longDist = Math.abs(dtMask) * this.track.totalTrackLength;
        if (longDist < mask.length * 0.5 + 18) {
          if (mask.type === "SPLIT_MEDIAN") {
            const side = this.closestTrack.signedLateralOffset >= 0 ? 1 : -1;
            targetLateral = side * (mask.width * 0.5 + 4.2);
          } else {
            const side =
              this.closestTrack.signedLateralOffset >= mask.lateral ? 1 : -1;
            targetLateral = mask.lateral + side * (mask.width * 0.5 + 4.0);
          }
          break;
        }
      }
      const targetPt = this.track.samples[idx].position.add(
        this.track.samples[idx].binormal.scale(targetLateral)
      );
      const toTargetX = targetPt.x - this.position.x;
      const toTargetZ = targetPt.z - this.position.z;
      const targetYaw = Math.atan2(toTargetX, toTargetZ);
      let yawDiff = targetYaw - this.headingYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.headingYaw += yawDiff * Math.min(1, dt * 14.0);
    } else if (this.spinOutTimer <= 0) {
      const airSteerFactor = this.grounded ? 1.0 : 0.65;
      const overTopSpeedRatio = Math.max(
        0,
        Math.abs(this.forwardSpeed) / this.stats.topSpeed - 1.0
      );
      const boostTurnScale = 1.0 + Math.min(0.15, overTopSpeedRatio * 0.32);

      const progressiveSteer =
        Math.sign(this.smoothedSteer) *
        Math.pow(Math.abs(this.smoothedSteer), 1.2);

      // Compress angular yaw rate across handling stats (Rex 1.75 -> 1.22, Aero 2.00 -> 1.30, Nyx 2.10 -> 1.34, Pip 2.15 -> 1.36)
      const effectiveTurnHandling =
        1.22 + (this.stats.handling - 1.75) * 0.34;

      if (this.driftState === "HOPPING") {
        if (this.driftDirection !== 0) {
          // During the airborne hop, pre-rotate the visual chassis and ForwardHeadingVector toward driftDirection
          // over the 10-frame hop window without changing the world-space VelocityVector (Section 4A)!
          yawRate =
            this.driftDirection *
            PHYSICS_CONSTANTS.MAX_DRIFT_YAW_RATE *
            PHYSICS_CONSTANTS.BASE_DRIFT_RATIO *
            0.72;
        } else {
          // Single neutral alignment hop (SSMT straightening hop)
          yawRate = progressiveSteer * effectiveTurnHandling * 0.85;
        }
      } else if (this.driftState === "DRIFT_ACTIVE" && this.driftDirection !== 0) {
        // Committed Unilateral Drift Yaw Rate (driftDirection != 0):
        // insideSteerAmount = steerInput * driftDirection (+1 = inside tighten, -1 = outside widen)
        // Base inward drift yaw rate is kept uniform across handling classes so agile karts (Pip, Nyx, Aero)
        // never over-hook into the inside apex, while their higher driftSteerOutRatio grants crisp counter-steer control!
        const insideSteerAmount = this.driftDirection * this.smoothedSteer;
        const arcMultiplier = computeUnilateralDriftArcMultiplier(
          insideSteerAmount,
          this.stats.driftSteerInRatio,
          this.stats.driftSteerOutRatio
        );
        const maxDriftYawRate = PHYSICS_CONSTANTS.MAX_DRIFT_YAW_RATE * 0.94;
        yawRate =
          this.driftDirection *
          maxDriftYawRate *
          arcMultiplier *
          boostTurnScale *
          airSteerFactor;
      } else {
        // Normal Driving Yaw Rate (driftDirection == 0)
        const speedTurnFactor =
          Math.abs(this.forwardSpeed) > 0.6
            ? Math.sign(this.forwardSpeed) *
              Math.min(1, 0.55 + Math.abs(this.forwardSpeed) / 14)
            : 0;
        const offRoadSteerAssist = this.surface === "OFFROAD" ? 1.15 : 1.0;
        const aiSteerAuthority = !this.isPlayer ? 1.12 : 1.0;
        const exitRecoverySteerScale =
          this.isPlayer && this.driftExitRecoveryTimer > 0
            ? 0.45 + 0.55 * (1 - this.driftExitRecoveryTimer / 0.16)
            : 1.0;
        yawRate =
          progressiveSteer *
          effectiveTurnHandling *
          aiSteerAuthority *
          offRoadSteerAssist *
          boostTurnScale *
          speedTurnFactor *
          airSteerFactor *
          exitRecoverySteerScale;
      }
    }

    this.headingYaw += yawRate * dt;

    // 7. Decoupled Heading vs. Velocity & Lateral Grip Resolution
    const fwdAfterYaw = this.forwardVector;
    const rightAfterYaw = this.rightVector;

    if (this.warpAutopilotTimer > 0) {
      this.lateralSpeed = 0;
      this.velocity.x = fwdAfterYaw.x * this.forwardSpeed;
      this.velocity.z = fwdAfterYaw.z * this.forwardSpeed;
    } else if (this.driftState === "HOPPING" && !this.grounded) {
      if (this.isPlayer) {
        // Section 4A (Airborne Hop Float): While the human player's tires are off the ground during the 10-frame hop,
        // preserve the world-space horizontal travel direction (no mid-air tire traction or trajectory jerk)
        // while ForwardHeadingVector and visualSlipAngle pre-rotate in the air toward the new driftDirection!
        const currentHorizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (currentHorizSpeed > 0.5) {
          const scale = this.forwardSpeed / currentHorizSpeed;
          this.velocity.x *= scale;
          this.velocity.z *= scale;
        } else {
          this.velocity.x = fwdAfterYaw.x * this.forwardSpeed;
          this.velocity.z = fwdAfterYaw.z * this.forwardSpeed;
        }
        this.lateralSpeed =
          this.velocity.x * rightAfterYaw.x + this.velocity.z * rightAfterYaw.z;
      } else if (this.driftDirection !== 0) {
        this.lateralSpeed *= Math.pow(0.65, dt * 60);
        this.velocity.x =
          fwdAfterYaw.x * this.forwardSpeed +
          rightAfterYaw.x * this.lateralSpeed;
        this.velocity.z =
          fwdAfterYaw.z * this.forwardSpeed +
          rightAfterYaw.z * this.lateralSpeed;
      }
    } else {
      // Decompose current horizontal VelocityVector into local lateralSpeed along rightAfterYaw
      const currentLateralVel =
        this.velocity.x * rightAfterYaw.x + this.velocity.z * rightAfterYaw.z;

      if (this.driftState === "DRIFT_ACTIVE" && this.driftDirection !== 0) {
        // In STATE_DRIFTING: damp inward lateral velocity smoothly while allowing outside counter-steer
        // (insideSteerAmount < 0) to push the drift trajectory slightly wider toward the outside of the corner!
        const frameDriftGrip = Math.min(
          0.62,
          PHYSICS_CONSTANTS.DRIFT_LATERAL_GRIP_60HZ *
            (0.85 + this.stats.driftGrip * 0.25)
        );
        const airGripMult = this.grounded ? 1.0 : 0.55;
        const lateralRetain = Math.pow(
          1 - frameDriftGrip * airGripMult,
          dt * 60
        );
        const insideSteerAmount = this.driftDirection * this.smoothedSteer;
        const counterSteerAmount = Math.max(0, -insideSteerAmount);
        const targetOutwardGlide =
          -this.driftDirection *
          counterSteerAmount *
          this.forwardSpeed *
          PHYSICS_CONSTANTS.DRIFT_OUTWARD_COUNTERSTEER_GLIDE;
        this.lateralSpeed =
          currentLateralVel * lateralRetain +
          targetOutwardGlide * (1 - lateralRetain);
      } else {
        // In Normal Driving: cancel out lateralSpeed smoothly; during the 8-frame drift exit recovery window,
        // ramp tire grip gradually from drift grip (0.35) to normal grip (0.85) so tires never jerk on drift release!
        const baseFrameGrip =
          PHYSICS_CONSTANTS.NORMAL_LATERAL_GRIP_60HZ * lateralGrip;
        const fullGrip = !this.isPlayer
          ? Math.max(baseFrameGrip, 0.78)
          : Math.min(0.95, baseFrameGrip + handlingGripBonus);
        const recoveryBlend =
          this.isPlayer && this.driftExitRecoveryTimer > 0
            ? 1 - this.driftExitRecoveryTimer / 0.16
            : 1.0;
        const activeGrip =
          PHYSICS_CONSTANTS.DRIFT_LATERAL_GRIP_60HZ +
          (fullGrip - PHYSICS_CONSTANTS.DRIFT_LATERAL_GRIP_60HZ) * recoveryBlend;
        const airGripMult = this.grounded ? 1.0 : 0.55;
        const lateralRetain =
          isPowerBoosting && (!this.isPlayer || this.driftExitRecoveryTimer <= 0)
            ? 0
            : Math.pow(1 - activeGrip * airGripMult, dt * 60);
        this.lateralSpeed = currentLateralVel * lateralRetain;
      }

      this.velocity.x =
        fwdAfterYaw.x * this.forwardSpeed + rightAfterYaw.x * this.lateralSpeed;
      this.velocity.z =
        fwdAfterYaw.z * this.forwardSpeed + rightAfterYaw.z * this.lateralSpeed;
    }

    // Decay lateral knockVelocity smoothly (from left/right kart-to-kart collisions)
    this.knockVelocity.scaleInPlace(Math.exp(-5.4 * dt));
    if (this.knockVelocity.lengthSquared() < 0.01) {
      this.knockVelocity.setAll(0);
    }

    // Integrate horizontal world position (drive velocity + lateral collision knock)
    this.position.x += (this.velocity.x + this.knockVelocity.x) * dt;
    this.position.z += (this.velocity.z + this.knockVelocity.z) * dt;

    // Keep kart inside outer perimeter wall (expanding around SPLIT_MEDIAN, BOOST_SHORTCUT, and PAVED_SHORTCUT corridors)
    // and smoothly deflect heading along track tangent on wall contact
    const postMoveTrack = this.track.queryClosestTrackPoint(
      this.position,
      this.closestTrack.sampleIndex
    );
    const postWallHalf =
      postMoveTrack.localWallHalfWidth || this.track.wallHalfWidth;
    if (postMoveTrack.horizontalDistance > postWallHalf - 0.8) {
      const sign = postMoveTrack.signedLateralOffset >= 0 ? 1 : -1;
      const clampedLateral = sign * (postWallHalf - 0.85);
      const clampedPos = postMoveTrack.closestPoint.add(
        postMoveTrack.binormal.scale(clampedLateral)
      );
      this.position.x = clampedPos.x;
      this.position.z = clampedPos.z;

      // Reflect inward off perimeter wall
      const wallNormal = postMoveTrack.binormal.scale(-sign);
      const vDotWall = Vector3.Dot(this.velocity, wallNormal);
      if (vDotWall < 0) {
        this.velocity.subtractInPlace(wallNormal.scale(1.35 * vDotWall));
        this.forwardSpeed *= 0.88;
      }
      this.knockVelocity.setAll(0);
      this.lateralSpeed = 0;
      if (this.driftState === "DRIFT_ACTIVE") {
        globalAiBrain.recordDriftFinished(this.racerId, 0);
      }
      this.driftState = "NONE";
      this.driftDirection = 0;
      this.hopDirectionLocked = false;
      this.driftChargeSubState = 0;

      // Smoothly deflect headingYaw toward the forward track tangent so karts slide along the wall instead of sticking into it
      const tangentYaw = Math.atan2(
        postMoveTrack.tangent.x,
        postMoveTrack.tangent.z
      );
      let yawDiff = tangentYaw - this.headingYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.headingYaw += yawDiff * Math.min(1, dt * 9.5);
    }

    // AI outer-wall & wrong-way recovery failsafe (allows off-road drift-boost charging across grass & shortcut corridors!)
    if (!this.isPlayer && this.spinOutTimer <= 0 && this.grounded) {
      const alignDot = Vector3.Dot(this.forwardVector, postMoveTrack.tangent);
      const isAtOuterWall =
        postMoveTrack.horizontalDistance > postWallHalf - 2.2 &&
        !hasOffRoadImmunity;
      if (isAtOuterWall || alignDot < 0.05) {
        this.aiOffTrackTimer += dt;
        // Cash in any charged Mini-Turbo before exiting the drift
        if (this.driftState !== "NONE") {
          const tierBeforeFailsafe = this.miniTurboTier;
          const fired = triggerChargedMiniTurboBurst();
          globalAiBrain.recordDriftFinished(
            this.racerId,
            fired ? tierBeforeFailsafe : 0
          );
          this.driftState = "NONE";
          this.driftDirection = 0;
          this.hopDirectionLocked = false;
          this.driftChargeSeconds = 0;
          this.driftChargeSubState = 0;
          this.miniTurboTier = 0;
          this.lateralSpeed = 0;
          this.aiDriftCooldown = 0.55;
        }
        if (alignDot < 0.05 || this.aiOffTrackTimer > 0.85) {
          const toCenter = postMoveTrack.closestPoint.subtract(this.position);
          toCenter.y = 0;
          if (toCenter.lengthSquared() > 1e-4) {
            toCenter.normalize();
          }
          const recoveryDir = postMoveTrack.tangent
            .scale(0.75)
            .add(toCenter.scale(0.65))
            .normalize();
          const recoveryYaw = Math.atan2(recoveryDir.x, recoveryDir.z);
          let yawDiff = recoveryYaw - this.headingYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          this.headingYaw += yawDiff * Math.min(1, dt * 5.0);
        }
      } else {
        this.aiOffTrackTimer = Math.max(0, this.aiOffTrackTimer - dt * 2.5);
      }
    }

    // 8. Visual Root Orientation: Archetype-Polarized Drift Slip Angle, Airborne Pre-Rotation & 8-Frame Exit Alignment
    const isHoppingOrDrifting =
      (this.driftState === "DRIFT_ACTIVE" || this.driftState === "HOPPING") &&
      this.driftDirection !== 0;
    const hopSlipScale = this.driftState === "HOPPING" ? 0.88 : 1.0;
    const baseSlipRad = (this.stats.baseDriftSlipAngleDeg * Math.PI) / 180;
    const insideSteerForSlip =
      this.driftState === "DRIFT_ACTIVE"
        ? Math.max(-0.5, this.driftDirection * this.smoothedSteer)
        : 0;
    const targetSlipAngle = isHoppingOrDrifting
      ? this.driftDirection *
        (baseSlipRad +
          PHYSICS_CONSTANTS.DRIFT_INWARD_SLIP_BONUS_RAD * insideSteerForSlip) *
        hopSlipScale
      : 0;
    // Pre-rotate visual chassis briskly during the 10-frame hop (14/s), smooth during drift (9/s), and 8-frame recovery on exit (12.5/s)
    const slipLerpRate =
      this.driftState === "HOPPING"
        ? 14.0
        : isHoppingOrDrifting
        ? 9.0
        : 12.5;
    this.visualSlipAngle +=
      (targetSlipAngle - this.visualSlipAngle) * Math.min(1, dt * slipLerpRate);

    // Compute front-to-rear wheel elevation pitch and exact post-move ground height at the NEW (x, z)
    // so the kart never lags behind the slope or clips its nose/wheels into hills when moving at high speed
    const fwd = this.forwardVector;
    const right = this.rightVector;
    const postCenterSample = this.sampleRoadAndRampY(
      this.position.x,
      this.position.z,
      postMoveTrack.sampleIndex
    );
    const postFrontSample = this.sampleRoadAndRampY(
      this.position.x + fwd.x * 1.55,
      this.position.z + fwd.z * 1.55,
      postMoveTrack.sampleIndex
    );
    const postRearSample = this.sampleRoadAndRampY(
      this.position.x - fwd.x * 1.45,
      this.position.z - fwd.z * 1.45,
      postMoveTrack.sampleIndex
    );

    const postShortcut = this.evaluateShortcutCorridor(
      postMoveTrack.normalizedSplineT,
      postMoveTrack.signedLateralOffset,
      postMoveTrack.localRoadHalfWidth || this.track.roadHalfWidth
    );

    let postIsMaskedOffRoad = false;
    for (const mask of this.track.trackMasks) {
      if (mask.type !== "ROAD_HOLE" && mask.type !== "SPLIT_MEDIAN") continue;
      let dtMask = postMoveTrack.normalizedSplineT - mask.normT;
      if (dtMask > 0.5) dtMask -= 1.0;
      if (dtMask < -0.5) dtMask += 1.0;
      const longDist = Math.abs(dtMask) * this.track.totalTrackLength;
      if (longDist <= mask.length * 0.5) {
        const maskLat = mask.type === "SPLIT_MEDIAN" ? 0 : mask.lateral;
        if (
          Math.abs(postMoveTrack.signedLateralOffset - maskLat) <=
          mask.width * 0.5
        ) {
          postIsMaskedOffRoad = true;
          break;
        }
      }
    }
    const postOnRoadOrCurb =
      postShortcut.onPavedShortcut ||
      postShortcut.onBoostShortcut ||
      postShortcut.onShallowWater ||
      (!postIsMaskedOffRoad &&
        postMoveTrack.horizontalDistance <= postMoveTrack.localCurbWidth);
    const postNormal = postOnRoadOrCurb ? postMoveTrack.normal : surfaceNormal;

    const wheelPitch = -Math.atan2(postFrontSample.y - postRearSample.y, 3.0);
    const normalPitch = Math.asin(
      Math.max(-0.62, Math.min(0.62, Vector3.Dot(postNormal, fwd)))
    );
    const groundPitch = Math.max(
      -0.62,
      Math.min(
        0.62,
        postCenterSample.onRamp || postFrontSample.onRamp
          ? wheelPitch
          : 0.8 * wheelPitch + 0.2 * normalPitch
      )
    );

    const airbornePitch =
      this.driftState === "HOPPING"
        ? Math.max(
            -0.38,
            Math.min(
              0.38,
              groundPitch - Math.atan2(this.verticalVelocity, 42.0) * 0.45
            )
          )
        : Math.max(
            -0.55,
            Math.min(0.48, -Math.atan2(this.verticalVelocity, 19.5) * 1.15)
          );
    const targetPitch = this.grounded ? groundPitch : airbornePitch;
    const targetRoll = this.grounded
      ? Math.asin(
          Math.max(-0.45, Math.min(0.45, Vector3.Dot(postNormal, right)))
        ) -
        this.smoothedSteer * 0.05
      : 0;

    // Responsive ground surface normal & wheelbase pitch alignment (28/s grounded so nose pitches immediately on hill entry)
    const pitchBlendRate = this.grounded ? 28 : 12;
    this.visualPitch +=
      (targetPitch - this.visualPitch) * Math.min(1, dt * pitchBlendRate);
    this.visualRoll += (targetRoll - this.visualRoll) * Math.min(1, dt * 16);

    // Sync vertical position to the post-move road/ramp elevation + front/rear wheelbase pitch clearance
    const offRoadDeltaY = !postOnRoadOrCurb
      ? Math.max(-3.5, targetGroundY - centerSample.y)
      : 0;
    const postBaseGroundY =
      postOnRoadOrCurb || postCenterSample.onRamp || postFrontSample.onRamp
        ? Math.max(
            postCenterSample.y,
            0.5 * (postFrontSample.y + postRearSample.y)
          )
        : postCenterSample.y + offRoadDeltaY;

    const sinPitchPost = Math.sin(this.visualPitch);
    const postRideY = Math.max(
      postBaseGroundY + PHYSICS_CONSTANTS.RIDE_HEIGHT,
      postFrontSample.y +
         offRoadDeltaY +
        PHYSICS_CONSTANTS.RIDE_HEIGHT +
        1.45 * sinPitchPost,
      postRearSample.y +
        offRoadDeltaY +
        PHYSICS_CONSTANTS.RIDE_HEIGHT -
        1.4 * sinPitchPost
    );

    if (this.grounded) {
      this.position.y = postRideY;
      this.prevRideY = postRideY;
    } else if (this.position.y < postRideY) {
      this.position.y = postRideY;
      if (this.airborneTime >= 0.045) {
        this.grounded = true;
        this.verticalVelocity = 0;
        this.slopeVerticalSpeed = instantGroundVy;
        this.airborneTime = 0;
      }
    }

    // Ensure any hop that touched down on an uphill slope (via postRideY) immediately resolves its landing transition
    if (this.grounded && this.driftState === "HOPPING") {
      if (
        input.driftHeld &&
        this.forwardSpeed >= minDriftSpeed &&
        (this.driftDirection !== 0 ||
          Math.abs(input.steer) > PHYSICS_CONSTANTS.HOP_DIRECTION_LOCK_THRESHOLD)
      ) {
        if (this.driftDirection === 0) {
          this.driftDirection = input.steer >= 0 ? 1 : -1;
        }
        this.hopDirectionLocked = true;
        this.driftState = "DRIFT_ACTIVE";
        this.driftChargeSubState = 0;
        this.pumpPhaseHoldSec = 0;
        this.pumpOutsideHoldSec = 0;
        globalAiBrain.recordDriftInitiated(this.racerId);
      } else {
        this.driftState = "NONE";
        this.driftDirection = 0;
        this.hopDirectionLocked = false;
        this.driftChargeSeconds = 0;
        this.driftChargeSubState = 0;
        this.miniTurboTier = 0;
        this.pumpPhaseHoldSec = 0;
        this.pumpOutsideHoldSec = 0;
      }
    }

    this.closestTrack = postMoveTrack;
    this.distToCenter = postMoveTrack.horizontalDistance;
    this.surface = postShortcut.onPavedShortcut
      ? "PAVEMENT"
      : postIsMaskedOffRoad
      ? "OFFROAD"
      : postShortcut.onShallowWater
      ? "SHALLOW_WATER"
      : classifyTerrainSurface(
          this.distToCenter,
          postMoveTrack.localRoadHalfWidth,
          postMoveTrack.localCurbWidth
        );

    this.assembly.kartRoot.position.copyFrom(this.position);
    this.assembly.kartRoot.rotation.y = this.headingYaw;
    this.assembly.kartRoot.rotation.x = this.visualPitch;
    this.assembly.kartRoot.rotation.z = this.visualRoll;

    this.assembly.visualRoot.rotation.x = 0;
    this.assembly.visualRoot.rotation.y =
      this.visualSlipAngle + this.spinOutAngle;
    this.assembly.visualRoot.rotation.z = 0;

    const targetVisualScale = this.empShrinkTimer > 0 ? 0.72 : 1.0;
    const currentScale = this.assembly.visualRoot.scaling.x || 1.0;
    const nextScale =
      currentScale +
      (targetVisualScale - currentScale) * Math.min(1, dt * 10.0);
    this.assembly.visualRoot.scaling.setAll(nextScale);

    // 9. Update floating 3D nameplate, wheels, burnout streaks & multi-stage particle systems
    this.assembly.updateNameplate(
      this.name,
      this.controlMode === "REMOTE_HUMAN"
    );
    this.assembly.updateVisuals({
      dt,
      forwardSpeed: this.forwardSpeed,
      maxSpeed: this.stats.topSpeed,
      steerInput: this.smoothedSteer,
      miniTurboTier: this.miniTurboTier,
      isDrifting: this.driftState === "DRIFT_ACTIVE",
      isBoosting:
        this.boostTimer > 0 ||
        this.nitroBoostTimer > 0 ||
        this.warpAutopilotTimer > 0,
      novaOverdriveActive:
        this.novaOverdriveTimer > 0 || this.warpAutopilotTimer > 0,
      surface: this.surface,
      grounded: this.grounded,
      isBurnoutActive: this.burnoutTimer > 0 && this.grounded,
    });

    // 10. Update Lap & Checkpoint Progression + Record Objective AI Telemetry
    this.updateLapProgression(postMoveTrack, elapsedRaceMs, totalLaps);

    if (raceActive && !this.finished) {
      const heightAboveRoad = Math.max(
        0,
        this.position.y - (postMoveTrack.roadY + PHYSICS_CONSTANTS.RIDE_HEIGHT)
      );
      globalAiBrain.recordStep({
        racerId: this.racerId,
        slotIndex: this.slotIndex,
        racerName: this.name,
        characterId: this.stats.character.id,
        color: this.stats.character.colors.badge,
        difficulty: this.aiDifficulty,
        dt,
        x: this.position.x,
        z: this.position.z,
        normT: postMoveTrack.normalizedSplineT,
        signedLat: postMoveTrack.signedLateralOffset,
        roadHalfWidth: postMoveTrack.localRoadHalfWidth,
        wallHalfWidth: postWallHalf,
        forwardSpeed: this.forwardSpeed,
        topSpeed: this.stats.topSpeed,
        surface: this.surface,
        driftState: this.driftState,
        miniTurboTier: this.miniTurboTier,
        hasOffRoadImmunity,
        grounded: this.grounded,
        heightAboveRoad,
        lapTimesMs: this.lapTimesMs,
        combatDisrupted:
          this.combatRecoveryTimer > 0 ||
          this.spinOutTimer > 0 ||
          this.wobbleTimer > 0 ||
          this.empShrinkTimer > 0,
      });
    }
  }

  private sampleRoadAndRampY(
    wx: number,
    wz: number,
    hintIdx?: number
  ): {
    y: number;
    onRamp: boolean;
    atRampLip: boolean;
    rampScale: number;
  } {
    const q = this.track.queryClosestTrackPoint(
      new Vector3(wx, 0, wz),
      hintIdx
    );
    let y = q.roadY;
    let onRamp = false;
    let atRampLip = false;
    let rampScale = 1.0;

    for (const obs of this.track.obstacles) {
      if (obs.type !== "JUMP_RAMP") continue;
      const scale = obs.scale ?? 1.0;
      const halfW = 2.65 * scale;
      const halfL = 2.7 * scale;
      const dx = wx - obs.position.x;
      const dz = wz - obs.position.z;
      if (dx * dx + dz * dz > (halfL + 1.5) * (halfL + 1.5)) continue;

      const sinY = Math.sin(obs.rotationY);
      const cosY = Math.cos(obs.rotationY);
      const localZ = dx * sinY + dz * cosY;
      const localX = dx * cosY - dz * sinY;

      if (Math.abs(localX) <= halfW && localZ >= -halfL && localZ <= halfL) {
        const progress = (localZ + halfL) / (2 * halfL);
        const rampSurfaceY = obs.position.y + progress * (1.82 * scale);
        if (rampSurfaceY >= y) {
          y = rampSurfaceY;
          onRamp = true;
          rampScale = scale;
          if (progress >= 0.72) {
            atRampLip = true;
          }
        }
      }
    }
    return { y, onRamp, atRampLip, rampScale };
  }

  private updateLapProgression(
    query: ClosestTrackQuery,
    elapsedRaceMs: number,
    totalLaps: number
  ): void {
    const t = query.normalizedSplineT;

    // Check wrong-way orientation
    const headingDot = Vector3.Dot(this.forwardVector, query.tangent);
    this.wrongWay = headingDot < -0.35 && this.forwardSpeed > 4.0;

    // Record sector checkpoints (20%-40%, 45%-65%, 70%-92%) so backward driving cannot cheat a lap
    if (t >= 0.18 && t <= 0.42) {
      this.checkpointsMask |= 1;
    } else if (t >= 0.43 && t <= 0.68 && (this.checkpointsMask & 1) !== 0) {
      this.checkpointsMask |= 2;
    } else if (t >= 0.69 && t <= 0.94 && (this.checkpointsMask & 2) !== 0) {
      this.checkpointsMask |= 4;
    }

    // Detect forward wrap across Start/Finish line (t wrapping from > 0.82 to < 0.18)
    if (this.lastNormalizedT > 0.82 && t < 0.18) {
      if ((this.checkpointsMask & 7) === 7 && !this.finished) {
        const lapDuration = Math.max(
          1000,
          elapsedRaceMs - this.lapStartElapsedMs
        );
        this.lapTimesMs.push(lapDuration);
        this.lapStartElapsedMs = elapsedRaceMs;
        this.checkpointsMask = 0;

        if (this.lap >= totalLaps) {
          this.finished = true;
          this.finishTimeMs = elapsedRaceMs;
        } else {
          this.lap += 1;
          this.maxLapReached = Math.max(this.maxLapReached, this.lap);
        }
      }
    }

    this.lastNormalizedT = t;
    const completedLaps = this.finished ? totalLaps : this.lap - 1;
    this.totalProgressDistance =
      completedLaps * this.track.totalTrackLength + query.distanceAlongTrack;
  }

  /**
   * Hot-swaps a racer slot's character & kart procedural 3D assembly and stats in-place
   * (e.g., when a human player joins mid-race and replaces an AI bot without losing lap/track progress).
   */
  public swapRacerIdentity(params: {
    newStats: ResolvedRacerStats;
    newDisplayName: string;
    newControlMode: RacerControlMode;
    ownerPeerId: string | null;
  }): void {
    const identityChanged =
      this.stats.character.id !== params.newStats.character.id ||
      this.stats.kart.id !== params.newStats.kart.id;

    this.stats = params.newStats;
    this.name = params.newDisplayName;
    this.controlMode = params.newControlMode;
    this.isPlayer = params.newControlMode === "LOCAL_HUMAN";
    this.ownerPeerId = params.ownerPeerId;

    if (identityChanged) {
      try {
        this.assembly.dispose();
      } catch {
        // Ignore disposal errors
      }
      this.swapCount += 1;
      this.assembly = buildProceduralKart(
        this.scene,
        `${this.racerId}_swap${this.swapCount}`,
        this.stats,
        this.track.shadowGenerator
      );
      this.assembly.kartRoot.position.copyFrom(this.position);
      this.assembly.kartRoot.rotation.y = this.headingYaw;
      this.assembly.kartRoot.rotation.x = this.visualPitch;
      this.assembly.kartRoot.rotation.z = this.visualRoll;
      this.assembly.visualRoot.rotation.x = 0;
      this.assembly.visualRoot.rotation.y =
        this.visualSlipAngle + this.spinOutAngle;
      this.assembly.visualRoot.rotation.z = 0;
    }

    this.assembly.updateNameplate(
      this.name,
      this.controlMode === "REMOTE_HUMAN"
    );

    this.closestTrack = this.track.queryClosestTrackPoint(this.position);
    this.distToCenter = this.closestTrack.horizontalDistance;
    this.lastNormalizedT = this.closestTrack.normalizedSplineT;
    if (this.lastNormalizedT >= 0.7) {
      this.checkpointsMask |= 7;
    } else if (this.lastNormalizedT >= 0.45) {
      this.checkpointsMask |= 3;
    } else if (this.lastNormalizedT >= 0.2) {
      this.checkpointsMask |= 1;
    }
  }

  public exportNetState(): KartNetState {
    return {
      slotIndex: this.slotIndex,
      controlMode: this.controlMode === "AI" ? "AI" : "HUMAN",
      ownerPeerId: this.ownerPeerId,
      playerName: this.name,
      characterId: this.stats.character.id,
      kartId: this.stats.kart.id,
      x: Number(this.position.x.toFixed(3)),
      y: Number(this.position.y.toFixed(3)),
      z: Number(this.position.z.toFixed(3)),
      vx: Number(this.velocity.x.toFixed(3)),
      vy: Number(this.velocity.y.toFixed(3)),
      vz: Number(this.velocity.z.toFixed(3)),
      kx: Number(this.knockVelocity.x.toFixed(3)),
      kz: Number(this.knockVelocity.z.toFixed(3)),
      headingYaw: Number(this.headingYaw.toFixed(4)),
      forwardSpeed: Number(this.forwardSpeed.toFixed(3)),
      verticalVelocity: Number(this.verticalVelocity.toFixed(3)),
      grounded: this.grounded,
      surface: this.surface,
      driftState: this.driftState,
      driftDirection: this.driftDirection,
      driftChargeSeconds: Number(this.driftChargeSeconds.toFixed(2)),
      driftChargeSubState: this.driftChargeSubState,
      miniTurboTier: this.miniTurboTier,
      boostTimer: Number(this.boostTimer.toFixed(2)),
      boostMultiplier: Number(this.boostMultiplier.toFixed(2)),
      activeBoostLabel: this.activeBoostLabel,
      nitroBoostTimer: Number(this.nitroBoostTimer.toFixed(2)),
      novaOverdriveTimer: Number(this.novaOverdriveTimer.toFixed(2)),
      goldenOverclockTimer: Number(this.goldenOverclockTimer.toFixed(2)),
      warpAutopilotTimer: Number(this.warpAutopilotTimer.toFixed(2)),
      oilSquallTimer: Number(this.oilSquallTimer.toFixed(2)),
      spinOutTimer: Number(this.spinOutTimer.toFixed(2)),
      wobbleTimer: Number(this.wobbleTimer.toFixed(2)),
      heldItem: this.heldItem,
      heldItemCharges: this.heldItemCharges,
      orbitalShieldCharges: this.orbitalShieldCharges,
      tripleSeekerCharges: this.tripleSeekerCharges,
      tripleCryoMineCharges: this.tripleCryoMineCharges,
      rouletteTimer: Number(this.rouletteTimer.toFixed(2)),
      lap: this.lap,
      maxLapReached: this.maxLapReached,
      checkpointsMask: this.checkpointsMask,
      lastNormalizedT: Number(this.lastNormalizedT.toFixed(4)),
      totalProgressDistance: Number(this.totalProgressDistance.toFixed(2)),
      finished: this.finished,
      finishTimeMs: this.finishTimeMs,
      lapStartElapsedMs: Math.round(this.lapStartElapsedMs),
      lapTimesMs: this.lapTimesMs.map((t) => Math.round(t)),
      rank: this.rank,
    };
  }

  public applyNetState(state: KartNetState, isHardSnap = false): void {
    if (!this.isPlayer) {
      if (state.playerName && state.playerName.trim().length > 0) {
        this.name = state.playerName;
      }
      this.ownerPeerId = state.ownerPeerId;
      this.controlMode =
        state.controlMode === "HUMAN" ? "REMOTE_HUMAN" : "AI";
      this.assembly.updateNameplate(
        this.name,
        this.controlMode === "REMOTE_HUMAN"
      );
    }

    this.netTargetPos.set(state.x, state.y, state.z);
    this.netTargetVel.set(state.vx, state.vy, state.vz);
    this.netTargetYaw = state.headingYaw;
    this.hasNetTarget = true;

    const distSq = Vector3.DistanceSquared(this.position, this.netTargetPos);
    if (isHardSnap || distSq > 22 * 22) {
      this.position.copyFrom(this.netTargetPos);
      this.velocity.copyFrom(this.netTargetVel);
      this.headingYaw = state.headingYaw;
      this.assembly.kartRoot.position.copyFrom(this.position);
      this.assembly.kartRoot.rotation.y = this.headingYaw;
      this.closestTrack = this.track.queryClosestTrackPoint(this.position);
      this.distToCenter = this.closestTrack.horizontalDistance;
    } else {
      this.velocity.copyFrom(this.netTargetVel);
    }

    this.knockVelocity.set(state.kx, 0, state.kz);
    this.forwardSpeed = state.forwardSpeed;
    this.verticalVelocity = state.verticalVelocity;
    this.grounded = state.grounded;
    this.surface = state.surface;
    this.driftState = state.driftState;
    this.driftDirection = state.driftDirection;
    this.driftChargeSeconds = state.driftChargeSeconds;
    this.driftChargeSubState = state.driftChargeSubState ?? 0;
    this.miniTurboTier = state.miniTurboTier;
    this.boostTimer = state.boostTimer;
    this.boostMultiplier = state.boostMultiplier;
    this.activeBoostLabel = state.activeBoostLabel;
    this.nitroBoostTimer = state.nitroBoostTimer;
    this.novaOverdriveTimer = state.novaOverdriveTimer;
    this.goldenOverclockTimer = state.goldenOverclockTimer ?? 0;
    this.warpAutopilotTimer = state.warpAutopilotTimer ?? 0;
    this.oilSquallTimer = state.oilSquallTimer ?? 0;
    this.spinOutTimer = state.spinOutTimer;
    this.wobbleTimer = state.wobbleTimer;
    this.heldItem = state.heldItem;
    this.heldItemCharges =
      state.heldItemCharges ??
      (state.heldItem === "TRIPLE_NITRO" ||
      state.heldItem === "ORBITAL_SHIELD" ||
      state.heldItem === "TRIPLE_SEEKER" ||
      state.heldItem === "TRIPLE_CRYO_MINE"
        ? 3
        : state.heldItem
        ? 1
        : 0);
    this.orbitalShieldCharges =
      state.orbitalShieldCharges ??
      (state.heldItem === "ORBITAL_SHIELD" ? this.heldItemCharges : 0);
    this.tripleSeekerCharges =
      state.tripleSeekerCharges ??
      (state.heldItem === "TRIPLE_SEEKER" ? this.heldItemCharges : 0);
    this.tripleCryoMineCharges =
      state.tripleCryoMineCharges ??
      (state.heldItem === "TRIPLE_CRYO_MINE" ? this.heldItemCharges : 0);
    this.rouletteTimer = state.rouletteTimer;
    this.lap = state.lap;
    this.maxLapReached = state.maxLapReached;
    this.checkpointsMask = state.checkpointsMask;
    this.lastNormalizedT = state.lastNormalizedT;
    if (this.lastNormalizedT >= 0.7) {
      this.checkpointsMask |= 7;
    } else if (this.lastNormalizedT >= 0.45) {
      this.checkpointsMask |= 3;
    } else if (this.lastNormalizedT >= 0.2) {
      this.checkpointsMask |= 1;
    }
    this.totalProgressDistance = state.totalProgressDistance;
    this.finished = state.finished;
    this.finishTimeMs = state.finishTimeMs;
    if (state.lapStartElapsedMs !== undefined) {
      this.lapStartElapsedMs = state.lapStartElapsedMs;
    }
    if (Array.isArray(state.lapTimesMs)) {
      this.lapTimesMs = [...state.lapTimesMs];
    }
    this.rank = state.rank;
  }

  public applyNetworkCollisionImpulse(payload: NetCollisionImpulsePayload): void {
    this.knockVelocity.set(payload.kx, 0, payload.kz);
    this.velocity.set(payload.vx, 0, payload.vz);
    this.forwardSpeed = payload.forwardSpeed;
    this.verticalVelocity = Math.max(
      this.verticalVelocity,
      payload.verticalVelocity
    );
    this.grounded = false;
    this.wobbleTimer = Math.max(this.wobbleTimer, payload.wobbleTimer);
    this.cameraShakeTimer = Math.max(this.cameraShakeTimer, 0.45);
    this.collisionCooldown = 0.25;
  }

  /**
   * 60Hz dead-reckoning + smooth Hermite/exponential interpolation for remote human karts
   * and client-replicated AI bots. Keeps wheels, drift sparks, and terrain clamping smooth.
   */
  public updateRemoteInterpolation(
    dt: number,
    elapsedRaceMs: number,
    totalLaps: number
  ): void {
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.cameraShakeTimer = Math.max(0, this.cameraShakeTimer - dt);

    if (this.spinOutTimer > 0) {
      this.spinOutTimer = Math.max(0, this.spinOutTimer - dt);
      this.spinOutAngle += Math.PI * 4 * dt;
    } else {
      this.spinOutAngle = 0;
    }

    // Advance dead-reckoned position along velocity, then blend smoothly toward latest network target
    this.position.x += (this.velocity.x + this.knockVelocity.x) * dt;
    this.position.z += (this.velocity.z + this.knockVelocity.z) * dt;
    this.knockVelocity.scaleInPlace(Math.exp(-4.2 * dt));

    if (this.hasNetTarget) {
      // Advance target slightly along its own velocity for lag compensation
      this.netTargetPos.x += this.netTargetVel.x * dt;
      this.netTargetPos.z += this.netTargetVel.z * dt;

      const posBlend = Math.min(1, dt * 13.5);
      this.position.x += (this.netTargetPos.x - this.position.x) * posBlend;
      this.position.z += (this.netTargetPos.z - this.position.z) * posBlend;
      this.position.y += (this.netTargetPos.y - this.position.y) * posBlend;

      let yawDiff = this.netTargetYaw - this.headingYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.headingYaw += yawDiff * Math.min(1, dt * 14.0);
    }

    this.closestTrack = this.track.queryClosestTrackPoint(
      this.position,
      this.closestTrack.sampleIndex
    );
    this.distToCenter = this.closestTrack.horizontalDistance;
    this.surface = classifyTerrainSurface(
      this.distToCenter,
      this.closestTrack.localRoadHalfWidth,
      this.closestTrack.localCurbWidth
    );

    if (
      this.grounded &&
      this.spinOutTimer <= 0 &&
      this.forwardSpeed > 0.4 &&
      this.forwardSpeed < 4.5
    ) {
      this.burnoutTimer = Math.max(this.burnoutTimer, 0.7);
    } else if (this.burnoutTimer > 0) {
      this.burnoutTimer =
        this.grounded && this.forwardSpeed < this.stats.topSpeed * 0.52
          ? Math.max(0, this.burnoutTimer - dt)
          : 0;
    }

    const fwd = this.forwardVector;
    const centerSample = this.sampleRoadAndRampY(
      this.position.x,
      this.position.z,
      this.closestTrack.sampleIndex
    );
    const frontSample = this.sampleRoadAndRampY(
      this.position.x + fwd.x * 1.55,
      this.position.z + fwd.z * 1.55,
      this.closestTrack.sampleIndex
    );
    const rearSample = this.sampleRoadAndRampY(
      this.position.x - fwd.x * 1.45,
      this.position.z - fwd.z * 1.45,
      this.closestTrack.sampleIndex
    );
    const groundPitch = Math.max(
      -0.62,
      Math.min(0.62, -Math.atan2(frontSample.y - rearSample.y, 3.0))
    );
    const airbornePitch =
      this.driftState === "HOPPING"
        ? Math.max(
            -0.38,
            Math.min(
              0.38,
              groundPitch - Math.atan2(this.verticalVelocity, 42.0) * 0.45
            )
          )
        : Math.max(
            -0.55,
            Math.min(0.48, -Math.atan2(this.verticalVelocity, 19.5) * 1.15)
          );
    const targetPitch = this.grounded ? groundPitch : airbornePitch;
    const pitchBlendRate = this.grounded ? 26 : 12;
    this.visualPitch +=
      (targetPitch - this.visualPitch) * Math.min(1, dt * pitchBlendRate);

    if (this.grounded) {
      const sinPitch = Math.sin(this.visualPitch);
      const minGroundY = Math.max(
        centerSample.y + PHYSICS_CONSTANTS.RIDE_HEIGHT,
        frontSample.y + PHYSICS_CONSTANTS.RIDE_HEIGHT + 1.45 * sinPitch,
        rearSample.y + PHYSICS_CONSTANTS.RIDE_HEIGHT - 1.4 * sinPitch
      );
      if (!this.hasNetTarget || this.position.y < minGroundY) {
        this.position.y = minGroundY;
      }
    }

    const targetSlipAngle =
      this.driftState === "DRIFT_ACTIVE"
        ? this.driftDirection * PHYSICS_CONSTANTS.DRIFT_SLIP_ANGLE_RAD
        : 0;
    this.visualSlipAngle +=
      (targetSlipAngle - this.visualSlipAngle) * Math.min(1, dt * 10);

    this.assembly.kartRoot.position.copyFrom(this.position);
    this.assembly.kartRoot.rotation.y = this.headingYaw;
    this.assembly.kartRoot.rotation.x = this.visualPitch;
    this.assembly.kartRoot.rotation.z = this.visualRoll;
    this.assembly.visualRoot.rotation.x = 0;
    this.assembly.visualRoot.rotation.y =
      this.visualSlipAngle + this.spinOutAngle;
    this.assembly.visualRoot.rotation.z = 0;

    this.assembly.updateNameplate(
      this.name,
      this.controlMode === "REMOTE_HUMAN"
    );
    this.assembly.updateVisuals({
      dt,
      forwardSpeed: this.forwardSpeed,
      maxSpeed: this.stats.topSpeed,
      steerInput: this.driftDirection,
      miniTurboTier: this.miniTurboTier,
      isDrifting: this.driftState === "DRIFT_ACTIVE",
      isBoosting: this.boostTimer > 0 || this.nitroBoostTimer > 0,
      novaOverdriveActive: this.novaOverdriveTimer > 0,
      surface: this.surface,
      grounded: this.grounded,
      isBurnoutActive: this.burnoutTimer > 0 && this.grounded,
    });

    if (this.hasNetTarget) {
      const headingDot = Vector3.Dot(this.forwardVector, this.closestTrack.tangent);
      this.wrongWay = headingDot < -0.35 && this.forwardSpeed > 4.0;
      const t = this.closestTrack.normalizedSplineT;
      if (Math.abs(t - this.lastNormalizedT) < 0.25) {
        this.lastNormalizedT = t;
      }
      if (t >= 0.7) {
        this.checkpointsMask |= 7;
      } else if (t >= 0.45) {
        this.checkpointsMask |= 3;
      } else if (t >= 0.2) {
        this.checkpointsMask |= 1;
      }
      if (!this.finished) {
        this.totalProgressDistance += Math.max(0, this.forwardSpeed) * dt;
      }
    } else {
      this.updateLapProgression(this.closestTrack, elapsedRaceMs, totalLaps);
    }
  }

  public dispose(): void {
    this.assembly.dispose();
  }
}

