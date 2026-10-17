import { Vector3 } from "@babylonjs/core";
import {
  AsymmetricCollisionReport,
  DriftChargeSubState,
  MiniTurboTier,
  SurfaceType,
} from "@/src/types/game";

export const PHYSICS_CONSTANTS = {
  MAX_DT: 0.05,
  GRAVITY: -32.0,
  FALL_GRAVITY_MULT: 1.35,
  RIDE_HEIGHT: 0.08,
  RAY_LENGTH: 65.0,

  // Terrain surface multipliers & traction (per AGENTS.md spec + decoupled lateral grip)
  PAVEMENT_SPEED_MULT: 1.0,
  PAVEMENT_GRIP: 0.92,

  CURB_SPEED_MULT: 0.98,
  CURB_GRIP: 0.88,

  OFFROAD_SPEED_MULT: 0.55,
  OFFROAD_GRIP: 0.45,
  OFFROAD_LINEAR_DRAG: 4.5,

  // Decoupled Heading vs. Velocity & Lateral Grip Resolution (60Hz baseline)
  NORMAL_LATERAL_GRIP_60HZ: 0.85,
  DRIFT_LATERAL_GRIP_60HZ: 0.35,
  NORMAL_TURN_SPEED_DRAG_60HZ: 0.985,
  EXIT_SLIP_RECOVERY_FRAMES: 8,

  // Entry Hop & Unilateral Drift Yaw Architecture
  HOP_VELOCITY_Y: 6.5,
  HOP_DURATION_SEC: 10 / 60, // 10 frames (~0.167s) airborne hop window
  HOP_DIRECTION_LOCK_THRESHOLD: 0.2,
  PRE_TURN_HOP_ANGLE_RAD: (14 * Math.PI) / 180, // 14 deg visual chassis pre-rotation during airborne hop
  MIN_DRIFT_SPEED_RATIO: 0.38,
  DRIFT_SLIP_ANGLE_RAD: (14 * Math.PI) / 180,
  DRIFT_INWARD_SLIP_BONUS_RAD: (6 * Math.PI) / 180,

  // Unilateral Drift Steering Remapping (Matched to 48u-85u track corner radii)
  MAX_DRIFT_YAW_RATE: 0.94,
  BASE_DRIFT_RATIO: 0.54,
  DEFAULT_DRIFT_STEER_IN_RATIO: 0.28,
  DEFAULT_DRIFT_STEER_OUT_RATIO: 0.56,
  MIN_DRIFT_ARC_RATIO: 0.0, // Allows full counter-steer to straighten the drift line along the apex without hooking inward
  DRIFT_OUTWARD_COUNTERSTEER_GLIDE: 0.19, // Responsive outward lateral glide when counter-steering away from the inside apex

  // Legacy constants kept for backward compatibility
  BASE_DRIFT_TURN_RATE: 0.56,
  DRIFT_COUNTER_STEER_GAIN: 0.32,
  DRIFT_NEUTRAL_SLIDE_RATIO: 0.05,
  DRIFT_LATERAL_STEER_SHIFT: 0.03,
  DRIFT_ACTIVE_SPEED_MULT: 1.0, // Preserves 100% of entry top speed around corners
  DRIFT_ACTIVE_ACCEL_MULT: 1.18,

  // 5-Phase Manual Alternation State Machine & Rhythm Guard (60Hz baseline)
  PUMP_STEER_THRESHOLD: 0.5,
  MIN_INPUT_HOLD_FRAMES: 3,
  MIN_INPUT_HOLD_SEC: 3 / 60, // 0.05s (3 frames at 60Hz)
  MAX_OUTSIDE_HOLD_FRAMES: 35,
  MAX_OUTSIDE_HOLD_SEC: 35 / 60, // ~0.583s (35 frames at 60Hz)

  // Hybrid Mini-Turbo thresholds & rewards
  MINI_TURBO_BOOST_MULT: 1.25,
  TIER1_THRESHOLD_SEC: 1.0,
  TIER1_BOOST_MULT: 1.25,
  TIER1_BOOST_DURATION_SEC: 0.8,

  TIER2_THRESHOLD_SEC: 2.2,
  TIER2_BOOST_MULT: 1.4,
  TIER2_BOOST_DURATION_SEC: 1.5,

  TIER3_THRESHOLD_SEC: 3.6,
  TIER3_BOOST_MULT: 1.55,
  TIER3_BOOST_DURATION_SEC: 2.2,

  // Countdown Rocket Start Boost
  ROCKET_START_BOOST_MULT: 1.28,
  ROCKET_START_DURATION_SEC: 1.15,

  // Asymmetric Mass Collision ("The Juggernaut Law" with mass-scaled sideways shoving & recoil)
  KART_COLLISION_RADIUS: 1.52,
  MASS_DOMINANCE_EXPONENT: 3.0,
  JUGGERNAUT_MASS_DIFF_THRESHOLD: 40,
  JUGGERNAUT_RATIO_THRESHOLD: 1.3,
  MIN_BUMP_REL_SPEED: 18.0,
  BOUNCE_ELASTICITY: 0.35,
  KNOCKBACK_SCALE: 0.52,
  MAX_KNOCKBACK_SPEED: 30.0,
  LIGHT_HOP_VY: 1.8,
  WOBBLE_STUN_SEC: 0.18,
  NOVA_OVERDRIVE_MASS: 9999,
};

