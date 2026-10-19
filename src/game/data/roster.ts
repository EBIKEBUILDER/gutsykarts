import {
  CharacterProfile,
  KartChassisConfig,
  PowerUpMetadata,
  PowerUpType,
  ResolvedRacerStats,
} from "@/src/types/game";

export const ROSTER_BALANCE_PASS = "Pass #18";
export const BUILD_INFO_STAMP = `Build ${ROSTER_BALANCE_PASS} (${
  process.env.NEXT_PUBLIC_BUILD_SHA || "1b96873"
}) • Built ${
  process.env.NEXT_PUBLIC_BUILD_TIME || "Oct 19, 2026, 11:00 AM CDT"
}`;

export const KART_CHASSIS_CATALOG: Record<string, KartChassisConfig> = {
  behemoth_bruiser: {
    id: "behemoth_bruiser",
    name: "Behemoth Bruiser",
    tagline: "Spiked crimson-and-black long-wheelbase juggernaut with oversized dual rear tires.",
    bodyStyle: "TANK",
    primaryColor: "#dc2626",
    secondaryColor: "#18181b",
    accentColor: "#f59e0b",
    wheelScale: 1.18,
    chassisWidth: 1.86,
    chassisLength: 4.35,
    dualRearTires: true,
    spikedBumper: true,
    statModifiers: {
      massDelta: 0,
      topSpeedDelta: 0,
      accelerationDelta: 0,
      handlingDelta: 0,
      driftGripDelta: 0,
    },
  },
  apex_striker: {
    id: "apex_striker",
    name: "Apex Striker",
    tagline: "Cobalt-blue and white elongated open-wheel formula kart with multi-plane wing spoiler.",
    bodyStyle: "FORMULA",
    primaryColor: "#2563eb",
    secondaryColor: "#f8fafc",
    accentColor: "#ef4444",
    wheelScale: 0.98,
    chassisWidth: 1.62,
    chassisLength: 4.05,
    dualRearTires: false,
    spikedBumper: false,
    statModifiers: {
      massDelta: 0,
      topSpeedDelta: 0,
      accelerationDelta: 0,
      handlingDelta: 0,
      driftGripDelta: 0,
    },
  },
  phantom_coupe: {
    id: "phantom_coupe",
    name: "Phantom Coupe",
    tagline: "Sleek magenta-and-silver long-nose aerodynamic coupe with swept tailfins.",
    bodyStyle: "COUPE",
    primaryColor: "#d946ef",
    secondaryColor: "#e2e8f0",
    accentColor: "#8b5cf6",
    wheelScale: 0.95,
    chassisWidth: 1.58,
    chassisLength: 4.1,
    dualRearTires: false,
    spikedBumper: false,
    statModifiers: {
      massDelta: 0,
      topSpeedDelta: 0,
      accelerationDelta: 0,
      handlingDelta: 0,
      driftGripDelta: 0,
    },
  },
  bumblebee_buggy: {
    id: "bumblebee_buggy",
    name: "Bumblebee Buggy",
    tagline: "Nimble bright-yellow and teal tubular roll-cage kart with long-travel suspension.",
    bodyStyle: "BUGGY",
    primaryColor: "#facc15",
    secondaryColor: "#0d9488",
    accentColor: "#f97316",
    wheelScale: 0.92,
    chassisWidth: 1.5,
    chassisLength: 3.75,
    dualRearTires: false,
    spikedBumper: false,
    statModifiers: {
      massDelta: 0,
      topSpeedDelta: 0,
      accelerationDelta: 0,
      handlingDelta: 0,
      driftGripDelta: 0,
    },
  },
  culdesac_interceptor: {
    id: "culdesac_interceptor",
    name: "Cul-de-Sac Interceptor",
    tagline: "High-velocity street-tuned twin-turbo long-chassis racer (+2.5 Top Speed, -10 Mass).",
    bodyStyle: "FORMULA",
    primaryColor: "#10b981",
    secondaryColor: "#0f172a",
    accentColor: "#38bdf8",
    wheelScale: 1.0,
    chassisWidth: 1.64,
    chassisLength: 4.15,
    dualRearTires: false,
    spikedBumper: false,
    statModifiers: {
      massDelta: -10,
      topSpeedDelta: 2.5,
      accelerationDelta: 1.5,
      handlingDelta: 0.12,
      driftGripDelta: 0.02,
    },
  },
  iron_bulldog: {
    id: "iron_bulldog",
    name: "Iron Bulldog Rig",
    tagline: "Reinforced suburban heavy-duty rammer (+30 Mass, +1.5 Top Speed).",
    bodyStyle: "TANK",
    primaryColor: "#ea580c",
    secondaryColor: "#27272a",
    accentColor: "#fde047",
    wheelScale: 1.15,
    chassisWidth: 1.82,
    chassisLength: 4.25,
    dualRearTires: true,
    spikedBumper: true,
    statModifiers: {
      massDelta: 30,
      topSpeedDelta: 1.5,
      accelerationDelta: -2.0,
      handlingDelta: -0.15,
      driftGripDelta: -0.02,
    },
  },
};