export interface CollidableKartBody {
  racerId: string;
  name: string;
  position: Vector3;
  velocity: Vector3;
  knockVelocity: Vector3;
  forwardSpeed: number;
  forwardVector: Vector3;
  rightVector: Vector3;
  verticalVelocity: number;
  grounded: boolean;
  effectiveMass: number;
  wobbleTimer: number;
  collisionCooldown: number;
  cameraShakeTimer: number;
  spinOutTimer: number;
  novaOverdriveTimer: number;
  phaseCloakTimer?: number;
}

export function classifyTerrainSurface(
  horizontalDistanceToCenter: number,
  roadHalfWidth: number,
  curbOuterWidth: number
): SurfaceType {
  if (horizontalDistanceToCenter <= roadHalfWidth) {
    return "PAVEMENT";
  }
  if (horizontalDistanceToCenter <= curbOuterWidth) {
    return "CURB";
  }
  return "OFFROAD";
}

/**
 * Unilateral Drift Yaw Arc Remapping:
 * Computes the strictly positive arcMultiplier (>= MIN_DRIFT_ARC_RATIO = 0.05)
 * from insideSteerAmount = steerInput * driftDirection.
 * Steering into the turn (> 0) tightens the arc; counter-steering (< 0) widens the arc
 * without ever crossing zero yaw into a counter-turn.
 */
export function computeUnilateralDriftArcMultiplier(
  insideSteerAmount: number,
  driftSteerInRatio = PHYSICS_CONSTANTS.DEFAULT_DRIFT_STEER_IN_RATIO,
  driftSteerOutRatio = PHYSICS_CONSTANTS.DEFAULT_DRIFT_STEER_OUT_RATIO
): number {
  const rawArc =
    insideSteerAmount >= 0
      ? PHYSICS_CONSTANTS.BASE_DRIFT_RATIO +
        insideSteerAmount * driftSteerInRatio
      : PHYSICS_CONSTANTS.BASE_DRIFT_RATIO +
        insideSteerAmount * driftSteerOutRatio;
  return Math.max(PHYSICS_CONSTANTS.MIN_DRIFT_ARC_RATIO, rawArc);
}

export interface ManualDriftPumpTracker {
  subState: DriftChargeSubState;
  phaseHoldSec: number;
  outsideHoldSec: number;
}

/**
 * Advances the 5-Phase Manual Powerslide Alternation State Machine:
 * 0 (GRAY_SMOKE) -> 1 (PUMP_1_OUTSIDE) -> 2 (BLUE_SPARKS) -> 3 (PUMP_2_OUTSIDE) -> 4 (ORANGE_SPARKS)
 * Enforces >= 3-frame hold per directional input while preserving accumulated charge during counter-steering.
 */
export function stepManualDriftAlternation(
  tracker: ManualDriftPumpTracker,
  insideSteerAmount: number,
  dt: number
): ManualDriftPumpTracker {
  let { subState, phaseHoldSec, outsideHoldSec } = tracker;
  const thresh = PHYSICS_CONSTANTS.PUMP_STEER_THRESHOLD;
  const minHold = PHYSICS_CONSTANTS.MIN_INPUT_HOLD_SEC;

  const isOutside = insideSteerAmount < -thresh;
  const isInside = insideSteerAmount > thresh;

  if (subState === 4) {
    // Already fully charged with continuous Orange Sparks!
    return { subState: 4, phaseHoldSec: 0, outsideHoldSec: 0 };
  }

  if (isOutside) {
    outsideHoldSec += dt;
  } else {
    outsideHoldSec = 0;
  }

  if (subState === 0) {
    // 0: GRAY_SMOKE — Waiting for 1st Outside input (insideSteerAmount < -0.5) held >= 3 frames
    if (isOutside) {
      phaseHoldSec += dt;
      if (phaseHoldSec >= minHold) {
        subState = 1;
        phaseHoldSec = 0;
      }
    } else {
      phaseHoldSec = 0;
    }
  } else if (subState === 1) {
    // 1: PUMP_1_OUTSIDE — Waiting for 1st Inside input (insideSteerAmount > 0.5) held >= 3 frames
    if (isInside) {
      phaseHoldSec += dt;
      if (phaseHoldSec >= minHold) {
        subState = 2; // BLUE_SPARKS ignited!
        phaseHoldSec = 0;
      }
    } else {
      phaseHoldSec = 0;
    }
  } else if (subState === 2) {
    // 2: BLUE_SPARKS — Waiting for 2nd Outside input (insideSteerAmount < -0.5) held >= 3 frames
    if (isOutside) {
      phaseHoldSec += dt;
      if (phaseHoldSec >= minHold) {
        subState = 3;
        phaseHoldSec = 0;
      }
    } else {
      phaseHoldSec = 0;
    }
  } else if (subState === 3) {
    // 3: PUMP_2_OUTSIDE — Waiting for 2nd Inside input (insideSteerAmount > 0.5) held >= 3 frames
    if (isInside) {
      phaseHoldSec += dt;
      if (phaseHoldSec >= minHold) {
        subState = 4; // ORANGE_SPARKS (Mini-Turbo Ready!)
        phaseHoldSec = 0;
      }
    } else {
      phaseHoldSec = 0;
    }
  }

  return { subState, phaseHoldSec, outsideHoldSec };
}

export function getMiniTurboTier(
  chargeSeconds: number,
  chargeSubState: DriftChargeSubState = 0
): MiniTurboTier {
  if (chargeSeconds >= PHYSICS_CONSTANTS.TIER3_THRESHOLD_SEC) return 3;
  if (
    chargeSubState === 4 ||
    chargeSeconds >= PHYSICS_CONSTANTS.TIER2_THRESHOLD_SEC
  ) {
    return 2;
  }
  if (
    chargeSubState >= 2 ||
    chargeSeconds >= PHYSICS_CONSTANTS.TIER1_THRESHOLD_SEC
  ) {
    return 1;
  }
  return 0;
}