export const CHARACTER_ROSTER: CharacterProfile[] = [
  {
    id: "rex_ironclad",
    name: "Rex Ironclad",
    title: "Super Heavy Juggernaut",
    archetypeLabel: "Unbudgeable Heavyweight",
    archetypeClass: "SUPER_HEAVY",
    bio: "Neighborhood scrapyard titan. At 220 kg, Rex shrugs off lightweight rammers like mosquitoes and dominates straightaways.",
    mass: 220,
    topSpeed: 47.33,
    offRoadTopSpeed: 26.03,
    acceleration: 23.52,
    handling: 1.77,
    driftGrip: 0.76,
    miniTurboDurationBonus: 0.02,
    miniTurboDurationSec: 0.42,
    baseDriftSlipAngleDeg: 17.5,
    driftSteerInRatio: 0.28,
    driftSteerOutRatio: 0.52,
    defaultKartId: "behemoth_bruiser",
    signatureKartId: "behemoth_bruiser",
    availableKartIds: [
      "behemoth_bruiser",
      "iron_bulldog",
      "apex_striker",
      "culdesac_interceptor",
    ],
    unlockedKartIds: [
      "behemoth_bruiser",
      "iron_bulldog",
      "apex_striker",
      "culdesac_interceptor",
    ],
    colors: {
      suit: "#991b1b",
      helmet: "#18181b",
      visor: "#f59e0b",
      skin: "#f1c27d",
      badge: "#ef4444",
    },
  },
  {
    id: "aero_vance",
    name: "Aero Vance",
    title: "Balanced All-Rounder",
    archetypeLabel: "All-Round Grand Prix Ace",
    archetypeClass: "BALANCED",
    bio: "Gutsy Avenue's reigning soapbox champion. Crisp apex lock, dependable acceleration, and rock-solid balance on any corner.",
    mass: 120,
    topSpeed: 45.78,
    offRoadTopSpeed: 25.18,
    acceleration: 27.6,
    handling: 2.0,
    driftGrip: 0.80,
    miniTurboDurationBonus: 0.06,
    miniTurboDurationSec: 0.46,
    baseDriftSlipAngleDeg: 15.0,
    driftSteerInRatio: 0.28,
    driftSteerOutRatio: 0.55,
    defaultKartId: "apex_striker",
    signatureKartId: "apex_striker",
    availableKartIds: [
      "apex_striker",
      "culdesac_interceptor",
      "phantom_coupe",
      "behemoth_bruiser",
    ],
    unlockedKartIds: [
      "apex_striker",
      "culdesac_interceptor",
      "phantom_coupe",
      "behemoth_bruiser",
    ],
    colors: {
      suit: "#1d4ed8",
      helmet: "#f8fafc",
      visor: "#ef4444",
      skin: "#ffdbac",
      badge: "#3b82f6",
    },
  },
  {
    id: "nyx_drift",
    name: "Nyx Veloce",
    title: "Technical Cruiser",
    archetypeLabel: "Precision Drift Specialist",
    archetypeClass: "TECHNICAL",
    bio: "Midnight arcade prodigy with enhanced counter-steer control and a +14% Mini-Turbo duration bonus out of every hairpin.",
    mass: 85,
    topSpeed: 44.3,
    offRoadTopSpeed: 24.4,
    acceleration: 31.5,
    handling: 2.1,
    driftGrip: 0.83,
    miniTurboDurationBonus: 0.14,
    miniTurboDurationSec: 0.51,
    baseDriftSlipAngleDeg: 13.5,
    driftSteerInRatio: 0.27,
    driftSteerOutRatio: 0.57,
    defaultKartId: "phantom_coupe",
    signatureKartId: "phantom_coupe",
    availableKartIds: [
      "phantom_coupe",
      "culdesac_interceptor",
      "bumblebee_buggy",
      "apex_striker",
    ],
    unlockedKartIds: [
      "phantom_coupe",
      "culdesac_interceptor",
      "bumblebee_buggy",
      "apex_striker",
    ],
    colors: {
      suit: "#a21caf",
      helmet: "#e2e8f0",
      visor: "#7c3aed",
      skin: "#f5cba7",
      badge: "#d946ef",
    },
  },
  {
    id: "pip_spark",
    name: "Pip Spark",
    title: "Featherweight Accelerator",
    archetypeLabel: "Pocket Rocket Sprinter",
    archetypeClass: "FEATHERWEIGHT",
    bio: "Gadget-obsessed kid who hits top speed in a heartbeat and charges Ultra Mini-Turbos fastest—just don't get body-checked by Rex!",
    mass: 50,
    topSpeed: 43.71,
    offRoadTopSpeed: 24.05,
    acceleration: 35.45,
    handling: 2.15,
    driftGrip: 0.82,
    miniTurboDurationBonus: 0.08,
    miniTurboDurationSec: 0.49,
    baseDriftSlipAngleDeg: 12.5,
    driftSteerInRatio: 0.27,
    driftSteerOutRatio: 0.58,
    defaultKartId: "bumblebee_buggy",
    signatureKartId: "bumblebee_buggy",
    availableKartIds: [
      "bumblebee_buggy",
      "phantom_coupe",
      "culdesac_interceptor",
      "iron_bulldog",
    ],
    unlockedKartIds: [
      "bumblebee_buggy",
      "phantom_coupe",
      "culdesac_interceptor",
      "iron_bulldog",
    ],
    colors: {
      suit: "#eab308",
      helmet: "#0d9488",
      visor: "#38bdf8",
      skin: "#ffdbac",
      badge: "#facc15",
    },
  },
];