export function getMiniTurboReward(
  tier: MiniTurboTier,
  durationBonusRatio = 0,
  archetypeBaseDurationSec?: number,
  chargeSubState: DriftChargeSubState = 0,
  chargeSeconds = 0
): { speedMultiplier: number; durationSec: number; label: string } | null {
  const bonusScale = 1 + durationBonusRatio;
  const archetypeScale =
    archetypeBaseDurationSec !== undefined
      ? Math.max(0.95, Math.min(1.06, archetypeBaseDurationSec / 0.45))
      : 1.0;

  if (tier === 3) {
    return {
      speedMultiplier: PHYSICS_CONSTANTS.TIER3_BOOST_MULT,
      durationSec: Number(
        (
          PHYSICS_CONSTANTS.TIER3_BOOST_DURATION_SEC *
          archetypeScale *
          bonusScale
        ).toFixed(2)
      ),
      label: "ULTRA MINI-TURBO (+55%)",
    };
  }
  if (tier === 2) {
    const isManualOrange =
      chargeSubState === 4 &&
      chargeSeconds < PHYSICS_CONSTANTS.TIER2_THRESHOLD_SEC;
    return {
      speedMultiplier: isManualOrange
        ? PHYSICS_CONSTANTS.MINI_TURBO_BOOST_MULT
        : PHYSICS_CONSTANTS.TIER2_BOOST_MULT,
      durationSec: Number(
        (
          (isManualOrange
            ? PHYSICS_CONSTANTS.TIER1_BOOST_DURATION_SEC * 1.35
            : PHYSICS_CONSTANTS.TIER2_BOOST_DURATION_SEC) *
          archetypeScale *
          bonusScale
        ).toFixed(2)
      ),
      label: isManualOrange
        ? "MINI-TURBO SURGE (+25%)"
        : "SUPER MINI-TURBO (+40%)",
    };
  }
  if (tier === 1) {
    return {
      speedMultiplier: PHYSICS_CONSTANTS.TIER1_BOOST_MULT,
      durationSec: Number(
        (
          PHYSICS_CONSTANTS.TIER1_BOOST_DURATION_SEC *
          archetypeScale *
          bonusScale
        ).toFixed(2)
      ),
      label: "MINI-TURBO (+25%)",
    };
  }
  return null;
}

export function computeCubicMassDominance(
  massA: number,
  massB: number
): { alphaA: number; alphaB: number } {
  const gamma = PHYSICS_CONSTANTS.MASS_DOMINANCE_EXPONENT;
  const powA = Math.pow(Math.max(1, massA), gamma);
  const powB = Math.pow(Math.max(1, massB), gamma);
  const denom = powA + powB;
  return {
    alphaA: powB / denom,
    alphaB: powA / denom,
  };
}

/**
 * Non-Newtonian Asymmetric Mass-Dominance Collision Resolver ("The Juggernaut Law").
 * Shoves lighter karts cleanly to the LEFT or RIGHT across the track proportional to
 * how much heavier the opponent is, and recoils lightweight karts when they crash into
 * heavier karts—never causing a projectile-style spin-out.
 */