export const POWER_UP_CATALOG: Record<PowerUpType, PowerUpMetadata> = {
  NITRO_CORE: {
    id: "NITRO_CORE",
    name: "Nitro Core",
    shortLabel: "NITRO",
    description:
      "+45% top speed burst for 2.0s. Ignores off-road grass/dirt slowdown for aggressive corner cuts!",
    color: "#f97316",
    accentColor: "#22d3ee",
  },
  TRIPLE_NITRO: {
    id: "TRIPLE_NITRO",
    name: "Triple Nitro Cylinders",
    shortLabel: "3x NITRO",
    description:
      "Three high-pressure Nitro charges (+45% speed burst each). Chain off-road grass shortcuts or multi-stage straightaway surges!",
    color: "#fb923c",
    accentColor: "#38bdf8",
  },
  GOLDEN_OVERCLOCK: {
    id: "GOLDEN_OVERCLOCK",
    name: "Golden Overclock Core",
    shortLabel: "OVERCLOCK",
    description:
      "7.5s of unlimited rapid-fire Nitro surges (+45% top speed & off-road immunity) on every Use Item press without consuming charges!",
    color: "#f59e0b",
    accentColor: "#fef08a",
  },
  PULSE_SEEKER: {
    id: "PULSE_SEEKER",
    name: "Pulse Seeker",
    shortLabel: "SEEKER",
    description:
      "Homing crimson octahedron drone (65 u/s) that locks onto the spline and seeks the next racer ahead.",
    color: "#ef4444",
    accentColor: "#fca5a5",
  },
  TRIPLE_SEEKER: {
    id: "TRIPLE_SEEKER",
    name: "Tri-Seeker Swarm",
    shortLabel: "3x SEEKERS",
    description:
      "3 orbiting crimson homing drones that wipe out rivals on contact, block incoming fire, or launch one-by-one to hunt racers ahead!",
    color: "#dc2626",
    accentColor: "#fbbf24",
  },
  RICOCHET_DISC: {
    id: "RICOCHET_DISC",
    name: "Ricochet Disc",
    shortLabel: "DISC",
    description:
      "High-velocity emerald energy disc (70 u/s) that bounces off track boundary walls up to 4 times.",
    color: "#10b981",
    accentColor: "#6ee7b7",
  },
  ORBITAL_SHIELD: {
    id: "ORBITAL_SHIELD",
    name: "Tri-Drone Orbit Shield",
    shortLabel: "3x DRONES",
    description:
      "3 orbiting emerald energy orbs that immediately spin out rivals on contact, block incoming attacks, or fire forward as Ricochet Discs!",
    color: "#14b8a6",
    accentColor: "#67e8f9",
  },
  CRYO_MINE: {
    id: "CRYO_MINE",
    name: "Cryo Mine",
    shortLabel: "MINE",
    description:
      "Spiked hazard emitter dropped behind your kart. Triggers a 720° spin-out and 80% speed drop on contact.",
    color: "#eab308",
    accentColor: "#18181b",
  },
  TRIPLE_CRYO_MINE: {
    id: "TRIPLE_CRYO_MINE",
    name: "Tri-Cryo Mine Cluster",
    shortLabel: "3x MINES",
    description:
      "Three trailing Cryo Mines behind your bumper that block rear-approaching attacks or drop one-by-one onto the racing line!",
    color: "#ca8a04",
    accentColor: "#fde047",
  },
  GLITCH_PRISM: {
    id: "GLITCH_PRISM",
    name: "Prank Glitch Prism",
    shortLabel: "DECOY BOX",
    description:
      "Drops a deceptive counterfeit Item Prism behind your kart that detonates a 720° glitch spin-out when collected!",
    color: "#f43f5e",
    accentColor: "#e879f9",
  },
  OIL_SQUALL: {
    id: "OIL_SQUALL",
    name: "Slick-Cloud Discharger",
    shortLabel: "OIL SQUALL",
    description:
      "Blasts all racers ahead with an iridescent oil-static squall for 5.0s, splattering their visors and cutting lateral tire grip by 20%!",
    color: "#6366f1",
    accentColor: "#a855f7",
  },
  PHASE_CLOAK: {
    id: "PHASE_CLOAK",
    name: "Phantom Phase Cloak",
    shortLabel: "PHASE CLOAK",
    description:
      "4.5s of intangible ghost cloaking (immune to projectiles, mines, off-road drag & Juggernaut shoves) + steals a held item ahead!",
    color: "#818cf8",
    accentColor: "#e879f9",
  },
  EMP_SHOCKWAVE: {
    id: "EMP_SHOCKWAVE",
    name: "Ion Storm Shockwave",
    shortLabel: "ION ZAP",
    description:
      "Global electromagnetic storm that zaps all racers ahead, dropping their items and shrinking them to 72% size (-25% speed, 50% mass) for 4.5s!",
    color: "#38bdf8",
    accentColor: "#a855f7",
  },
  NOVA_OVERDRIVE: {
    id: "NOVA_OVERDRIVE",
    name: "Nova Overdrive",
    shortLabel: "NOVA CORE",
    description:
      "7.5s of golden rainbow invincibility, +35% speed, off-road immunity, and 9,999 kg Juggernaut ramming mass!",
    color: "#fde047",
    accentColor: "#ec4899",
  },
  WARP_AUTOPILOT: {
    id: "WARP_AUTOPILOT",
    name: "Hyper-Shuttle Autopilot",
    shortLabel: "SHUTTLE",
    description:
      "Transforms your kart into an aerodynamic 95 u/s autopilot shuttle for 6.0s that locks onto the track spline and bowls over rivals!",
    color: "#0ea5e9",
    accentColor: "#38bdf8",
  },
  LIL_SAUCER: {
    id: "LIL_SAUCER",
    name: "Lil' Saucer",
    shortLabel: "UFO ROCKET",
    description:
      "Quirky face-on-dome UFO rocket (88 u/s) that locks onto a random racer ahead of you and blasts them into orbit!",
    color: "#c084fc",
    accentColor: "#38bdf8",
  },
};