export function resolveAsymmetricKartCollision(
  kartA: CollidableKartBody,
  kartB: CollidableKartBody
): AsymmetricCollisionReport | null {
  if ((kartA.phaseCloakTimer ?? 0) > 0 || (kartB.phaseCloakTimer ?? 0) > 0) {
    return null;
  }
  const dx = kartA.position.x - kartB.position.x;
  const dz = kartA.position.z - kartB.position.z;
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  const minSep = PHYSICS_CONSTANTS.KART_COLLISION_RADIUS * 2;

  if (horizDist >= minSep) {
    return null;
  }

  // Unit collision normal pointing from Kart B to Kart A in the horizontal plane
  const nBA =
    horizDist > 1e-4
      ? new Vector3(dx / horizDist, 0, dz / horizDist)
      : kartB.rightVector.clone();

  // Compute lateral (left/right) direction relative to the karts' forward heading
  let avgRight = kartA.rightVector.add(kartB.rightVector);
  if (avgRight.lengthSquared() < 1e-4) {
    avgRight = kartB.rightVector.clone();
  } else {
    avgRight.normalize();
  }

  const lateralDot = Vector3.Dot(nBA, avgRight);
  const sideSign = Math.abs(lateralDot) > 0.05 ? Math.sign(lateralDot) : 1;
  // Predominantly sideways (left/right) push vector with outward normal deflection
  const lateralBA = avgRight
    .scale(sideSign * 0.86)
    .add(nBA.scale(0.32))
    .normalize();

  const penetrationDepth = minSep - horizDist;
  const massA = kartA.effectiveMass;
  const massB = kartB.effectiveMass;

  const { alphaA, alphaB } = computeCubicMassDominance(massA, massB);

  // Immediately separate overlapping positions along the collision normal + lateral axis
  // using cubic mass dominance weights so karts never stick together across frames
  const sepDir = nBA.scale(0.75).add(lateralBA.scale(0.25)).normalize();
  kartA.position.addInPlace(sepDir.scale(penetrationDepth * alphaA + 0.05));
  kartB.position.subtractInPlace(
    sepDir.scale(penetrationDepth * alphaB + 0.05)
  );

  if (kartA.collisionCooldown > 0 && kartB.collisionCooldown > 0) {
    return null;
  }

  const relVel = kartA.velocity.subtract(kartB.velocity);
  const rawRelSpeed = new Vector3(relVel.x, 0, relVel.z).length();
  const vRel = Math.max(rawRelSpeed, PHYSICS_CONSTANTS.MIN_BUMP_REL_SPEED);

  const bIsJuggernaut =
    massB - massA >= PHYSICS_CONSTANTS.JUGGERNAUT_MASS_DIFF_THRESHOLD ||
    massB > massA * PHYSICS_CONSTANTS.JUGGERNAUT_RATIO_THRESHOLD;
  const aIsJuggernaut =
    massA - massB >= PHYSICS_CONSTANTS.JUGGERNAUT_MASS_DIFF_THRESHOLD ||
    massA > massB * PHYSICS_CONSTANTS.JUGGERNAUT_RATIO_THRESHOLD;

  kartA.collisionCooldown = 0.52;
  kartB.collisionCooldown = 0.52;

  if (bIsJuggernaut || aIsJuggernaut) {
    const light = bIsJuggernaut ? kartA : kartB;
    const heavy = bIsJuggernaut ? kartB : kartA;
    // Lateral direction pointing from heavy kart toward light kart (left or right)
    const sideDirHeavyToLight = bIsJuggernaut
      ? lateralBA
      : lateralBA.scale(-1);
    const normalHeavyToLight = bIsJuggernaut ? nBA : nBA.scale(-1);
    const alphaLight = bIsJuggernaut ? alphaA : alphaB;
    const alphaHeavy = bIsJuggernaut ? alphaB : alphaA;

    const heavyInitialSpeed = Math.max(1, heavy.velocity.length());
    // Perturb heavy Juggernaut by at most ~1.4% (strictly < 3% per AGENTS.md)
    const heavySideNudge = Math.min(0.45, heavyInitialSpeed * 0.014);
    heavy.knockVelocity = sideDirHeavyToLight.scale(-heavySideNudge);
    heavy.forwardSpeed *= 0.997;
    const heavySpeedDeltaPct = 1.4;

    // Scale sideways knockback smoothly by how much bigger the heavy kart is than the light kart:
    // - 1-tier gap (e.g. 120 vs 85, ratio ~1.41): moderate sideways knock (~13 u/s)
    // - 2-tier gap (e.g. 220 vs 120 or 120 vs 50, ratio ~1.83-2.4): strong sideways knock (~18-21 u/s)
    // - 3-tier gap (e.g. 220 vs 50, ratio 4.4, or Nova 9999): massive sideways knock (~26-30 u/s)
    const rawMassRatio = heavy.effectiveMass / Math.max(1, light.effectiveMass);
    const massRatio = Math.min(4.5, Math.max(1.1, rawMassRatio));

    // Check if the lighter kart crashed into the heavier kart (recoil effect)
    const lightToHeavyDir = normalHeavyToLight.scale(-1);
    const lightClosingIntoHeavy = Math.max(
      0,
      Vector3.Dot(light.velocity.subtract(heavy.velocity), lightToHeavyDir)
    );
    const recoilBonus = Math.min(7.5, lightClosingIntoHeavy * 0.35);

    const baseLateralKnock =
      (8.5 + (massRatio - 1.0) * 4.2) *
      alphaLight *
      Math.min(1.5, vRel / PHYSICS_CONSTANTS.MIN_BUMP_REL_SPEED);

    const lateralKnockSpeed = Math.min(
      PHYSICS_CONSTANTS.MAX_KNOCKBACK_SPEED,
      Math.max(9.5, baseLateralKnock + recoilBonus)
    );

    light.knockVelocity = sideDirHeavyToLight.scale(lateralKnockSpeed);
    // Keep forward speed smooth so the kart gets knocked to the side without stalling or spinning out
    light.forwardSpeed *= lightClosingIntoHeavy > 6.0 ? 0.93 : 0.985;
    light.velocity = light.forwardVector
      .scale(light.forwardSpeed)
      .add(light.knockVelocity.scale(0.35));

    if (massRatio >= 2.2 || heavy.novaOverdriveTimer > 0) {
      light.verticalVelocity = Math.max(
        light.verticalVelocity,
        heavy.novaOverdriveTimer > 0 ? 3.2 : PHYSICS_CONSTANTS.LIGHT_HOP_VY
      );
    }
    light.wobbleTimer = Math.max(
      light.wobbleTimer,
      PHYSICS_CONSTANTS.WOBBLE_STUN_SEC
    );
    light.cameraShakeTimer = Math.max(light.cameraShakeTimer, 0.22);
    heavy.cameraShakeTimer = Math.max(heavy.cameraShakeTimer, 0.08);

    return {
      timestamp: Date.now(),
      heavyRacerId: heavy.racerId,
      lightRacerId: light.racerId,
      heavyName: heavy.name,
      lightName: light.name,
      heavyMass: heavy.effectiveMass,
      lightMass: light.effectiveMass,
      alphaLight: Number(alphaLight.toFixed(4)),
      alphaHeavy: Number(alphaHeavy.toFixed(4)),
      heavySpeedDeltaPct: Number(heavySpeedDeltaPct.toFixed(2)),
      lightKnockbackSpeed: Number(lateralKnockSpeed.toFixed(2)),
      isJuggernautOverride: true,
    };
  }

  // Equal/similar mass mutual left/right bump (alphaA ≈ 0.5, alphaB ≈ 0.5)
  const mutualSideSpeed = Math.min(18.0, Math.max(11.0, 0.55 * vRel));
  kartA.knockVelocity = lateralBA.scale(mutualSideSpeed * alphaA);
  kartB.knockVelocity = lateralBA.scale(-mutualSideSpeed * alphaB);
  kartA.cameraShakeTimer = Math.max(kartA.cameraShakeTimer, 0.14);
  kartB.cameraShakeTimer = Math.max(kartB.cameraShakeTimer, 0.14);

  return {
    timestamp: Date.now(),
    heavyRacerId: massB >= massA ? kartB.racerId : kartA.racerId,
    lightRacerId: massB >= massA ? kartA.racerId : kartB.racerId,
    heavyName: massB >= massA ? kartB.name : kartA.name,
    lightName: massB >= massA ? kartA.name : kartB.name,
    heavyMass: Math.max(massA, massB),
    lightMass: Math.min(massA, massB),
    alphaLight: Number(Math.max(alphaA, alphaB).toFixed(4)),
    alphaHeavy: Number(Math.min(alphaA, alphaB).toFixed(4)),
    heavySpeedDeltaPct: 8.5,
    lightKnockbackSpeed: Number((mutualSideSpeed * Math.max(alphaA, alphaB)).toFixed(2)),
    isJuggernautOverride: false,
  };
}