export function resolveRacerStats(
  characterId: string,
  kartId?: string
): ResolvedRacerStats {
  const character =
    CHARACTER_ROSTER.find((c) => c.id === characterId) ?? CHARACTER_ROSTER[0];
  const resolvedKartId = kartId ?? character.defaultKartId;
  const kart =
    KART_CHASSIS_CATALOG[resolvedKartId] ??
    KART_CHASSIS_CATALOG[character.defaultKartId];

  const baseMass = Math.max(25, character.mass + kart.statModifiers.massDelta);
  const topSpeed = Math.max(
    25,
    character.topSpeed + kart.statModifiers.topSpeedDelta
  );
  const offRoadTopSpeed = Number((topSpeed * 0.55).toFixed(1));
  const acceleration = Math.max(
    8,
    character.acceleration + kart.statModifiers.accelerationDelta
  );
  const handling = Math.max(
    1.2,
    Number((character.handling + kart.statModifiers.handlingDelta).toFixed(2))
  );
  const driftGrip = Math.min(
    0.97,
    Math.max(
      0.7,
      Number(
        (character.driftGrip + kart.statModifiers.driftGripDelta).toFixed(2)
      )
    )
  );

  const miniTurboDurationSec = Math.max(
    0.16,
    Number((character.miniTurboDurationSec ?? 0.45).toFixed(2))
  );
  const baseDriftSlipAngleDeg = Math.max(
    11,
    Math.min(
      23,
      Number(
        (
          (character.baseDriftSlipAngleDeg ?? 15.5) -
          kart.statModifiers.handlingDelta * 3.5
        ).toFixed(1)
      )
    )
  );
  const driftSteerInRatio = Math.max(
    0.22,
    Math.min(
      0.4,
      Number(
        (
          (character.driftSteerInRatio ?? 0.3) +
          kart.statModifiers.handlingDelta * 0.08
        ).toFixed(2)
      )
    )
  );
  const driftSteerOutRatio = Math.max(
    0.48,
    Math.min(
      0.62,
      Number(
        (
          (character.driftSteerOutRatio ?? 0.56) +
          kart.statModifiers.driftGripDelta * 0.15
        ).toFixed(2)
      )
    )
  );

  return {
    character,
    kart,
    baseMass,
    topSpeed,
    offRoadTopSpeed,
    acceleration,
    handling,
    driftGrip,
    miniTurboDurationBonus: character.miniTurboDurationBonus,
    miniTurboDurationSec,
    baseDriftSlipAngleDeg,
    driftSteerInRatio,
    driftSteerOutRatio,
  };
}
