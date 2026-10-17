"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/core/Culling/ray";
import {
  AiPathSample,
  CustomTrackDefinition,
  GrandPrixCupDefinition,
  ObstaclePrefabType,
  SceneryPrefabType,
} from "@/src/types/game";
import {
  buildProceduralTrack,
  computeTrackSplineSamples,
  createDefaultTrackDefinition,
  getOfficialDefaultTrack,
  isBuiltinCupId,
  parseImportedTrackOrCupJson,
  prepareCupsCatalogForRepoCommit,
  syncTracksideSceneryAndClearRoad,
} from "@/src/game/world/TrackBuilder";
import { globalAiBrain } from "@/src/game/ai/AiBrainTrainer";
import {
  Activity,
  ArrowLeft,
  ArrowUpDown,
  Box,
  Check,
  Compass,
  Download,
  Eye,
  Flame,
  FolderOpen,
  HardDriveDownload,
  Layers,
  Mountain,
  MousePointer,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Trees,
  Trophy,
  Undo2,
  Upload,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type EditorTool =
  | { kind: "SPLINE" }
  | { kind: "SPLINE_ELEVATION" }
  | { kind: "TERRAIN_RAISE" }
  | { kind: "TERRAIN_LOWER" }
  | { kind: "TERRAIN_FLATTEN" }
  | { kind: "ORBIT_CAM" }
  | { kind: "ERASER" }
  | { kind: "BOOST_PAD" }
  | { kind: "ITEM_ROW" }
  | { kind: "OBSTACLE"; prefab: ObstaclePrefabType }
  | { kind: "SCENERY"; prefab: SceneryPrefabType };

type ViewportLayout = "3D_ONLY" | "SPLIT_3D_2D" | "2D_ONLY";
type AiTraceColorMode = "SURFACE" | "SPEED" | "MINI_TURBO";

function getAiTraceSampleColors(
  s: AiPathSample,
  mode: AiTraceColorMode
): { hex: string; color4: Color4 } {
  if (s.combatDisrupted) {
    // Distinct translucent violet for item/combat recovery so it is never mistaken for a red track bottleneck
    return { hex: "#a78bfa", color4: new Color4(0.65, 0.55, 0.98, 0.7) };
  }
  if (mode === "SPEED") {
    if (s.speedRatio < 0.65) {
      return { hex: "#f43f5e", color4: new Color4(0.96, 0.25, 0.37, 1.0) }; // Red = Slow hairpin / scrub
    }
    if (s.speedRatio < 0.85) {
      return { hex: "#f97316", color4: new Color4(0.98, 0.45, 0.09, 1.0) }; // Orange = Accelerating
    }
    if (s.speedRatio < 0.98) {
      return { hex: "#eab308", color4: new Color4(0.92, 0.7, 0.03, 1.0) }; // Yellow = Cruising
    }
    if (s.speedRatio < 1.08) {
      return { hex: "#10b981", color4: new Color4(0.06, 0.73, 0.51, 1.0) }; // Emerald = Top Speed
    }
    return { hex: "#38bdf8", color4: new Color4(0.22, 0.74, 0.97, 1.0) }; // Electric Cyan = Boosted Overdrive
  }

  if (mode === "MINI_TURBO") {
    if (s.miniTurboTier === 3) {
      return { hex: "#d946ef", color4: new Color4(0.85, 0.27, 0.94, 1.0) }; // Tier 3 Ultra Purple
    }
    if (s.miniTurboTier === 2) {
      return { hex: "#f97316", color4: new Color4(0.98, 0.45, 0.09, 1.0) }; // Tier 2 Super Orange
    }
    if (s.miniTurboTier === 1) {
      return { hex: "#38bdf8", color4: new Color4(0.22, 0.74, 0.97, 1.0) }; // Tier 1 Electric Blue
    }
    if (s.driftState === "DRIFT_ACTIVE") {
      return { hex: "#fde047", color4: new Color4(0.99, 0.88, 0.28, 0.95) }; // Pre-spark Drift
    }
    if (s.boosting) {
      return { hex: "#4ade80", color4: new Color4(0.29, 0.87, 0.5, 1.0) }; // Active Boost Release
    }
    return { hex: "#64748b", color4: new Color4(0.39, 0.45, 0.55, 0.75) }; // Straightaway
  }

  // Default: "SURFACE"
  if (s.surface === "OFFROAD") {
    if (s.boosting) {
      return { hex: "#22d3ee", color4: new Color4(0.13, 0.83, 0.93, 1.0) }; // Cyan Boosted Cut
    }
    return { hex: "#f43f5e", color4: new Color4(0.96, 0.25, 0.37, 1.0) }; // Red Unboosted Off-Road
  }
  if (s.driftState === "DRIFT_ACTIVE") {
    return { hex: "#fbbf24", color4: new Color4(0.98, 0.75, 0.14, 1.0) }; // Amber Drifting
  }
  return { hex: "#34d399", color4: new Color4(0.2, 0.83, 0.6, 0.95) }; // Emerald On-Track
}

interface TrackEditorProps {
  trackDef: CustomTrackDefinition;
  onChangeTrackDef: (next: CustomTrackDefinition) => void;
  onBackToMenu: () => void;
  onStartRaceWithTrack: (trackOverride?: CustomTrackDefinition) => void;
  cupsCatalog?: GrandPrixCupDefinition[];
  activeCupId?: string;
  activeTrackIdx?: number;
  onSelectCupAndTrack?: (cupId: string, trackIdx: number) => void;
  onAddTrackToCup?: (cupId: string) => void;
  onAddCustomCup?: () => void;
  onUpdateCupMeta?: (
    cupId: string,
    patch: { name?: string; subtitle?: string; badgeColor?: string }
  ) => void;
  onDeleteCustomCup?: (cupId: string) => void;
  onDeleteTrackFromCup?: (cupId: string, trackIdx: number) => void;
  onResetTrackToOfficial?: (cupId: string, trackIdx: number) => void;
  onImportCupOrCatalog?: (
    result:
      | { kind: "CUP"; cup: GrandPrixCupDefinition }
      | { kind: "CATALOG"; cups: GrandPrixCupDefinition[] }
  ) => void;
  onCommitCatalogToRepoSuccess?: (
    committedCups: GrandPrixCupDefinition[]
  ) => void;
}

const OBSTACLE_LIBRARY: Array<{
  type: ObstaclePrefabType;
  name: string;
  desc: string;
  color: string;
}> = [
  {
    type: "JUMP_RAMP",
    name: "Stunt Jump Ramp",
    desc: "Launches karts into the air with +35% speed boost",
    color: "#06b6d4",
  },
  {
    type: "PYLON_CONE",
    name: "Traffic Pylon Cone",
    desc: "Bumps karts sideways & trims 15% speed",
    color: "#f97316",
  },
  {
    type: "OIL_SLICK",
    name: "Oil Slick Puddle",
    desc: "Causes karts to spin out when driven over",
    color: "#a855f7",
  },
  {
    type: "BARRIER_CRATE",
    name: "Hazard Barrier Crate",
    desc: "Heavy construction barrier that spins out karts",
    color: "#eab308",
  },
];

const SCENERY_LIBRARY: Array<{
  type: SceneryPrefabType;
  name: string;
  desc: string;
  color: string;
}> = [
  {
    type: "PINE_TREE",
    name: "Evergreen Pine Tree",
    desc: "Layered suburban pine tree",
    color: "#16a34a",
  },
  {
    type: "OAK_TREE",
    name: "Leafy Oak Tree",
    desc: "Rounded park canopy tree",
    color: "#22c55e",
  },
  {
    type: "BOULDER",
    name: "Granite Boulder",
    desc: "Low-poly rock outcropping",
    color: "#64748b",
  },
  {
    type: "SUBURBAN_HOUSE",
    name: "Suburban House",
    desc: "Gutsy Avenue home with glowing windows",
    color: "#f59e0b",
  },
  {
    type: "GRANDSTAND",
    name: "Spectator Grandstand",
    desc: "3-tier bleachers with canopy roof",
    color: "#3b82f6",
  },
  {
    type: "LAMP_POST",
    name: "Streetlight Post",
    desc: "Tall suburban lamp post",
    color: "#fde047",
  },
];

type ProceduralTrackArchetype =
  | "RANDOM"
  | "SWEEPER"
  | "SWITCHBACK"
  | "KIDNEY"
  | "CANYON"
  | "STADIUM";

const PROCEDURAL_ARCHETYPE_OPTIONS: Array<{
  id: ProceduralTrackArchetype;
  label: string;
}> = [
  { id: "RANDOM", label: "🎲 Surprise Me (Random)" },
  { id: "SWEEPER", label: "🏎️ Grand Prix Dogleg & Chicane" },
  { id: "SWITCHBACK", label: "🐍 Serpentine Touge Slalom" },
  { id: "KIDNEY", label: "🥨 Deep Boomerang / U-Valley" },
  { id: "CANYON", label: "⛰️ Tri-Lobe Clover Peninsula" },
  { id: "STADIUM", label: "🏟️ Twin-Hairpin Parallel Gauntlet" },
];

/**
 * Detects control nodes where the road/curb ribbon pinches or buckles at the inner seam
 * (only flags true inner-edge reversals/folds or acute single-node kinks > 96 deg).
 */
function detectBuckledControlNodes(
  pts: Array<{ x: number; y: number; z: number }>,
  roadHalfWidth: number,
  splineSamples: Array<{
    position: Vector3;
    tangent: Vector3;
    binormal: Vector3;
  }>
): Set<number> {
  const buckled = new Set<number>();
  const n = pts.length;
  if (n < 4) return buckled;

  const minSafeChord = Math.max(30, roadHalfWidth * 2.2);
  for (let i = 1; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const ux1 = curr.x - prev.x;
    const uz1 = curr.z - prev.z;
    const ux2 = next.x - curr.x;
    const uz2 = next.z - curr.z;
    const len1 = Math.hypot(ux1, uz1);
    const len2 = Math.hypot(ux2, uz2);
    if (len1 < 1 || len2 < 1) {
      buckled.add(i);
      continue;
    }
    const cosTurn = (ux1 * ux2 + uz1 * uz2) / (len1 * len2);
    // Single-node acute turn > ~96 deg or bunched chord with sharp bend causes inner curb folding
    if (
      cosTurn < -0.1 ||
      (Math.min(len1, len2) < minSafeChord && cosTurn < 0.45)
    ) {
      buckled.add(i);
    }
  }

  // Exact differential-geometry inner-curb ribbon fold check along sampled spline
  const curbOffset = roadHalfWidth + 1.8;
  const sCount = splineSamples.length;
  for (let k = 0; k < sCount; k++) {
    const s0 = splineSamples[k];
    const s1 = splineSamples[(k + 1) % sCount];
    const ds = Math.hypot(
      s1.position.x - s0.position.x,
      s1.position.z - s0.position.z
    );
    if (ds < 0.05) continue;

    const l0x = s0.position.x - s0.binormal.x * curbOffset;
    const l0z = s0.position.z - s0.binormal.z * curbOffset;
    const l1x = s1.position.x - s1.binormal.x * curbOffset;
    const l1z = s1.position.z - s1.binormal.z * curbOffset;

    const r0x = s0.position.x + s0.binormal.x * curbOffset;
    const r0z = s0.position.z + s0.binormal.z * curbOffset;
    const r1x = s1.position.x + s1.binormal.x * curbOffset;
    const r1z = s1.position.z + s1.binormal.z * curbOffset;

    const ratioL =
      ((l1x - l0x) * s0.tangent.x + (l1z - l0z) * s0.tangent.z) / ds;
    const ratioR =
      ((r1x - r0x) * s0.tangent.x + (r1z - r0z) * s0.tangent.z) / ds;

    if (Math.min(ratioL, ratioR) < 0.08) {
      // Map pinched ribbon sample to nearest movable control node (idx >= 1)
      let bestIdx = -1;
      let bestDist = 64;
      for (let i = 1; i < n; i++) {
        const d = Math.hypot(
          pts[i].x - s0.position.x,
          pts[i].z - s0.position.z
        );
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 1) {
        buckled.add(bestIdx);
      }
    }
  }

  return buckled;
}

/**
 * Local Corner-Shoulder Beveling Solver:
 * Eliminates inner-seam curb buckling by inserting local entry/exit shoulder points right at sharp corners
 * without shrinking or circularizing the overall track geometry.
 */
function unbuckleAndRefineControlPoints(
  rawPts: Array<{ x: number; y: number; z: number }>,
  roadHalfWidth: number
): {
  pts: Array<{ x: number; y: number; z: number }>;
  subdividedCount: number;
  relaxedCount: number;
} {
  let pts = rawPts.map((p) => ({ ...p }));
  let subdividedCount = 0;
  let relaxedCount = 0;

  if (pts.length < 4) {
    return { pts, subdividedCount, relaxedCount };
  }

  const targetShoulderDist = Math.max(38, roadHalfWidth * 2.8);

  for (let pass = 0; pass < 3; pass++) {
    // Keep P0 anchored at (0,0,0) and P1 aligned along the +Z start/finish straight
    pts[0] = { x: 0, y: 0, z: 0 };
    if (pts.length > 1) {
      pts[1] = {
        x: 0,
        y: Number(Math.max(0, Math.min(2.0, pts[1].y)).toFixed(1)),
        z: Number(Math.max(88, Math.min(130, pts[1].z)).toFixed(1)),
      };
    }

    // 1. Merge accidentally stacked control points (< 2.0 * roadHalfWidth apart)
    if (pts.length > 8) {
      const merged: typeof pts = [pts[0], pts[1]];
      let i = 2;
      while (i < pts.length) {
        if (i < pts.length - 1) {
          const d = Math.hypot(
            pts[i + 1].x - pts[i].x,
            pts[i + 1].z - pts[i].z
          );
          if (d < roadHalfWidth * 2.0 && merged.length + (pts.length - i) > 8) {
            merged.push({
              x: Number(((pts[i].x + pts[i + 1].x) * 0.5).toFixed(1)),
              y: Number(((pts[i].y + pts[i + 1].y) * 0.5).toFixed(1)),
              z: Number(((pts[i].z + pts[i + 1].z) * 0.5).toFixed(1)),
            });
            relaxedCount++;
            i += 2;
            continue;
          }
        }
        merged.push(pts[i]);
        i++;
      }
      pts = merged;
    }

    // 2. Local Corner-Shoulder Beveling: replace acute single-vertex corners with a wide-radius 2-point shoulder turn
    if (pts.length < 28) {
      const nextPts: typeof pts = [pts[0], pts[1]];
      const n = pts.length;
      for (let i = 2; i < n; i++) {
        const prev = nextPts[nextPts.length - 1];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        const ux1 = curr.x - prev.x;
        const uz1 = curr.z - prev.z;
        const ux2 = next.x - curr.x;
        const uz2 = next.z - curr.z;
        const len1 = Math.hypot(ux1, uz1);
        const len2 = Math.hypot(ux2, uz2);
        const cosTurn =
          len1 > 1 && len2 > 1 ? (ux1 * ux2 + uz1 * uz2) / (len1 * len2) : 1;

        // Only bevel genuinely sharp corners (> ~86 deg turn) where segments have room for local shoulders
        if (
          i < n - 1 &&
          cosTurn < 0.06 &&
          len1 > targetShoulderDist * 1.45 &&
          len2 > targetShoulderDist * 1.45 &&
          nextPts.length + (n - i) < 29
        ) {
          const dIn = Math.min(len1 * 0.32, targetShoulderDist);
          const dOut = Math.min(len2 * 0.32, targetShoulderDist);
          const dirInX = ux1 / len1;
          const dirInZ = uz1 / len1;
          const dirOutX = ux2 / len2;
          const dirOutZ = uz2 / len2;

          const shoulderIn = {
            x: Number((curr.x - dirInX * dIn + dirOutX * 4.5).toFixed(1)),
            y: Number((prev.y * 0.25 + curr.y * 0.75).toFixed(1)),
            z: Number((curr.z - dirInZ * dIn + dirOutZ * 4.5).toFixed(1)),
          };
          const shoulderOut = {
            x: Number((curr.x + dirOutX * dOut - dirInX * 4.5).toFixed(1)),
            y: Number((curr.y * 0.75 + next.y * 0.25).toFixed(1)),
            z: Number((curr.z + dirOutZ * dOut - dirInZ * 4.5).toFixed(1)),
          };
          nextPts.push(shoulderIn, shoulderOut);
          subdividedCount++;
        } else {
          nextPts.push(curr);
        }
      }
      pts = nextPts;
    }

    // 3. Strictly Local Relaxation ONLY on nodes that still fail the differential-geometry inner-curb fold check
    const sampled = computeTrackSplineSamples(pts, 18, []);
    const buckledSet = detectBuckledControlNodes(
      pts,
      roadHalfWidth,
      sampled.samples
    );
    if (buckledSet.size === 0) break;

    const n = pts.length;
    const relaxedPts = pts.map((p) => ({ ...p }));
    for (const bIdx of Array.from(buckledSet)) {
      if (bIdx < 2 || bIdx >= n) continue;
      const prev = pts[(bIdx - 1 + n) % n];
      const curr = pts[bIdx];
      const next = pts[(bIdx + 1) % n];
      const midX = (prev.x + next.x) * 0.5;
      const midZ = (prev.z + next.z) * 0.5;
      relaxedPts[bIdx].x = Number((curr.x * 0.72 + midX * 0.28).toFixed(1));
      relaxedPts[bIdx].z = Number((curr.z * 0.72 + midZ * 0.28).toFixed(1));
      relaxedCount++;
    }
    pts = relaxedPts;
  }

  return { pts, subdividedCount, relaxedCount };
}

/**
 * Generates a large-scale (1,800m - 2,800m), wildly varied multi-sector circuit spline
 * using 5 distinct geometric topologies + local corner-shoulder beveling so shapes stay dramatic and buckle-free.
 */
function generateProceduralCircuitControlPoints(
  requestedArchetype: ProceduralTrackArchetype,
  seed: number,
  currentRoadHalfWidth: number
): {
  resolvedArchetype: Exclude<ProceduralTrackArchetype, "RANDOM">;
  archetypeTitle: string;
  controlPoints: Array<{ x: number; y: number; z: number }>;
  roadHalfWidth: number;
  terrainHillScale: number;
} {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const randRange = (min: number, max: number) => min + rand() * (max - min);

  const concreteArchetypes: Array<Exclude<ProceduralTrackArchetype, "RANDOM">> =
    ["SWEEPER", "SWITCHBACK", "KIDNEY", "CANYON", "STADIUM"];
  const resolvedArchetype: Exclude<ProceduralTrackArchetype, "RANDOM"> =
    requestedArchetype === "RANDOM"
      ? concreteArchetypes[Math.floor(rand() * concreteArchetypes.length)]
      : requestedArchetype;

  const archetypeTitleMap: Record<
    Exclude<ProceduralTrackArchetype, "RANDOM">,
    string
  > = {
    SWEEPER: "Grand Prix Dogleg & Chicane",
    SWITCHBACK: "Serpentine Touge Slalom",
    KIDNEY: "Deep Boomerang U-Valley",
    CANYON: "Tri-Lobe Clover Peninsula",
    STADIUM: "Twin-Hairpin Parallel Gauntlet",
  };

  const roadHalfWidth =
    requestedArchetype === "RANDOM"
      ? Number(randRange(13.0, 15.0).toFixed(1))
      : currentRoadHalfWidth;

  // Large-scale world stretch factors so every roll has distinct proportions (spanning 450m - 750m)
  const scaleX = randRange(0.92, 1.24);
  const scaleZ = randRange(0.92, 1.24);
  const pt = (x: number, y: number, z: number) => ({
    x: Number((x * scaleX + randRange(-14, 14)).toFixed(1)),
    y: Number(Math.max(0, y + randRange(-0.8, 1.2)).toFixed(1)),
    z: Number((z * scaleZ + randRange(-14, 14)).toFixed(1)),
  });

  const rawPts: Array<{ x: number; y: number; z: number }> = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1.0, z: Math.round(randRange(96, 118)) },
  ];

  if (resolvedArchetype === "SWEEPER") {
    // 1. GRAND PRIX DOGLEG & CHICANE: Massive north straight -> 90-deg East Dogleg -> fast diagonal backstretch -> infield chicane -> south bowl
    rawPts.push(
      pt(12, 5.5, 360),
      pt(95, 10.5, 445),
      pt(275, 12.5, 430),
      pt(330, 9.0, 295),
      pt(535, 11.0, 285),
      pt(565, 7.5, 125),
      pt(395, 4.5, 10),
      pt(485, 6.5, -155),
      pt(340, 3.5, -210),
      pt(255, 2.0, -335),
      pt(85, 1.0, -310),
      pt(-35, 0.4, -195)
    );
  } else if (resolvedArchetype === "SWITCHBACK") {
    // 2. SERPENTINE TOUGE SLALOM: 3 deep alternating hairpin fingers cutting in and out across the mountain face
    rawPts.push(
      pt(35, 6.0, 355),
      pt(175, 12.0, 455),
      pt(445, 14.0, 435),
      pt(470, 11.5, 285),
      pt(195, 8.5, 235),
      pt(185, 6.5, 105),
      pt(545, 9.5, 125),
      pt(565, 7.0, -25),
      pt(225, 4.5, -65),
      pt(215, 3.0, -195),
      pt(495, 5.5, -230),
      pt(435, 3.5, -355),
      pt(145, 1.5, -335),
      pt(-28, 0.4, -200)
    );
  } else if (resolvedArchetype === "KIDNEY") {
    // 3. DEEP BOOMERANG / U-VALLEY: Shoots far north, dives deep into a central canyon down to Z=-55, climbs back to a high east wing
    rawPts.push(
      pt(20, 6.5, 385),
      pt(145, 11.5, 465),
      pt(255, 9.5, 385),
      pt(210, 4.5, 130),
      pt(245, 2.5, -55),
      pt(365, 3.5, -45),
      pt(385, 8.0, 185),
      pt(435, 13.0, 415),
      pt(565, 11.5, 375),
      pt(585, 6.5, 95),
      pt(525, 3.5, -205),
      pt(345, 2.0, -335),
      pt(105, 1.0, -295),
      pt(-25, 0.4, -185)
    );
  } else if (resolvedArchetype === "CANYON") {
    // 4. TRI-LOBE CLOVER PENINSULA: Three giant outer peninsulas (North Mesa, Far-East Cliff, Deep South Gorge) with two narrow pinch bays
    rawPts.push(
      pt(-45, 7.5, 330),
      pt(95, 13.5, 475),
      pt(275, 14.5, 420),
      pt(215, 6.5, 185),
      pt(485, 10.5, 285),
      pt(605, 12.5, 135),
      pt(545, 8.0, -55),
      pt(265, 4.0, -90),
      pt(445, 6.5, -265),
      pt(295, 3.5, -395),
      pt(80, 1.5, -345),
      pt(-35, 0.5, -205)
    );
  } else {
    // 5. STADIUM: TWIN-HAIRPIN PARALLEL GAUNTLET: Long parallel drag straights connected by 180-deg turnarounds + diagonal stadium chicane
    rawPts.push(
      pt(8, 3.5, 435),
      pt(155, 5.5, 460),
      pt(165, 2.5, 95),
      pt(315, 2.5, 85),
      pt(335, 6.5, 430),
      pt(525, 7.5, 415),
      pt(565, 4.5, 115),
      pt(515, 2.5, -215),
      pt(310, 3.5, -180),
      pt(215, 1.8, -320),
      pt(55, 0.8, -280),
      pt(-22, 0.3, -175)
    );
  }

  // Final point approaches P0(0,0,0) smoothly from -Z
  rawPts.push({
    x: Number(randRange(-9, -3).toFixed(1)),
    y: 0,
    z: Number(randRange(-78, -62).toFixed(1)),
  });

  const { pts: refinedPts } = unbuckleAndRefineControlPoints(
    rawPts,
    roadHalfWidth
  );

  const terrainHillScale =
    resolvedArchetype === "CANYON"
      ? 1.35
      : resolvedArchetype === "STADIUM"
      ? 0.85
      : 1.1;

  return {
    resolvedArchetype,
    archetypeTitle: archetypeTitleMap[resolvedArchetype],
    controlPoints: refinedPts,
    roadHalfWidth,
    terrainHillScale,
  };
}

export const TrackEditor: React.FC<TrackEditorProps> = ({
  trackDef: initialTrackDef,
  onChangeTrackDef,
  onBackToMenu,
  onStartRaceWithTrack,
  cupsCatalog = [],
  activeCupId = "cul_de_sac_cup",
  activeTrackIdx = 0,
  onSelectCupAndTrack,
  onAddTrackToCup,
  onAddCustomCup,
  onUpdateCupMeta,
  onDeleteCustomCup,
  onDeleteTrackFromCup,
  onResetTrackToOfficial,
  onImportCupOrCatalog,
  onCommitCatalogToRepoSuccess,
}) => {
  // Default to FULL 3D VIEW ("3D_ONLY") per user specification
  const [viewportLayout, setViewportLayout] =
    useState<ViewportLayout>("3D_ONLY");
  const [activeTool, setActiveTool] = useState<EditorTool>({ kind: "SPLINE" });
  const [selectedControlIdx, setSelectedControlIdx] = useState<number>(0);
  const [prefabScale, setPrefabScale] = useState<number>(1.0);
  const [brushRadius, setBrushRadius] = useState<number>(58);
  const [brushStrength, setBrushStrength] = useState<number>(8.5);
  const [showAiTraces, setShowAiTraces] = useState<boolean>(true);
  const [traceColorMode, setTraceColorMode] =
    useState<AiTraceColorMode>("SURFACE");
  const [traceTick, setTraceTick] = useState<number>(0);
  const [proceduralArchetype, setProceduralArchetype] =
    useState<ProceduralTrackArchetype>("RANDOM");
  const proceduralGenCountRef = useRef<number>(1);

  // Explicit Local Working State, Dirty Flag, Undo/Redo Stacks & Manual Save
  const [trackDef, setTrackDef] =
    useState<CustomTrackDefinition>(initialTrackDef);
  const recordedAiTraces = useMemo(() => {
    void traceTick;
    globalAiBrain.hydrateFromStorage();
    return globalAiBrain.getTrackAiTraces(trackDef.id || trackDef.name);
  }, [trackDef.id, trackDef.name, traceTick]);

  // Analyze recorded AI traces to map unboosted off-road overshoots or sharp corner deceleration to the nearest spline control nodes
  const bottleneckNodeMap = useMemo(() => {
    const map = new Map<
      number,
      { hits: number; dxSum: number; dzSum: number }
    >();
    const pts = trackDef.controlPoints;
    if (pts.length === 0 || recordedAiTraces.length === 0) return map;

    for (const r of recordedAiTraces) {
      const samples = r.pathSamples;
      let combatCooldown = 0;
      for (let sIdx = 12; sIdx < samples.length; sIdx++) {
        const s = samples[sIdx];
        const prev = samples[sIdx - 1];
        const speedDrop = prev.speedRatio - s.speedRatio;
        // Ignore item spin-outs, EMP hits, and Juggernaut knockbacks (both explicit combatDisrupted flag and sudden >24% single-step speed drops)
        if (s.combatDisrupted || prev.combatDisrupted || speedDrop > 0.24) {
          combatCooldown = Math.max(combatCooldown, s.combatDisrupted ? 2 : 14);
        }
        if (combatCooldown > 0) {
          combatCooldown--;
          continue;
        }
        const isUnboostedOffRoad = s.surface === "OFFROAD" && !s.boosting;
        const isCornerSpeedScrub =
          s.speedRatio > 0.12 &&
          s.speedRatio < 0.58 &&
          speedDrop > 0.03 &&
          speedDrop <= 0.22;
        if (!isUnboostedOffRoad && !isCornerSpeedScrub) continue;

        let bestIdx = -1;
        let bestDist = 58;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.hypot(pts[i].x - s.x, pts[i].z - s.z);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          const entry = map.get(bestIdx) ?? { hits: 0, dxSum: 0, dzSum: 0 };
          entry.hits += isUnboostedOffRoad ? 2 : 1;
          entry.dxSum += s.x - pts[bestIdx].x;
          entry.dzSum += s.z - pts[bestIdx].z;
          map.set(bestIdx, entry);
        }
      }
    }
    // Keep nodes with >= 2 weighted scrub hits
    for (const [k, v] of Array.from(map.entries())) {
      if (v.hits < 2) {
        map.delete(k);
      }
    }
    return map;
  }, [trackDef.controlPoints, recordedAiTraces]);

  const [savedBaselineDef, setSavedBaselineDef] =
    useState<CustomTrackDefinition>(initialTrackDef);
  const [undoStack, setUndoStack] = useState<CustomTrackDefinition[]>([]);
  const [redoStack, setRedoStack] = useState<CustomTrackDefinition[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [isDevEnvironment, setIsDevEnvironment] = useState<boolean>(
    process.env.NODE_ENV !== "production"
  );
  const [isCommittingRepo, setIsCommittingRepo] = useState<boolean>(false);
  const [repoCommitNotice, setRepoCommitNotice] = useState<string | null>(null);
  const [ioStatusNotice, setIoStatusNotice] = useState<string | null>(null);
  const [showCupSettings, setShowCupSettings] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSwitchTarget, setPendingSwitchTarget] = useState<{
    cupId: string;
    trackIdx: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/dev/default-catalog")
      .then((res) => res.json())
      .then((data: { isDev?: boolean }) => {
        if (typeof data?.isDev === "boolean") {
          setIsDevEnvironment(data.isDev);
        }
      })
      .catch(() => {
        // Ignore offline/network errors
      });
  }, []);

  // Sync working state when user selects a different Cup/Track from the catalog
  useEffect(() => {
    setTrackDef(initialTrackDef);
    setSavedBaselineDef(initialTrackDef);
    setUndoStack([]);
    setRedoStack([]);
    setIsDirty(false);
    setJustSaved(false);
    setSelectedControlIdx(0);
    setPendingSwitchTarget(null);
  }, [initialTrackDef]);

  // 2D Blueprint zoom & pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 110, y: 35 });
  const [draggingNodeIdx, setDraggingNodeIdx] = useState<number | null>(null);
  const [isPanning2D, setIsPanning2D] = useState<boolean>(false);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // 3D Babylon.js viewport refs
  const canvas3dRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const camera3dRef = useRef<ArcRotateCamera | null>(null);
  const trackDefRef = useRef<CustomTrackDefinition>(trackDef);
  trackDefRef.current = trackDef;
  const savedBaselineRef = useRef<CustomTrackDefinition>(savedBaselineDef);
  savedBaselineRef.current = savedBaselineDef;
  const activeToolRef = useRef<EditorTool>(activeTool);
  activeToolRef.current = activeTool;
  const brushRadiusRef = useRef<number>(brushRadius);
  brushRadiusRef.current = brushRadius;
  const brushStrengthRef = useRef<number>(brushStrength);
  brushStrengthRef.current = brushStrength;
  const prefabScaleRef = useRef<number>(prefabScale);
  prefabScaleRef.current = prefabScale;
  const selectedIdxRef = useRef<number>(selectedControlIdx);
  selectedIdxRef.current = selectedControlIdx;

  const flashIoNotice = (msg: string) => {
    setIoStatusNotice(msg);
    setTimeout(() => setIoStatusNotice(null), 3200);
  };

  // Push current state onto Undo stack before a discrete action or at the start of a drag
  const pushUndoSnapshot = () => {
    const snapshot = trackDefRef.current;
    setUndoStack((prev) => [...prev.slice(-39), snapshot]);
    setRedoStack([]);
  };

  // Mutate working track definition WITHOUT auto-saving to persistent storage
  const commitWorkingEdit = (
    next: CustomTrackDefinition,
    recordUndo = true
  ) => {
    if (recordUndo) {
      pushUndoSnapshot();
    }
    trackDefRef.current = next;
    setTrackDef(next);
    setIsDirty(true);
    setJustSaved(false);
  };

  const handleUndo = () => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousState = prevUndo[prevUndo.length - 1];
      const currentSnapshot = trackDefRef.current;
      setRedoStack((prevRedo) => [...prevRedo, currentSnapshot]);
      trackDefRef.current = previousState;
      setTrackDef(previousState);
      const stillDirty =
        JSON.stringify(previousState) !==
        JSON.stringify(savedBaselineRef.current);
      setIsDirty(stillDirty);
      return prevUndo.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextState = prevRedo[prevRedo.length - 1];
      const currentSnapshot = trackDefRef.current;
      setUndoStack((prevUndo) => [...prevUndo, currentSnapshot]);
      trackDefRef.current = nextState;
      setTrackDef(nextState);
      const stillDirty =
        JSON.stringify(nextState) !== JSON.stringify(savedBaselineRef.current);
      setIsDirty(stillDirty);
      return prevRedo.slice(0, -1);
    });
  };

  const handleSaveMap = () => {
    const current: CustomTrackDefinition = {
      ...trackDefRef.current,
      isUserModified: true,
      updatedAt: Date.now(),
    };
    trackDefRef.current = current;
    setTrackDef(current);
    onChangeTrackDef(current);
    setSavedBaselineDef(current);
    savedBaselineRef.current = current;
    setIsDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  const handleCommitCatalogToRepo = async () => {
    if (!isDevEnvironment || isCommittingRepo) return;
    setIsCommittingRepo(true);
    try {
      const current = trackDefRef.current;
      const updatedCatalog = cupsCatalog.map((cup) => {
        if (cup.id !== activeCupId) return cup;
        return {
          ...cup,
          tracks: cup.tracks.map((t, idx) =>
            idx === activeTrackIdx ? current : t
          ),
        };
      });

      const res = await fetch("/api/dev/default-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cups: updatedCatalog }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        trackCount?: number;
      };
      if (!res.ok || !data.ok) {
        flashIoNotice(data.error || "Failed to write defaultCups.json");
        return;
      }

      const cleanCatalog = prepareCupsCatalogForRepoCommit(updatedCatalog);
      const cleanTrack: CustomTrackDefinition = { ...current };
      delete cleanTrack.isUserModified;
      trackDefRef.current = cleanTrack;
      setTrackDef(cleanTrack);
      setSavedBaselineDef(cleanTrack);
      savedBaselineRef.current = cleanTrack;
      setIsDirty(false);
      onCommitCatalogToRepoSuccess?.(cleanCatalog);

      setRepoCommitNotice(
        `Committed ${data.trackCount ?? ""} tracks to src/game/world/defaultCups.json!`
      );
      setTimeout(() => setRepoCommitNotice(null), 3500);
    } catch {
      flashIoNotice("Could not reach /api/dev/default-catalog.");
    } finally {
      setIsCommittingRepo(false);
    }
  };

  const triggerJsonDownload = (filename: string, payload: unknown) => {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTrackJson = () => {
    const current = trackDefRef.current;
    const slug =
      current.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "custom-track";
    triggerJsonDownload(`${slug}.gutsytrack.json`, current);
    flashIoNotice(`Exported ${slug}.gutsytrack.json`);
  };

  const handleExportCupJson = () => {
    const cup =
      cupsCatalog.find((c) => c.id === activeCupId) ?? cupsCatalog[0];
    if (!cup) return;
    const current = trackDefRef.current;
    const cupWithCurrentTrack: GrandPrixCupDefinition = {
      ...cup,
      tracks: cup.tracks.map((t, idx) =>
        idx === activeTrackIdx ? current : t
      ),
    };
    const slug =
      cup.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "custom-cup";
    triggerJsonDownload(`${slug}.gutsycup.json`, cupWithCurrentTrack);
    flashIoNotice(`Exported ${slug}.gutsycup.json (${cupWithCurrentTrack.tracks.length} maps)`);
  };

  const buildFullCatalogExportPayload = () => {
    const current = trackDefRef.current;
    const updatedCatalog = cupsCatalog.map((cup) => {
      if (cup.id !== activeCupId) return cup;
      return {
        ...cup,
        tracks: cup.tracks.map((t, idx) =>
          idx === activeTrackIdx ? current : t
        ),
      };
    });
    const cleanCups = prepareCupsCatalogForRepoCommit(updatedCatalog);
    const totalTracks = cleanCups.reduce(
      (sum, c) => sum + (c.tracks?.length ?? 0),
      0
    );
    return {
      payload: {
        version: 1,
        updatedAt: Date.now(),
        cups: cleanCups,
      },
      cupCount: cleanCups.length,
      totalTracks,
    };
  };

  const handleExportAllMapsCatalogJson = () => {
    const { payload, cupCount, totalTracks } = buildFullCatalogExportPayload();
    triggerJsonDownload("defaultCups.json", payload);
    flashIoNotice(
      `Exported ALL ${totalTracks} maps (${cupCount} Cups) as defaultCups.json!`
    );
  };

  const handleCopyAllMapsCatalogJson = async () => {
    try {
      const { payload, cupCount, totalTracks } =
        buildFullCatalogExportPayload();
      // Keep only manual sceneryProps in clipboard copy so the JSON is ~12KB (never truncated in chat pastes); auto scenery regenerates from scenerySeed
      const compactPayload = {
        ...payload,
        cups: payload.cups.map((cup) => ({
          ...cup,
          tracks: cup.tracks.map((t) => ({
            ...t,
            sceneryProps: (t.sceneryProps ?? []).filter(
              (p) => p.isManual !== false
            ),
          })),
        })),
      };
      await navigator.clipboard.writeText(
        `${JSON.stringify(compactPayload, null, 2)}\n`
      );
      flashIoNotice(
        `Copied ALL ${totalTracks} maps (${cupCount} Cups) compact JSON to clipboard!`
      );
    } catch {
      flashIoNotice("Clipboard copy failed — use EXPORT ALL MAPS instead.");
    }
  };

  const handleImportJsonFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImportedTrackOrCupJson(text);
      if (!parsed) {
        flashIoNotice("Invalid JSON file: Expected a Gutsy Karts Track or Cup.");
        return;
      }
      if (parsed.kind === "TRACK") {
        const nextTrack: CustomTrackDefinition = {
          ...parsed.track,
          id: trackDefRef.current.id ?? parsed.track.id,
          cupId: activeCupId,
          isUserModified: true,
          updatedAt: Date.now(),
        };
        commitWorkingEdit(nextTrack, true);
        onChangeTrackDef(nextTrack);
        setSavedBaselineDef(nextTrack);
        savedBaselineRef.current = nextTrack;
        setIsDirty(false);
        flashIoNotice(`Imported Track: "${nextTrack.name}"`);
      } else {
        onImportCupOrCatalog?.(parsed);
        flashIoNotice(
          parsed.kind === "CUP"
            ? `Imported Cup Series: "${parsed.cup.name}" (${parsed.cup.tracks.length} maps)`
            : `Imported Catalog (${parsed.cups.length} Cups)`
        );
      }
    } catch {
      flashIoNotice("Could not read JSON file.");
    }
  };

  const handleResetCurrentTrackToOfficial = () => {
    const official = getOfficialDefaultTrack(
      activeCupId,
      activeTrackIdx,
      trackDefRef.current.id
    );
    if (!official) return;
    pushUndoSnapshot();
    trackDefRef.current = official;
    setTrackDef(official);
    setSavedBaselineDef(official);
    savedBaselineRef.current = official;
    setIsDirty(false);
    onResetTrackToOfficial?.(activeCupId, activeTrackIdx);
    flashIoNotice(`Reset "${official.name}" to Official Game Default.`);
  };

  const handleDiscardChanges = () => {
    const baseline = savedBaselineRef.current;
    trackDefRef.current = baseline;
    setTrackDef(baseline);
    setUndoStack([]);
    setRedoStack([]);
    setIsDirty(false);
  };

  // Feature 1: 1-Click Auto-Smooth AI Bottleneck Corners (relaxes pinch angles & pulls spline slightly toward AI overshoot trajectory)
  const handleAutoSmoothBottlenecks = () => {
    const currentDef = trackDefRef.current;
    const pts = currentDef.controlPoints;
    const n = pts.length;
    if (n < 4 || bottleneckNodeMap.size === 0) {
      flashIoNotice("No AI bottleneck corners detected on this circuit!");
      return;
    }

    const smoothedNodes: string[] = [];
    const nextPts = pts.map((pt, idx) => {
      // Never shift P0 (Start/Finish line anchor)
      if (idx === 0) return pt;
      const bInfo = bottleneckNodeMap.get(idx);
      if (!bInfo) return pt;

      const prevPt = pts[(idx - 1 + n) % n];
      const nextPt = pts[(idx + 1) % n];
      const midX = (prevPt.x + nextPt.x) * 0.5;
      const midZ = (prevPt.z + nextPt.z) * 0.5;

      const avgOvershootDx = bInfo.dxSum / Math.max(1, bInfo.hits);
      const avgOvershootDz = bInfo.dzSum / Math.max(1, bInfo.hits);

      let stepX = (midX - pt.x) * 0.22 + avgOvershootDx * 0.18;
      let stepZ = (midZ - pt.z) * 0.22 + avgOvershootDz * 0.18;
      const stepLen = Math.hypot(stepX, stepZ);
      if (stepLen > 8.5) {
        stepX = (stepX / stepLen) * 8.5;
        stepZ = (stepZ / stepLen) * 8.5;
      }

      smoothedNodes.push(`P${idx}`);
      return {
        ...pt,
        x: Number((pt.x + stepX).toFixed(1)),
        z: Number((pt.z + stepZ).toFixed(1)),
      };
    });

    if (smoothedNodes.length === 0) {
      flashIoNotice("Start line node P0 is locked; no other bottleneck nodes to adjust.");
      return;
    }

    commitWorkingEdit(
      syncTracksideSceneryAndClearRoad({
        ...currentDef,
        controlPoints: nextPts,
      }),
      true
    );
    flashIoNotice(
      `Auto-smoothed ${smoothedNodes.length} bottleneck corner${
        smoothedNodes.length > 1 ? "s" : ""
      } (${smoothedNodes.join(", ")})! Use Undo (Ctrl+Z) to revert.`
    );
  };

  // Feature 3: Snap Boost Pads & Stunt Jump Ramps onto the Consensus AI Racing Line
  const handleSnapPadsAndRampsToAiLine = () => {
    const currentDef = trackDefRef.current;
    if (recordedAiTraces.length === 0) {
      flashIoNotice("No recorded AI traces yet — run a test race first!");
      return;
    }

    const queryConsensusLateralAtNormT = (targetNormT: number): number | null => {
      const lats: number[] = [];
      for (const r of recordedAiTraces) {
        for (const s of r.pathSamples) {
          let diffT = Math.abs(s.normT - targetNormT);
          if (diffT > 0.5) diffT = 1.0 - diffT;
          if (diffT <= 0.025 && (s.surface !== "OFFROAD" || s.boosting)) {
            lats.push(s.signedLat);
          }
        }
      }
      if (lats.length === 0) return null;
      lats.sort((a, b) => a - b);
      const mid = Math.floor(lats.length / 2);
      const medianLat =
        lats.length % 2 === 1
          ? lats[mid]
          : (lats[mid - 1] + lats[mid]) * 0.5;
      const maxSafeLat = Math.max(2.0, currentDef.roadHalfWidth - 2.0);
      return Math.max(-maxSafeLat, Math.min(maxSafeLat, medianLat));
    };

    let snappedPads = 0;
    const nextBoostPads = currentDef.boostPads.map((pad) => {
      const targetLat = queryConsensusLateralAtNormT(pad.normT);
      if (targetLat === null) return pad;
      snappedPads += 1;
      return {
        ...pad,
        lateral: Number(targetLat.toFixed(2)),
      };
    });

    let snappedRamps = 0;
    const nextObstacles = currentDef.obstacles.map((obs) => {
      if (obs.type !== "JUMP_RAMP") return obs;
      const q = splineData.queryClosestTrackPoint(new Vector3(obs.x, 0, obs.z));
      const targetLat = queryConsensusLateralAtNormT(q.normalizedSplineT);
      if (targetLat === null) return obs;
      const alignedSample = splineData.getPointAtNormalizedT(
        q.normalizedSplineT,
        targetLat
      );
      const yaw = Math.atan2(alignedSample.tangent.x, alignedSample.tangent.z);
      snappedRamps += 1;
      return {
        ...obs,
        x: Number(alignedSample.position.x.toFixed(1)),
        z: Number(alignedSample.position.z.toFixed(1)),
        rotationY: Number(yaw.toFixed(2)),
      };
    });

    if (snappedPads === 0 && snappedRamps === 0) {
      flashIoNotice("No Boost Pads or Jump Ramps found along recorded AI trace sectors.");
      return;
    }

    commitWorkingEdit(
      {
        ...currentDef,
        boostPads: nextBoostPads,
        obstacles: nextObstacles,
      },
      true
    );
    flashIoNotice(
      `Snapped ${snappedPads} Boost Pad${snappedPads === 1 ? "" : "s"} & ${snappedRamps} Jump Ramp${
        snappedRamps === 1 ? "" : "s"
      } onto the AI racing line!`
    );
  };

  // Feature 4: Auto-Place Safe Jumps (relocates hazardous corner jumps & places fun straightaway/crest stunt ramps on the AI line)
  const handleAutoPlaceSafeJumps = () => {
    const currentDef = trackDefRef.current;
    const totalLen = Math.max(200, splineData.totalTrackLength);

    const queryConsensusLateralAtNormT = (targetNormT: number): number => {
      if (recordedAiTraces.length === 0) return 0;
      const lats: number[] = [];
      for (const r of recordedAiTraces) {
        for (const s of r.pathSamples) {
          let diffT = Math.abs(s.normT - targetNormT);
          if (diffT > 0.5) diffT = 1.0 - diffT;
          if (diffT <= 0.025 && (s.surface !== "OFFROAD" || s.boosting)) {
            lats.push(s.signedLat);
          }
        }
      }
      if (lats.length === 0) return 0;
      lats.sort((a, b) => a - b);
      const mid = Math.floor(lats.length / 2);
      const medianLat =
        lats.length % 2 === 1
          ? lats[mid]
          : (lats[mid - 1] + lats[mid]) * 0.5;
      const maxSafeLat = Math.max(1.5, currentDef.roadHalfWidth - 2.6);
      return Math.max(-maxSafeLat, Math.min(maxSafeLat, medianLat));
    };

    // Evaluate whether a normalized spline position is a safe, fun launch zone with a straight 48m landing runway
    const evaluateJumpSafetyAtNormT = (
      normT: number
    ): { safe: boolean; score: number } => {
      // Keep start/finish straight clear for standing starts & lap line
      if (normT < 0.065 || normT > 0.915) {
        return { safe: false, score: -1 };
      }

      const dBehind = 18 / totalLen;
      const dAhead15 = 15 / totalLen;
      const dAhead30 = 30 / totalLen;
      const dAhead46 = 46 / totalLen;

      const s0 = splineData.getPointAtNormalizedT(normT, 0);
      const sBehind = splineData.getPointAtNormalizedT(
        (normT - dBehind + 1) % 1,
        0
      );
      const s15 = splineData.getPointAtNormalizedT((normT + dAhead15) % 1, 0);
      const s30 = splineData.getPointAtNormalizedT((normT + dAhead30) % 1, 0);
      const s46 = splineData.getPointAtNormalizedT((normT + dAhead46) % 1, 0);

      const tan0 = new Vector3(s0.tangent.x, 0, s0.tangent.z).normalize();
      const tanBehind = new Vector3(
        sBehind.tangent.x,
        0,
        sBehind.tangent.z
      ).normalize();
      const tan15 = new Vector3(s15.tangent.x, 0, s15.tangent.z).normalize();
      const tan30 = new Vector3(s30.tangent.x, 0, s30.tangent.z).normalize();
      const tan46 = new Vector3(s46.tangent.x, 0, s46.tangent.z).normalize();

      const dotBehind = Vector3.Dot(tan0, tanBehind);
      const dot15 = Vector3.Dot(tan0, tan15);
      const dot30 = Vector3.Dot(tan0, tan30);
      const dot46 = Vector3.Dot(tan0, tan46);

      // Compute horizontal cross-track drift at 42m ahead if a kart flies straight along tan0
      const s42 = splineData.getPointAtNormalizedT(
        (normT + 42 / totalLen) % 1,
        0
      );
      const toLanding = s42.position.subtract(s0.position);
      toLanding.y = 0;
      const binorm0 = new Vector3(s0.binormal.x, 0, s0.binormal.z).normalize();
      const crossTrackLandingOffset = Math.abs(Vector3.Dot(toLanding, binorm0));

      const isSafe =
        dotBehind >= 0.90 &&
        dot15 >= 0.95 &&
        dot30 >= 0.92 &&
        dot46 >= 0.88 &&
        crossTrackLandingOffset <= currentDef.roadHalfWidth * 0.62;

      if (!isSafe) {
        return { safe: false, score: -1 };
      }

      // Score higher for dead-straight runways, hill crests, and high AI speed sectors
      const crestBonus = Math.max(0, (s0.position.y - s30.position.y) * 0.12);
      const straightnessScore =
        (dotBehind + dot15 * 1.5 + dot30 * 1.5 + dot46 * 1.2) * 20 -
        crossTrackLandingOffset * 1.8 +
        crestBonus;

      return { safe: true, score: straightnessScore };
    };

    // 1. Keep non-jump obstacles, and check existing JUMP_RAMP obstacles (remove hazardous corner ramps)
    const nonJumpObstacles = currentDef.obstacles.filter(
      (o) => o.type !== "JUMP_RAMP"
    );
    const existingJumps = currentDef.obstacles.filter(
      (o) => o.type === "JUMP_RAMP"
    );

    let removedHazardJumps = 0;
    const keptSafeJumps: typeof existingJumps = [];
    const occupiedNormTs: number[] = [];

    for (const jump of existingJumps) {
      const q = splineData.queryClosestTrackPoint(
        new Vector3(jump.x, 0, jump.z)
      );
      const check = evaluateJumpSafetyAtNormT(q.normalizedSplineT);
      if (check.safe) {
        // Align kept safe jump to AI consensus line
        const targetLat = queryConsensusLateralAtNormT(q.normalizedSplineT);
        const aligned = splineData.getPointAtNormalizedT(
          q.normalizedSplineT,
          targetLat
        );
        const yaw = Math.atan2(aligned.tangent.x, aligned.tangent.z);
        keptSafeJumps.push({
          ...jump,
          x: Number(aligned.position.x.toFixed(1)),
          z: Number(aligned.position.z.toFixed(1)),
          rotationY: Number(yaw.toFixed(2)),
        });
        occupiedNormTs.push(q.normalizedSplineT);
      } else {
        removedHazardJumps++;
      }
    }

    // 2. Scan 160 candidate points around the track for the best safe jump locations
    const candidates: Array<{ normT: number; score: number }> = [];
    const steps = 160;
    for (let i = 0; i < steps; i++) {
      const normT = i / steps;
      const res = evaluateJumpSafetyAtNormT(normT);
      if (res.safe) {
        candidates.push({ normT, score: res.score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const targetJumpCount = Math.min(3, Math.max(2, Math.round(totalLen / 340)));
    const minSpacingT = Math.max(0.20, 140 / totalLen);
    const newJumps: typeof existingJumps = [...keptSafeJumps];

    for (const cand of candidates) {
      if (newJumps.length >= targetJumpCount) break;
      const tooClose = occupiedNormTs.some((t) => {
        let diff = Math.abs(t - cand.normT);
        if (diff > 0.5) diff = 1.0 - diff;
        return diff < minSpacingT;
      });
      if (tooClose) continue;

      const lat = queryConsensusLateralAtNormT(cand.normT);
      const sample = splineData.getPointAtNormalizedT(cand.normT, lat);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

      newJumps.push({
        id: `auto_jump_${Date.now()}_${newJumps.length}`,
        type: "JUMP_RAMP",
        x: Number(sample.position.x.toFixed(1)),
        z: Number(sample.position.z.toFixed(1)),
        rotationY: Number(yaw.toFixed(2)),
        scale: 1.15,
      });
      occupiedNormTs.push(cand.normT);
    }

    // If strict thresholds found no candidates on a very twisty track, relax slightly to place at least 1 safe straightaway jump
    if (newJumps.length === 0) {
      let bestT = 0.25;
      let bestDot = -1;
      for (let i = 12; i < steps - 14; i++) {
        const normT = i / steps;
        const s0 = splineData.getPointAtNormalizedT(normT, 0);
        const s28 = splineData.getPointAtNormalizedT(
          (normT + 28 / totalLen) % 1,
          0
        );
        const dot = Vector3.Dot(s0.tangent, s28.tangent);
        if (dot > bestDot) {
          bestDot = dot;
          bestT = normT;
        }
      }
      const lat = queryConsensusLateralAtNormT(bestT);
      const sample = splineData.getPointAtNormalizedT(bestT, lat);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      newJumps.push({
        id: `auto_jump_${Date.now()}_0`,
        type: "JUMP_RAMP",
        x: Number(sample.position.x.toFixed(1)),
        z: Number(sample.position.z.toFixed(1)),
        rotationY: Number(yaw.toFixed(2)),
        scale: 1.1,
      });
      occupiedNormTs.push(bestT);
    }

    // 3. Nudge any Item Box Rows out of mid-air jump trajectories so racers don't fly over item boxes
    const jumpFlightArcT = 42 / totalLen;
    const adjustedItemRows = currentDef.itemBoxRows.map((row) => {
      for (const jT of occupiedNormTs) {
        const deltaAhead = (row.normT - jT + 1) % 1;
        if (deltaAhead >= 0 && deltaAhead < jumpFlightArcT) {
          // Place row safely after the landing zone
          return {
            ...row,
            normT: Number(((jT + jumpFlightArcT + 0.018) % 1).toFixed(4)),
          };
        }
      }
      return row;
    });

    commitWorkingEdit(
      {
        ...currentDef,
        obstacles: [...nonJumpObstacles, ...newJumps],
        itemBoxRows: adjustedItemRows,
      },
      true
    );

    flashIoNotice(
      removedHazardJumps > 0
        ? `Relocated ${removedHazardJumps} corner-hazard jump${
            removedHazardJumps === 1 ? "" : "s"
          } & placed ${newJumps.length} Safe Stunt Jump${
            newJumps.length === 1 ? "" : "s"
          } on straightaways!`
        : `Placed ${newJumps.length} Safe Stunt Jump${
            newJumps.length === 1 ? "" : "s"
          } with clear landing runways on the AI line!`
    );
  };

  // Feature 5: Auto-Curate Corner-Exit Boost Pads & Grounded Item Box Rows
  const handleAutoCurateBoostsAndBoxes = () => {
    const currentDef = trackDefRef.current;
    const totalLen = Math.max(200, splineData.totalTrackLength);

    const queryConsensusLateralAtNormT = (targetNormT: number): number => {
      if (recordedAiTraces.length === 0) return 0;
      const lats: number[] = [];
      for (const r of recordedAiTraces) {
        for (const s of r.pathSamples) {
          let diffT = Math.abs(s.normT - targetNormT);
          if (diffT > 0.5) diffT = 1.0 - diffT;
          if (diffT <= 0.025 && (s.surface !== "OFFROAD" || s.boosting)) {
            lats.push(s.signedLat);
          }
        }
      }
      if (lats.length === 0) return 0;
      lats.sort((a, b) => a - b);
      const mid = Math.floor(lats.length / 2);
      const medianLat =
        lats.length % 2 === 1
          ? lats[mid]
          : (lats[mid - 1] + lats[mid]) * 0.5;
      const maxSafeLat = Math.max(1.5, currentDef.roadHalfWidth - 2.4);
      return Math.max(-maxSafeLat, Math.min(maxSafeLat, medianLat));
    };

    // Find normalizedTs of existing Jump Ramps so we don't put boost pads or item boxes inside mid-air jump arcs
    const jumpNormTs = currentDef.obstacles
      .filter((o) => o.type === "JUMP_RAMP")
      .map(
        (o) =>
          splineData.queryClosestTrackPoint(new Vector3(o.x, 0, o.z))
            .normalizedSplineT
      );

    const isInsideJumpCorridor = (normT: number, bufferMeters = 45): boolean => {
      const arcT = bufferMeters / totalLen;
      const beforeT = 12 / totalLen;
      return jumpNormTs.some((jT) => {
        const ahead = (normT - jT + 1) % 1;
        const behind = (jT - normT + 1) % 1;
        return ahead <= arcT || behind <= beforeT;
      });
    };

    // 1. Score Corner Exits around the track (curvature behind transitioning into straightaway ahead)
    const exitCandidates: Array<{ normT: number; score: number }> = [];
    const steps = 160;
    for (let i = 0; i < steps; i++) {
      const normT = i / steps;
      if (normT < 0.06 || normT > 0.93) continue;
      if (isInsideJumpCorridor(normT, 38)) continue;

      const sBack = splineData.getPointAtNormalizedT(
        (normT - 24 / totalLen + 1) % 1,
        0
      );
      const sHere = splineData.getPointAtNormalizedT(normT, 0);
      const sAhead = splineData.getPointAtNormalizedT(
        (normT + 28 / totalLen) % 1,
        0
      );

      const turnBefore = 1.0 - Vector3.Dot(sBack.tangent, sHere.tangent);
      const straightAhead = Vector3.Dot(sHere.tangent, sAhead.tangent);

      if (straightAhead >= 0.91 && turnBefore >= 0.04) {
        exitCandidates.push({
          normT,
          score: turnBefore * 10 + straightAhead * 3,
        });
      }
    }
    exitCandidates.sort((a, b) => b.score - a.score);

    const chosenBoostTs: number[] = [];
    const minBoostSpacing = Math.max(0.16, 105 / totalLen);
    for (const cand of exitCandidates) {
      if (chosenBoostTs.length >= 4) break;
      const tooClose = chosenBoostTs.some((t) => {
        let diff = Math.abs(t - cand.normT);
        if (diff > 0.5) diff = 1.0 - diff;
        return diff < minBoostSpacing;
      });
      if (tooClose) continue;
      chosenBoostTs.push(cand.normT);
    }

    // Fallback if track is mostly gentle curves
    if (chosenBoostTs.length < 3) {
      for (const fallbackT of [0.18, 0.46, 0.74]) {
        if (chosenBoostTs.length >= 3) break;
        if (!isInsideJumpCorridor(fallbackT, 30)) {
          chosenBoostTs.push(fallbackT);
        }
      }
    }
    chosenBoostTs.sort((a, b) => a - b);

    const curatedBoostPads = chosenBoostTs.map((normT, idx) => ({
      id: `boost_auto_${Date.now()}_${idx}`,
      normT: Number(normT.toFixed(4)),
      lateral: Number(queryConsensusLateralAtNormT(normT).toFixed(2)),
    }));

    // 2. Place 3 evenly spaced Item Box Rows on settled straightaways outside jump arcs
    const targetRowAnchors = [0.22, 0.52, 0.80];
    const curatedItemRows = targetRowAnchors.map((anchorT, idx) => {
      let bestT = anchorT;
      let bestScore = -999;
      for (let offset = -12; offset <= 12; offset++) {
        const candT = (anchorT + offset * 0.006 + 1) % 1;
        if (candT < 0.07 || candT > 0.92) continue;
        if (isInsideJumpCorridor(candT, 46)) continue;
        const s0 = splineData.getPointAtNormalizedT(candT, 0);
        const sAhead = splineData.getPointAtNormalizedT(
          (candT + 20 / totalLen) % 1,
          0
        );
        const straightness = Vector3.Dot(s0.tangent, sAhead.tangent);
        const distPenalty = Math.abs( offset ) * 0.01;
        const score = straightness - distPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestT = candT;
        }
      }
      return {
        id: `item_row_auto_${Date.now()}_${idx}`,
        normT: Number(bestT.toFixed(4)),
      };
    });

    commitWorkingEdit(
      {
        ...currentDef,
        boostPads: curatedBoostPads,
        itemBoxRows: curatedItemRows,
      },
      true
    );

    flashIoNotice(
      `Auto-curated ${curatedBoostPads.length} Corner-Exit Boost Pads (on AI line) & ${curatedItemRows.length} Grounded Item Box Rows!`
    );
  };

  // Feature 6: 1-Click Unbuckle & Subdivide Sharp Corners (eliminates inner-seam curb/road ribbon folding)
  const handleUnbuckleCorners = () => {
    const currentDef = trackDefRef.current;
    const { pts: nextPts, subdividedCount, relaxedCount } =
      unbuckleAndRefineControlPoints(
        currentDef.controlPoints,
        currentDef.roadHalfWidth
      );

    commitWorkingEdit(
      syncTracksideSceneryAndClearRoad({
        ...currentDef,
        controlPoints: nextPts,
      }),
      true
    );

    if (subdividedCount > 0 || relaxedCount > 0) {
      flashIoNotice(
        `Unbuckled & refined spline (${subdividedCount} sharp corner${
          subdividedCount === 1 ? "" : "s"
        } subdivided, ${relaxedCount} inner seam${
          relaxedCount === 1 ? "" : "s"
        } relaxed → ${nextPts.length} nodes)!`
      );
    } else {
      flashIoNotice(
        "All corners already have clean inner-seam radii — applied gentle elevation & spacing polish!"
      );
    }
  };

  // Feature 7: 1-Click Procedural Track Generator (archetype spline + anti-buckle + safe jumps + boosts + item boxes + scenery)
  const handleGenerateProceduralTrack = () => {
    const currentDef = trackDefRef.current;
    proceduralGenCountRef.current += 1;
    const seed =
      ((Date.now() & 0xfffffff) ^
        Math.imul(proceduralGenCountRef.current, 2654435761)) >>>
      0;

    const generated = generateProceduralCircuitControlPoints(
      proceduralArchetype,
      seed,
      currentDef.roadHalfWidth
    );

    const newSpline = computeTrackSplineSamples(
      generated.controlPoints,
      28,
      []
    );
    const totalLen = Math.max(200, newSpline.totalTrackLength);

    // 1. Auto-place 2-3 Safe Stunt Jumps on straightaways/crests with >= 46m clear landing runways
    const jumpCandidates: Array<{ normT: number; score: number }> = [];
    const steps = 160;
    for (let i = 0; i < steps; i++) {
      const normT = i / steps;
      if (normT < 0.07 || normT > 0.91) continue;
      const s0 = newSpline.getPointAtNormalizedT(normT, 0);
      const sBehind = newSpline.getPointAtNormalizedT(
        (normT - 18 / totalLen + 1) % 1,
        0
      );
      const s15 = newSpline.getPointAtNormalizedT(
        (normT + 15 / totalLen) % 1,
        0
      );
      const s30 = newSpline.getPointAtNormalizedT(
        (normT + 30 / totalLen) % 1,
        0
      );
      const s46 = newSpline.getPointAtNormalizedT(
        (normT + 46 / totalLen) % 1,
        0
      );

      const tan0 = new Vector3(s0.tangent.x, 0, s0.tangent.z).normalize();
      const tanBehind = new Vector3(
        sBehind.tangent.x,
        0,
        sBehind.tangent.z
      ).normalize();
      const tan15 = new Vector3(s15.tangent.x, 0, s15.tangent.z).normalize();
      const tan30 = new Vector3(s30.tangent.x, 0, s30.tangent.z).normalize();
      const tan46 = new Vector3(s46.tangent.x, 0, s46.tangent.z).normalize();

      const dotBehind = Vector3.Dot(tan0, tanBehind);
      const dot15 = Vector3.Dot(tan0, tan15);
      const dot30 = Vector3.Dot(tan0, tan30);
      const dot46 = Vector3.Dot(tan0, tan46);

      const s42 = newSpline.getPointAtNormalizedT(
        (normT + 42 / totalLen) % 1,
        0
      );
      const toLanding = s42.position.subtract(s0.position);
      toLanding.y = 0;
      const binorm0 = new Vector3(s0.binormal.x, 0, s0.binormal.z).normalize();
      const crossTrackOffset = Math.abs(Vector3.Dot(toLanding, binorm0));

      if (
        dotBehind >= 0.9 &&
        dot15 >= 0.95 &&
        dot30 >= 0.92 &&
        dot46 >= 0.88 &&
        crossTrackOffset <= generated.roadHalfWidth * 0.62
      ) {
        const crestBonus = Math.max(0, (s0.position.y - s30.position.y) * 0.12);
        const score =
          (dotBehind + dot15 * 1.5 + dot30 * 1.5 + dot46 * 1.2) * 20 -
          crossTrackOffset * 1.8 +
          crestBonus;
        jumpCandidates.push({ normT, score });
      }
    }
    jumpCandidates.sort((a, b) => b.score - a.score);

    const targetJumps = Math.min(3, Math.max(2, Math.round(totalLen / 340)));
    const minJumpSpace = Math.max(0.2, 140 / totalLen);
    const jumpNormTs: number[] = [];
    const safeJumps: CustomTrackDefinition["obstacles"] = [];

    for (const cand of jumpCandidates) {
      if (safeJumps.length >= targetJumps) break;
      const tooClose = jumpNormTs.some((t) => {
        let diff = Math.abs(t - cand.normT);
        if (diff > 0.5) diff = 1.0 - diff;
        return diff < minJumpSpace;
      });
      if (tooClose) continue;
      const sample = newSpline.getPointAtNormalizedT(cand.normT, 0);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      safeJumps.push({
        id: `proc_jump_${seed}_${safeJumps.length}`,
        type: "JUMP_RAMP",
        x: Number(sample.position.x.toFixed(1)),
        z: Number(sample.position.z.toFixed(1)),
        rotationY: Number(yaw.toFixed(2)),
        scale: 1.15,
      });
      jumpNormTs.push(cand.normT);
    }

    const isInsideJumpCorridor = (normT: number, bufferMeters = 45): boolean => {
      const arcT = bufferMeters / totalLen;
      const beforeT = 12 / totalLen;
      return jumpNormTs.some((jT) => {
        const ahead = (normT - jT + 1) % 1;
        const behind = (jT - normT + 1) % 1;
        return ahead <= arcT || behind <= beforeT;
      });
    };

    // 2. Auto-place 4 Corner-Exit Boost Pads outside jump flight arcs
    const boostCandidates: Array<{ normT: number; score: number; lat: number }> =
      [];
    for (let i = 0; i < steps; i++) {
      const normT = i / steps;
      if (normT < 0.06 || normT > 0.93) continue;
      if (isInsideJumpCorridor(normT, 38)) continue;
      const sBack = newSpline.getPointAtNormalizedT(
        (normT - 24 / totalLen + 1) % 1,
        0
      );
      const sHere = newSpline.getPointAtNormalizedT(normT, 0);
      const sAhead = newSpline.getPointAtNormalizedT(
        (normT + 28 / totalLen) % 1,
        0
      );
      const turnBefore = 1.0 - Vector3.Dot(sBack.tangent, sHere.tangent);
      const straightAhead = Vector3.Dot(sHere.tangent, sAhead.tangent);
      if (straightAhead >= 0.91 && turnBefore >= 0.04) {
        // Nudge slightly toward the apex-exit side
        const turnCross =
          sBack.tangent.x * sHere.tangent.z - sBack.tangent.z * sHere.tangent.x;
        const lat = Number(
          (Math.sign(turnCross) * Math.min(2.4, generated.roadHalfWidth * 0.16)).toFixed(2)
        );
        boostCandidates.push({
          normT,
          score: turnBefore * 10 + straightAhead * 3,
          lat,
        });
      }
    }
    boostCandidates.sort((a, b) => b.score - a.score);

    const chosenBoosts: Array<{ normT: number; lat: number }> = [];
    const minBoostSpace = Math.max(0.16, 105 / totalLen);
    for (const cand of boostCandidates) {
      if (chosenBoosts.length >= 4) break;
      const tooClose = chosenBoosts.some((b) => {
        let diff = Math.abs(b.normT - cand.normT);
        if (diff > 0.5) diff = 1.0 - diff;
        return diff < minBoostSpace;
      });
      if (tooClose) continue;
      chosenBoosts.push({ normT: cand.normT, lat: cand.lat });
    }
    if (chosenBoosts.length < 3) {
      for (const fallbackT of [0.18, 0.46, 0.74]) {
        if (chosenBoosts.length >= 3) break;
        if (!isInsideJumpCorridor(fallbackT, 30)) {
          chosenBoosts.push({ normT: fallbackT, lat: 0 });
        }
      }
    }
    chosenBoosts.sort((a, b) => a.normT - b.normT);

    const procBoostPads = chosenBoosts.map((b, idx) => ({
      id: `proc_boost_${seed}_${idx}`,
      normT: Number(b.normT.toFixed(4)),
      lateral: b.lat,
    }));

    // 3. Auto-place 3 Grounded Item Box Rows outside mid-air jump trajectories
    const procItemRows = [0.22, 0.52, 0.8].map((anchorT, idx) => {
      let bestT = anchorT;
      let bestScore = -999;
      for (let offset = -12; offset <= 12; offset++) {
        const candT = (anchorT + offset * 0.006 + 1) % 1;
        if (candT < 0.07 || candT > 0.92) continue;
        if (isInsideJumpCorridor(candT, 46)) continue;
        const s0 = newSpline.getPointAtNormalizedT(candT, 0);
        const sAhead = newSpline.getPointAtNormalizedT(
          (candT + 20 / totalLen) % 1,
          0
        );
        const straightness = Vector3.Dot(s0.tangent, sAhead.tangent);
        const score = straightness - Math.abs(offset) * 0.01;
        if (score > bestScore) {
          bestScore = score;
          bestT = candT;
        }
      }
      return {
        id: `proc_item_row_${seed}_${idx}`,
        normT: Number(bestT.toFixed(4)),
      };
    });

    const nextScenerySeed = (currentDef.scenerySeed ?? 0) + 1;
    const populatedTrack = syncTracksideSceneryAndClearRoad({
      ...currentDef,
      roadHalfWidth: generated.roadHalfWidth,
      controlPoints: generated.controlPoints,
      boostPads: procBoostPads,
      itemBoxRows: procItemRows,
      obstacles: safeJumps,
      sceneryProps: [],
      autoTracksideScenery: true,
      scenerySeed: nextScenerySeed,
      terrainHillScale: generated.terrainHillScale,
      terrainMods: [],
    });

    // Clear stale AI traces for this map slot since the track layout changed completely
    globalAiBrain.clearTrackAiTraces(currentDef.id || currentDef.name);
    setTraceTick((t) => t + 1);
    setSelectedControlIdx(0);
    commitWorkingEdit(populatedTrack, true);

    flashIoNotice(
      `Generated "${generated.archetypeTitle}" (${Math.round(
        totalLen
      )}m, ${generated.controlPoints.length} buckle-free nodes, ${
        safeJumps.length
      } jumps, ${procBoostPads.length} boosts)!`
    );
  };

  // Keyboard shortcuts for Undo (Ctrl+Z), Redo (Ctrl+Y / Ctrl+Shift+Z), and Save (Ctrl+S)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveMap();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Compute live Catmull-Rom spline & Frenet frames whenever controlPoints or terrainMods change
  const splineData = useMemo(
    () =>
      computeTrackSplineSamples(
        trackDef.controlPoints,
        28,
        trackDef.terrainMods ?? []
      ),
    [trackDef.controlPoints, trackDef.terrainMods]
  );

  // Detect any control nodes where the inner curb/road ribbon is pinching or buckling
  const buckledNodeSet = useMemo(
    () =>
      detectBuckledControlNodes(
        trackDef.controlPoints,
        trackDef.roadHalfWidth,
        splineData.samples
      ),
    [trackDef.controlPoints, trackDef.roadHalfWidth, splineData.samples]
  );

  const svgPathString = useMemo(() => {
    const pts = splineData.samples;
    if (pts.length === 0) return "";
    return (
      pts
        .map(
          (s, idx) =>
            `${idx === 0 ? "M" : "L"} ${s.position.x.toFixed(1)} ${(-s.position.z).toFixed(1)}`
        )
        .join(" ") + " Z"
    );
  }, [splineData.samples]);

  // Apply a tool action at world (x, z)
  const applyToolAtWorldPoint = (worldX: number, worldZ: number) => {
    const currentDef = trackDefRef.current;
    const tool = activeToolRef.current;
    const spline = computeTrackSplineSamples(
      currentDef.controlPoints,
      24,
      currentDef.terrainMods ?? []
    );

    if (tool.kind === "TERRAIN_RAISE" || tool.kind === "TERRAIN_LOWER") {
      const sign = tool.kind === "TERRAIN_RAISE" ? 1 : -1;
      const radius = brushRadiusRef.current;
      const delta = sign * brushStrengthRef.current;
      const nextMods = [
        ...(currentDef.terrainMods ?? []),
        {
          id: `tmod_${Date.now()}_${Math.floor(Math.random() * 999)}`,
          x: Number(worldX.toFixed(1)),
          z: Number(worldZ.toFixed(1)),
          radius,
          deltaY: Number(delta.toFixed(1)),
        },
      ];
      commitWorkingEdit({
        ...currentDef,
        terrainMods: nextMods,
      });
    } else if (tool.kind === "TERRAIN_FLATTEN") {
      const rSq = brushRadiusRef.current * brushRadiusRef.current;
      const nextMods = (currentDef.terrainMods ?? []).filter((m) => {
        const dx = m.x - worldX;
        const dz = m.z - worldZ;
        return dx * dx + dz * dz > rSq;
      });
      const nextPts = currentDef.controlPoints.map((pt) => {
        const dx = pt.x - worldX;
        const dz = pt.z - worldZ;
        const dSq = dx * dx + dz * dz;
        if (dSq >= rSq) return pt;
        const falloff = 1 - dSq / rSq;
        const nextY = Number((pt.y * (1 - 0.65 * falloff)).toFixed(1));
        return { ...pt, y: Math.max(0, nextY) };
      });
      commitWorkingEdit({
        ...currentDef,
        controlPoints: nextPts,
        terrainMods: nextMods,
      });
    } else if (tool.kind === "BOOST_PAD") {
      const q = spline.queryClosestTrackPoint(new Vector3(worldX, 0, worldZ));
      const clampedLat = Math.max(
        -(currentDef.roadHalfWidth - 2.2),
        Math.min(currentDef.roadHalfWidth - 2.2, q.signedLateralOffset)
      );
      commitWorkingEdit({
        ...currentDef,
        boostPads: [
          ...currentDef.boostPads,
          {
            id: `boost_${Date.now()}`,
            normT: Number(q.normalizedSplineT.toFixed(4)),
            lateral: Number(clampedLat.toFixed(2)),
          },
        ],
      });
    } else if (tool.kind === "ITEM_ROW") {
      const q = spline.queryClosestTrackPoint(new Vector3(worldX, 0, worldZ));
      commitWorkingEdit({
        ...currentDef,
        itemBoxRows: [
          ...currentDef.itemBoxRows,
          {
            id: `item_row_${Date.now()}`,
            normT: Number(q.normalizedSplineT.toFixed(4)),
          },
        ],
      });
    } else if (tool.kind === "OBSTACLE") {
      const q = spline.queryClosestTrackPoint(new Vector3(worldX, 0, worldZ));
      const yaw = Math.atan2(q.tangent.x, q.tangent.z);
      commitWorkingEdit({
        ...currentDef,
        obstacles: [
          ...currentDef.obstacles,
          {
            id: `obs_${Date.now()}`,
            type: tool.prefab,
            x: Number(worldX.toFixed(1)),
            z: Number(worldZ.toFixed(1)),
            rotationY: Number(yaw.toFixed(2)),
            scale: prefabScaleRef.current,
          },
        ],
      });
    } else if (tool.kind === "SCENERY") {
      const q = spline.queryClosestTrackPoint(new Vector3(worldX, 0, worldZ));
      // Prevent stamping trees directly onto the asphalt pavement
      if (q.horizontalDistance < currentDef.roadHalfWidth + 3.0) {
        return;
      }
      const randomYaw = Number((Math.random() * Math.PI * 2).toFixed(2));
      commitWorkingEdit({
        ...currentDef,
        sceneryProps: [
          ...currentDef.sceneryProps,
          {
            id: `scenery_${Date.now()}_${Math.floor(Math.random() * 999)}`,
            type: tool.prefab,
            x: Number(worldX.toFixed(1)),
            z: Number(worldZ.toFixed(1)),
            rotationY: randomYaw,
            scale: prefabScaleRef.current,
            isManual: true,
          },
        ],
      });
    }
  };

  // Initialize 3D Babylon.js Editor Engine & Camera
  useEffect(() => {
    if (viewportLayout === "2D_ONLY") return;
    const canvas = canvas3dRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.13, 0.22, 1.0);
    sceneRef.current = scene;

    const camera = new ArcRotateCamera(
      "editor3dCam",
      -Math.PI / 2.2,
      0.72,
      460,
      new Vector3(110, 0, -35),
      scene
    );
    camera.lowerBetaLimit = 0.08;
    camera.upperBetaLimit = Math.PI / 2 - 0.06;
    camera.lowerRadiusLimit = 45;
    camera.upperRadiusLimit = 1100;
    camera.wheelPrecision = 0.6;
    camera.panningSensibility = 18;
    camera.maxZ = 2200;
    camera.attachControl(canvas, true);
    camera3dRef.current = camera;

    // 3D Brush Ring Cursor on Terrain
    const brushRing = MeshBuilder.CreateTorus(
      "editorBrushRing",
      { diameter: 1, thickness: 0.04, tessellation: 32 },
      scene
    );
    const ringMat = new StandardMaterial("editorBrushRingMat", scene);
    ringMat.diffuseColor = new Color3(0.2, 0.95, 0.6);
    ringMat.emissiveColor = new Color3(0.15, 0.85, 0.5);
    brushRing.material = ringMat;
    brushRing.isPickable = false;
    brushRing.setEnabled(false);

    // Interactive 3D pointer handling for dragging spline control points & sculpting terrain
    let dragged3dNodeIdx: number | null = null;
    let dragStartScreenY = 0;
    let dragStartNodeY = 0;

    scene.onPointerDown = (evt, pickInfo) => {
      if (evt.button !== 0) return; // Left click only for editing; right-click orbits camera
      const tool = activeToolRef.current;
      if (tool.kind === "ORBIT_CAM") return;

      // Check if user clicked a 3D spline control node sphere (`ctrlNode_i`)
      const pickedMesh = pickInfo?.pickedMesh;
      if (pickedMesh && pickedMesh.name.startsWith("ctrlNode_")) {
        const idx = parseInt(pickedMesh.name.replace("ctrlNode_", ""), 10);
        if (!Number.isNaN(idx)) {
          setSelectedControlIdx(idx);
          if (tool.kind === "SPLINE" || tool.kind === "SPLINE_ELEVATION") {
            pushUndoSnapshot();
            dragged3dNodeIdx = idx;
            dragStartScreenY = scene.pointerY;
            dragStartNodeY =
              trackDefRef.current.controlPoints[idx]?.y ?? 0;
            camera.detachControl();
          }
          return;
        }
      }

      // Otherwise check if user clicked on ground/road to sculpt terrain or stamp prefabs
      const ray = scene.createPickingRay(
        scene.pointerX,
        scene.pointerY,
        null,
        camera
      );
      const hit = scene.pickWithRay(
        ray,
        (m) =>
          m.name === "offroad_terrain" ||
          m.name === "pavement_ribbon" ||
          m.name === "curb_left" ||
          m.name === "curb_right"
      );
      if (hit?.hit && hit.pickedPoint) {
        if (
          tool.kind === "TERRAIN_RAISE" ||
          tool.kind === "TERRAIN_LOWER" ||
          tool.kind === "TERRAIN_FLATTEN" ||
          tool.kind === "BOOST_PAD" ||
          tool.kind === "ITEM_ROW" ||
          tool.kind === "OBSTACLE" ||
          tool.kind === "SCENERY"
        ) {
          applyToolAtWorldPoint(hit.pickedPoint.x, hit.pickedPoint.z);
        }
      }
    };

    scene.onPointerMove = () => {
      const tool = activeToolRef.current;

      // Update 3D terrain brush ring preview
      const ray = scene.createPickingRay(
        scene.pointerX,
        scene.pointerY,
        null,
        camera
      );
      const hit = scene.pickWithRay(
        ray,
        (m) => m.name === "offroad_terrain" || m.name === "pavement_ribbon"
      );

      if (
        hit?.hit &&
        hit.pickedPoint &&
        (tool.kind === "TERRAIN_RAISE" ||
          tool.kind === "TERRAIN_LOWER" ||
          tool.kind === "TERRAIN_FLATTEN")
      ) {
        brushRing.setEnabled(true);
        brushRing.position.set(
          hit.pickedPoint.x,
          hit.pickedPoint.y + 0.6,
          hit.pickedPoint.z
        );
        const d = brushRadiusRef.current * 2;
        brushRing.scaling.set(d, 12, d);
      } else {
        brushRing.setEnabled(false);
      }

      if (dragged3dNodeIdx !== null) {
        const currentDef = trackDefRef.current;
        const currentPt = currentDef.controlPoints[dragged3dNodeIdx];
        if (!currentPt) return;

        if (tool.kind === "SPLINE_ELEVATION") {
          const deltaPixels = dragStartScreenY - scene.pointerY;
          const nextY = Math.max(
            0,
            Math.min(24, Number((dragStartNodeY + deltaPixels * 0.08).toFixed(1)))
          );
          const nextPts = currentDef.controlPoints.map((pt, i) =>
            i === dragged3dNodeIdx ? { ...pt, y: nextY } : pt
          );
          commitWorkingEdit(
            syncTracksideSceneryAndClearRoad({
              ...currentDef,
              controlPoints: nextPts,
            }),
            false
          );
        } else if (Math.abs(ray.direction.y) > 1e-4) {
          // Intersect ray with horizontal plane at node's current Y
          const t = (currentPt.y - ray.origin.y) / ray.direction.y;
          if (t > 0) {
            const hitX = Number((ray.origin.x + ray.direction.x * t).toFixed(1));
            const hitZ = Number((ray.origin.z + ray.direction.z * t).toFixed(1));
            const nextPts = currentDef.controlPoints.map((pt, i) =>
              i === dragged3dNodeIdx ? { ...pt, x: hitX, z: hitZ } : pt
            );
            commitWorkingEdit(
              syncTracksideSceneryAndClearRoad({
                ...currentDef,
                controlPoints: nextPts,
              }),
              false
            );
          }
        }
      }
    };

    scene.onPointerUp = () => {
      if (dragged3dNodeIdx !== null) {
        dragged3dNodeIdx = null;
        camera.attachControl(canvas, true);
      }
    };

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      sceneRef.current = null;
      camera3dRef.current = null;
      scene.dispose();
      engine.dispose();
    };
  }, [viewportLayout]);

  // Rebuild 3D Track, Sculpted Terrain, Trees, and 3D Spline Gizmos whenever trackDef changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Dispose previous trackRoot and gizmoRoot
    scene.transformNodes
      .filter((n) => n.name === "trackRoot" || n.name === "editorGizmoRoot")
      .forEach((n) => n.dispose(false, true));
    scene.lights.slice().forEach((l) => l.dispose());

    // Build full 3D procedural track, sculpted 3D terrain, obstacles, and scenery
    buildProceduralTrack(scene, trackDef);

    // Build 3D Control Point Handles & Elevation Pillars (`editorGizmoRoot`)
    const gizmoRoot = new TransformNode("editorGizmoRoot", scene);

    const nodeDefaultMat = new StandardMaterial("ctrlNodeDefaultMat", scene);
    nodeDefaultMat.diffuseColor = new Color3(0.95, 0.96, 0.98);
    nodeDefaultMat.emissiveColor = new Color3(0.35, 0.38, 0.45);

    const nodeSelectedMat = new StandardMaterial("ctrlNodeSelectedMat", scene);
    nodeSelectedMat.diffuseColor = new Color3(0.15, 0.82, 0.98);
    nodeSelectedMat.emissiveColor = new Color3(0.1, 0.55, 0.85);

    const nodeStartMat = new StandardMaterial("ctrlNodeStartMat", scene);
    nodeStartMat.diffuseColor = new Color3(0.98, 0.82, 0.12);
    nodeStartMat.emissiveColor = new Color3(0.65, 0.5, 0.05);

    const bottleneckRingMat = new StandardMaterial(
      "ctrlBottleneckRingMat",
      scene
    );
    bottleneckRingMat.diffuseColor = new Color3(0.96, 0.25, 0.37);
    bottleneckRingMat.emissiveColor = new Color3(0.85, 0.15, 0.28);

    const buckledRingMat = new StandardMaterial("ctrlBuckledRingMat", scene);
    buckledRingMat.diffuseColor = new Color3(0.98, 0.52, 0.08);
    buckledRingMat.emissiveColor = new Color3(0.9, 0.42, 0.05);

    trackDef.controlPoints.forEach((pt, idx) => {
      const isSelected = idx === selectedControlIdx;
      const isBottleneckNode = showAiTraces && bottleneckNodeMap.has(idx);
      const isBuckledNode = buckledNodeSet.has(idx);
      const nodeRoadY = Math.max(
        pt.y,
        splineData.queryClosestTrackPoint(new Vector3(pt.x, 0, pt.z)).roadY
      );
      const sphere = MeshBuilder.CreateSphere(
        `ctrlNode_${idx}`,
        { diameter: isSelected ? 7.5 : 5.6, segments: 14 },
        scene
      );
      sphere.parent = gizmoRoot;
      sphere.position = new Vector3(pt.x, nodeRoadY + 3.2, pt.z);
      sphere.material =
        idx === 0
          ? nodeStartMat
          : isSelected
          ? nodeSelectedMat
          : isBottleneckNode
          ? bottleneckRingMat
          : isBuckledNode
          ? buckledRingMat
          : nodeDefaultMat;
      sphere.isPickable = true;

      if (isBottleneckNode || isBuckledNode) {
        const warnRing = MeshBuilder.CreateTorus(
          `ctrlBottleneckRing_${idx}`,
          { diameter: 13.5, thickness: 0.75, tessellation: 24 },
          scene
        );
        warnRing.parent = gizmoRoot;
        warnRing.position = new Vector3(pt.x, nodeRoadY + 3.2, pt.z);
        warnRing.material = isBottleneckNode
          ? bottleneckRingMat
          : buckledRingMat;
        warnRing.isPickable = false;
      }

      // Vertical elevation stalk connecting road node down to y=0 datum
      const stalkHeight = Math.max(3.2, nodeRoadY + 3.2);
      const stalk = MeshBuilder.CreateCylinder(
        `ctrlStalk_${idx}`,
        { height: stalkHeight, diameter: 0.85, tessellation: 10 },
        scene
      );
      stalk.parent = gizmoRoot;
      stalk.position = new Vector3(pt.x, nodeRoadY + 3.2 - stalkHeight / 2, pt.z);
      stalk.material = isSelected ? nodeSelectedMat : nodeDefaultMat;
      stalk.isPickable = false;
    });

    // Render 3D Recorded AI Racing Path Traces & Off-Road Overshoot Hotspots
    if (showAiTraces && recordedAiTraces.length > 0) {
      const overshootMat = new StandardMaterial("aiOvershootMat", scene);
      overshootMat.diffuseColor = new Color3(0.96, 0.25, 0.37);
      overshootMat.emissiveColor = new Color3(0.85, 0.15, 0.28);

      recordedAiTraces.forEach((racerTrace, rIdx) => {
        const pts: Vector3[] = [];
        const cols: Color4[] = [];
        const heightOffset = 0.42 + rIdx * 0.08;

        racerTrace.pathSamples.forEach((s, sIdx) => {
          if (sIdx > 0) {
            const prev = racerTrace.pathSamples[sIdx - 1];
            const distSq =
              (s.x - prev.x) * (s.x - prev.x) + (s.z - prev.z) * (s.z - prev.z);
            if (distSq > 1600) return;
          }
          const q = splineData.queryClosestTrackPoint(new Vector3(s.x, 0, s.z));
          const y = q.roadY + heightOffset;
          pts.push(new Vector3(s.x, y, s.z));

          const sampleColor = getAiTraceSampleColors(s, traceColorMode);
          cols.push(sampleColor.color4);

          if (
            s.surface === "OFFROAD" &&
            !s.boosting &&
            !s.combatDisrupted &&
            sIdx % 2 === 0
          ) {
            const dot = MeshBuilder.CreateSphere(
              `aiOvershoot_${rIdx}_${sIdx}`,
              { diameter: 1.5, segments: 8 },
              scene
            );
            dot.parent = gizmoRoot;
            dot.position = new Vector3(s.x, y + 0.35, s.z);
            dot.material = overshootMat;
            dot.isPickable = false;
          }
        });

        if (pts.length >= 2) {
          const lineMesh = MeshBuilder.CreateLines(
            `aiTrace3d_${racerTrace.racerId}`,
            { points: pts, colors: cols, useVertexAlpha: true },
            scene
          );
          lineMesh.parent = gizmoRoot;
          lineMesh.isPickable = false;
        }
      });
    }
  }, [
    trackDef,
    selectedControlIdx,
    viewportLayout,
    splineData,
    showAiTraces,
    traceColorMode,
    recordedAiTraces,
    bottleneckNodeMap,
    buckledNodeSet,
  ]);

  // Convert client mouse coordinates to World (X, Z) on the 2D SVG blueprint
  const clientToWorld2D = (
    clientX: number,
    clientY: number
  ): { x: number; z: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const baseSpan = 680 / zoom;
    const aspect = rect.width / rect.height;
    const vbW = baseSpan * aspect;
    const vbH = baseSpan;
    const vbX = pan.x - vbW / 2;
    const vbY = pan.y - vbH / 2;

    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;

    const svgX = vbX + normX * vbW;
    const svgY = vbY + normY * vbH;

    return {
      x: Number(svgX.toFixed(1)),
      z: Number((-svgY).toFixed(1)),
    };
  };

  const handle2DPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || e.shiftKey) {
      setIsPanning2D(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }
    const world = clientToWorld2D(e.clientX, e.clientY);
    if (!world) return;
    applyToolAtWorldPoint(world.x, world.z);
  };

  const handle2DPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPanning2D && panStartRef.current && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const baseSpan = 680 / zoom;
      const unitsPerPx = baseSpan / rect.height;
      const dx = (e.clientX - panStartRef.current.clientX) * unitsPerPx;
      const dy = (e.clientY - panStartRef.current.clientY) * unitsPerPx;
      setPan({
        x: panStartRef.current.panX - dx,
        y: panStartRef.current.panY - dy,
      });
      return;
    }

    if (draggingNodeIdx !== null) {
      const world = clientToWorld2D(e.clientX, e.clientY);
      if (!world) return;
      const nextPts = trackDef.controlPoints.map((pt, idx) =>
        idx === draggingNodeIdx ? { ...pt, x: world.x, z: world.z } : pt
      );
      // Automatically regenerate procedural trackside scenery & clear overlapped trees off the road!
      commitWorkingEdit(
        syncTracksideSceneryAndClearRoad({
          ...trackDef,
          controlPoints: nextPts,
        }),
        false
      );
    }
  };

  const handle2DPointerUp = () => {
    setDraggingNodeIdx(null);
    setIsPanning2D(false);
    panStartRef.current = null;
  };

  const handleRerollProceduralScenery = () => {
    const nextSeed = (trackDef.scenerySeed ?? 0) + 1;
    commitWorkingEdit(
      syncTracksideSceneryAndClearRoad({
        ...trackDef,
        autoTracksideScenery: true,
        scenerySeed: nextSeed,
      })
    );
  };

  const handleInsertControlPointAfter = () => {
    const pts = trackDef.controlPoints;
    const idxA = selectedControlIdx % pts.length;
    const idxB = (idxA + 1) % pts.length;
    const mid = {
      x: Number(((pts[idxA].x + pts[idxB].x) * 0.5).toFixed(1)),
      y: Number(((pts[idxA].y + pts[idxB].y) * 0.5).toFixed(1)),
      z: Number(((pts[idxA].z + pts[idxB].z) * 0.5).toFixed(1)),
    };
    const nextPts = [
      ...pts.slice(0, idxA + 1),
      mid,
      ...pts.slice(idxA + 1),
    ];
    commitWorkingEdit(
      syncTracksideSceneryAndClearRoad({
        ...trackDef,
        controlPoints: nextPts,
      })
    );
    setSelectedControlIdx(idxA + 1);
  };

  const handleDeleteSelectedControlPoint = () => {
    if (trackDef.controlPoints.length <= 4) return;
    const nextPts = trackDef.controlPoints.filter(
      (_, idx) => idx !== selectedControlIdx
    );
    commitWorkingEdit(
      syncTracksideSceneryAndClearRoad({
        ...trackDef,
        controlPoints: nextPts,
      })
    );
    setSelectedControlIdx(Math.max(0, selectedControlIdx - 1));
  };

  const requestSwitchCupTrack = (cupId: string, trackIdx: number) => {
    if (!onSelectCupAndTrack) return;
    if (cupId === activeCupId && trackIdx === activeTrackIdx) return;
    if (isDirty) {
      setPendingSwitchTarget({ cupId, trackIdx });
    } else {
      onSelectCupAndTrack(cupId, trackIdx);
    }
  };

  const activeCup =
    cupsCatalog.find((c) => c.id === activeCupId) ?? cupsCatalog[0];

  const isBuiltinCup = activeCup ? isBuiltinCupId(activeCup.id) : true;
  const officialDefaultForSlot = activeCup
    ? getOfficialDefaultTrack(activeCup.id, activeTrackIdx, trackDef.id)
    : null;
  const isOfficialSlot = Boolean(
    isBuiltinCup && activeTrackIdx < 3 && officialDefaultForSlot
  );
  const canDeleteCurrentTrack = Boolean(
    activeCup &&
      activeCup.tracks.length > 1 &&
      (!isBuiltinCup || activeTrackIdx >= 3)
  );

  const selectedPt =
    trackDef.controlPoints[selectedControlIdx] ?? trackDef.controlPoints[0];

  const baseSpan = 680 / zoom;
  const vbW = baseSpan * (viewportLayout === "SPLIT_3D_2D" ? 0.95 : 1.35);
  const vbH = baseSpan;
  const viewBox = `${(pan.x - vbW / 2).toFixed(1)} ${(pan.y - vbH / 2).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;

  return (
    <div
      data-testid="track-editor-screen"
      className="min-h-screen w-full bg-slate-950 text-white flex flex-col select-none"
    >
      {/* Hidden File Input for Importing Track / Cup / Catalog JSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.gutsytrack.json,.gutsycup.json,application/json"
        onChange={handleImportJsonFile}
        className="hidden"
        data-testid="editor-import-file-input"
      />

      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToMenu}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            BACK
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Compass className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                3D TERRAIN &amp; CIRCUIT STUDIO
              </span>
              {/* Dirty / Saved / Repo Commit Status Pill */}
              {repoCommitNotice ? (
                <span
                  data-testid="editor-repo-committed-badge"
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-300 bg-cyan-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-100"
                >
                  <Check className="h-3 w-3" /> {repoCommitNotice}
                </span>
              ) : ioStatusNotice ? (
                <span
                  data-testid="editor-io-notice-badge"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-100"
                >
                  {ioStatusNotice}
                </span>
              ) : justSaved ? (
                <span
                  data-testid="editor-saved-badge"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400 bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200"
                >
                  <Check className="h-3 w-3" /> SAVED TO BROWSER!
                </span>
              ) : isDirty ? (
                <span
                  data-testid="editor-dirty-badge"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200 animate-pulse"
                >
                  ● UNSAVED CHANGES
                </span>
              ) : (
                <span
                  data-testid="editor-clean-badge"
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"
                >
                  {trackDef.isUserModified
                    ? isOfficialSlot
                      ? "LOCAL BROWSER OVERRIDE"
                      : "CUSTOM CIRCUIT (SAVED)"
                    : "OFFICIAL SHIPPED DEFAULT"}
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
              {trackDef.name} • {Math.round(splineData.totalTrackLength)}m Loop
            </h1>
          </div>
        </div>

        {/* Viewport Layout Switcher: FULL 3D VIEW (Default) | Split 3D + 2D | 2D Blueprint */}
        <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-slate-950 p-1">
          <button
            type="button"
            data-testid="viewport-3d-only-btn"
            onClick={() => setViewportLayout("3D_ONLY")}
            className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
              viewportLayout === "3D_ONLY"
                ? "bg-amber-400 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            FULL 3D VIEW
          </button>
          <button
            type="button"
            data-testid="viewport-split-btn"
            onClick={() => setViewportLayout("SPLIT_3D_2D")}
            className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
              viewportLayout === "SPLIT_3D_2D"
                ? "bg-amber-400 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            SPLIT 3D + 2D
          </button>
          <button
            type="button"
            data-testid="viewport-2d-only-btn"
            onClick={() => setViewportLayout("2D_ONLY")}
            className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
              viewportLayout === "2D_ONLY"
                ? "bg-amber-400 text-slate-950"
                : "text-slate-300 hover:text-white"
            }`}
          >
            2D BLUEPRINT
          </button>
        </div>

        {/* Recorded AI Racing Paths Overlay Toggle + Heatmap Mode + Auto-Smooth Bottlenecks + Snap Pads */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-fuchsia-400/40 bg-slate-950 p-1">
          <button
            type="button"
            data-testid="editor-toggle-ai-trace-btn"
            onClick={() => setShowAiTraces((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
              showAiTraces && recordedAiTraces.length > 0
                ? "bg-fuchsia-500/30 border border-fuchsia-400 text-fuchsia-100"
                : showAiTraces
                ? "bg-slate-800 text-fuchsia-300"
                : "text-slate-400 hover:text-white"
            }`}
            title="Show or hide recorded AI racing lines & red off-road overshoot markers on this map (both 3D and 2D Blueprint)"
          >
            <Activity className="h-3.5 w-3.5 text-fuchsia-400" />
            <span>
              AI TRACE ({recordedAiTraces.length}){" "}
              {showAiTraces ? "ON" : "OFF"}
            </span>
          </button>

          {showAiTraces && recordedAiTraces.length > 0 && (
            <>
              <button
                type="button"
                data-testid="editor-cycle-trace-mode-btn"
                onClick={() =>
                  setTraceColorMode((prev) =>
                    prev === "SURFACE"
                      ? "SPEED"
                      : prev === "SPEED"
                      ? "MINI_TURBO"
                      : "SURFACE"
                  )
                }
                className="rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-2 py-1.5 text-[10px] font-black uppercase text-cyan-200 hover:bg-cyan-500/30 transition cursor-pointer"
                title="Cycle 3D/2D AI trace visualization: Surface & Drift -> Speed Heatmap -> Mini-Turbo Spark Tiers"
              >
                VIEW:{" "}
                {traceColorMode === "SURFACE"
                  ? "SURFACE / DRIFT"
                  : traceColorMode === "SPEED"
                  ? "SPEED HEATMAP"
                  : "MINI-TURBO SPARKS"}
              </button>

              <button
                type="button"
                data-testid="editor-autofix-bottlenecks-btn"
                onClick={handleAutoSmoothBottlenecks}
                disabled={bottleneckNodeMap.size === 0}
                className={`rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase transition cursor-pointer ${
                  bottleneckNodeMap.size > 0
                    ? "border-amber-400 bg-amber-500/25 text-amber-200 hover:bg-amber-500/35"
                    : "border-emerald-400/40 bg-emerald-950/50 text-emerald-300 opacity-75 cursor-default"
                }`}
                title="Automatically relax pinch angles and nudge bottleneck control nodes toward the AI racing trajectory (supports Ctrl+Z Undo)"
              >
                {bottleneckNodeMap.size > 0
                  ? `✨ AUTO-FIX BOTTLENECKS (${bottleneckNodeMap.size})`
                  : "✓ 0 BOTTLENECKS"}
              </button>

              <button
                type="button"
                data-testid="editor-snap-pads-ai-line-btn"
                onClick={handleSnapPadsAndRampsToAiLine}
                className="rounded-lg border border-indigo-400/50 bg-indigo-500/20 px-2 py-1.5 text-[10px] font-black uppercase text-indigo-200 hover:bg-indigo-500/30 transition cursor-pointer"
                title="Snap all Boost Pads and Stunt Jump Ramps laterally onto the consensus AI racing line (supports Ctrl+Z Undo)"
              >
                🧲 SNAP PADS TO AI LINE
              </button>
            </>
          )}

          <button
            type="button"
            data-testid="editor-unbuckle-corners-btn"
            onClick={handleUnbuckleCorners}
            className={`rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase transition cursor-pointer ${
              buckledNodeSet.size > 0
                ? "border-orange-400 bg-orange-500/30 text-orange-100 hover:bg-orange-500/40 animate-pulse"
                : "border-violet-400/50 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
            }`}
            title="Automatically subdivide acute bends and relax tight corners so the inner curb/road ribbon seam never buckles over itself (supports Ctrl+Z Undo)"
          >
            {buckledNodeSet.size > 0
              ? `🔧 UNBUCKLE CORNERS (${buckledNodeSet.size})`
              : "🔧 UNBUCKLE / SMOOTH"}
          </button>

          <button
            type="button"
            data-testid="editor-auto-safe-jumps-btn"
            onClick={handleAutoPlaceSafeJumps}
            className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2 py-1.5 text-[10px] font-black uppercase text-emerald-200 hover:bg-emerald-500/30 transition cursor-pointer"
            title="Automatically relocate any hazardous corner jumps and place 2-3 safe stunt jump ramps on straightaways/crests with >= 46m clear landing runways on the AI line (supports Ctrl+Z Undo)"
          >
            🚀 AUTO-PLACE SAFE JUMPS
          </button>

          <button
            type="button"
            data-testid="editor-auto-boosts-boxes-btn"
            onClick={handleAutoCurateBoostsAndBoxes}
            className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-2 py-1.5 text-[10px] font-black uppercase text-sky-200 hover:bg-sky-500/30 transition cursor-pointer"
            title="Automatically place Corner-Exit Boost Pads on the AI line and 3 grounded Item Box Rows outside mid-air jump trajectories (supports Ctrl+Z Undo)"
          >
            ⚡ AUTO-CURATE BOOSTS &amp; BOXES
          </button>

          {/* 1-Click Procedural Circuit Generator (Archetype Selector + Generate Button) */}
          <div className="flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-950/40 p-0.5">
            <select
              data-testid="editor-procedural-archetype-select"
              value={proceduralArchetype}
              onChange={(e) =>
                setProceduralArchetype(
                  e.target.value as ProceduralTrackArchetype
                )
              }
              className="rounded bg-slate-900 px-1.5 py-1 text-[10px] font-black uppercase text-amber-200 border border-amber-400/30 focus:outline-none cursor-pointer"
              title="Select procedural track shape archetype"
            >
              {PROCEDURAL_ARCHETYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="editor-generate-track-btn"
              onClick={handleGenerateProceduralTrack}
              className="inline-flex items-center gap-1 rounded bg-amber-400 px-2 py-1 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-300 transition cursor-pointer"
              title="Procedurally generate a brand-new, buckle-free circuit spline with elevation hills, safe stunt jumps, corner-exit boost pads, item boxes, and scenery (supports Ctrl+Z Undo)"
            >
              <Sparkles className="h-3 w-3" />
              GENERATE TRACK
            </button>
          </div>

          {recordedAiTraces.length > 0 && (
            <button
              type="button"
              data-testid="editor-clear-ai-trace-btn"
              onClick={() => {
                globalAiBrain.clearTrackAiTraces(trackDef.id || trackDef.name);
                setTraceTick((t) => t + 1);
              }}
              className="rounded-lg border border-rose-400/40 bg-rose-950/70 px-2 py-1.5 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-900 cursor-pointer"
              title="Clear recorded AI path traces for this map so you can record a fresh run after editing corners"
            >
              CLEAR TRACE
            </button>
          )}
        </div>

        {/* Undo / Redo / Discard / Manual Save / Repo Commit / Export-Import / Race Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="editor-undo-btn"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-slate-800 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 disabled:opacity-35 transition cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" />
            UNDO {undoStack.length > 0 && `(${undoStack.length})`}
          </button>

          <button
            type="button"
            data-testid="editor-redo-btn"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-slate-800 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 disabled:opacity-35 transition cursor-pointer"
          >
            <Redo2 className="h-3.5 w-3.5" />
            REDO
          </button>

          {isDirty && (
            <button
              type="button"
              data-testid="editor-discard-btn"
              onClick={handleDiscardChanges}
              title="Revert unsaved edits back to last saved state"
              className="flex items-center gap-1 rounded-xl border border-rose-400/50 bg-rose-500/15 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-rose-200 hover:bg-rose-500/25 transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              REVERT
            </button>
          )}

          <button
            type="button"
            data-testid="editor-save-btn"
            onClick={handleSaveMap}
            title="Save changes to browser storage (Ctrl+S)"
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wider transition cursor-pointer ${
              isDirty
                ? "border-emerald-300 bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:bg-emerald-300"
                : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            {isDirty ? "SAVE MAP *" : "SAVE MAP"}
          </button>

          {isDevEnvironment && (
            <button
              type="button"
              data-testid="editor-commit-repo-btn"
              onClick={handleCommitCatalogToRepo}
              disabled={isCommittingRepo}
              title="Write all Cups & Tracks directly to src/game/world/defaultCups.json on disk so your edits ship as the official game defaults in Git & Production!"
              className="flex items-center gap-1.5 rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 transition cursor-pointer"
            >
              <HardDriveDownload className="h-3.5 w-3.5 text-cyan-300" />
              {isCommittingRepo ? "WRITING REPO..." : "SAVE TO REPO DEFAULTS"}
            </button>
          )}

          <button
            type="button"
            data-testid="editor-export-all-maps-btn"
            onClick={handleExportAllMapsCatalogJson}
            title="Download ALL Cups & ALL Maps at once as a single defaultCups.json file ready to commit as the game defaults!"
            className="flex items-center gap-1 rounded-xl border border-amber-400/60 bg-amber-500/20 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-amber-100 hover:bg-amber-500/30 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-amber-300" />
            EXPORT ALL MAPS
          </button>

          <button
            type="button"
            data-testid="editor-export-track-btn"
            onClick={handleExportTrackJson}
            title="Download this map as a portable .gutsytrack.json file"
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-slate-800 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-amber-300" />
            EXPORT MAP
          </button>

          <button
            type="button"
            data-testid="editor-import-json-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import a .gutsytrack.json map, .gutsycup.json Cup series, or full defaultCups.json catalog from disk"
            className="flex items-center gap-1 rounded-xl border border-white/15 bg-slate-800 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-cyan-300" />
            IMPORT JSON
          </button>

          <button
            type="button"
            data-testid="auto-generate-trees-btn"
            onClick={handleRerollProceduralScenery}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/30 transition cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            FOREST ({trackDef.sceneryProps.length})
          </button>

          <button
            type="button"
            data-testid="race-custom-track-btn"
            onClick={() => onStartRaceWithTrack(trackDefRef.current)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110 transition cursor-pointer"
          >
            <Play className="h-4 w-4 fill-slate-950" />
            TEST RACE
          </button>
        </div>
      </header>

      {/* Main Editor Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Sidebar: Cup/Map Switcher, 3D Spline, 3D Terrain Sculptor, Forest, Boost Pads & Obstacles */}
        <aside className="lg:col-span-4 xl:col-span-3 border-r border-white/10 bg-slate-900/80 p-4 overflow-y-auto space-y-5 max-h-[calc(100vh-68px)]">
          {/* 0. Grand Prix Cup & Map Switcher */}
          {cupsCatalog.length > 0 && (
            <div className="rounded-2xl border border-amber-400/35 bg-slate-950/80 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5" />
                  CUPS &amp; CIRCUITS
                </span>
                <div className="flex items-center gap-1">
                  {onAddCustomCup && (
                    <button
                      type="button"
                      data-testid="editor-add-cup-btn"
                      onClick={onAddCustomCup}
                      title="Create a brand-new 3-race Custom Cup series"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-200 hover:bg-emerald-400/25 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> NEW CUP
                    </button>
                  )}
                  {onAddTrackToCup && activeCup && (
                    <button
                      type="button"
                      data-testid="editor-add-track-btn"
                      onClick={() => onAddTrackToCup(activeCup.id)}
                      title="Add a new circuit to the selected Cup"
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200 hover:bg-amber-400/25 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> NEW MAP
                    </button>
                  )}
                </div>
              </div>

              {/* Cup Tabs */}
              <div className="grid grid-cols-3 gap-1">
                {cupsCatalog.map((cup) => {
                  const isCupSelected = cup.id === activeCup?.id;
                  return (
                    <button
                      key={cup.id}
                      type="button"
                      data-testid={`editor-cup-tab-${cup.id}`}
                      onClick={() => requestSwitchCupTrack(cup.id, 0)}
                      className={`rounded-lg border px-2 py-1.5 text-center text-[10px] font-black uppercase truncate transition cursor-pointer ${
                        isCupSelected
                          ? "border-amber-400 bg-amber-400/20 text-amber-200"
                          : "border-white/10 bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      {cup.name.replace(" Cup", "")}
                    </button>
                  );
                })}
              </div>

              {/* Active Cup Actions: Export Cup Series, Export All Maps & Edit Cup Info */}
              {activeCup && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      data-testid="editor-toggle-cup-settings-btn"
                      onClick={() => setShowCupSettings((prev) => !prev)}
                      className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase text-slate-300 hover:text-white cursor-pointer"
                    >
                      {showCupSettings ? "HIDE CUP INFO" : "EDIT CUP INFO"}
                    </button>
                    <button
                      type="button"
                      data-testid="editor-export-cup-btn"
                      onClick={handleExportCupJson}
                      title="Export all maps in this Cup as a single .gutsycup.json file"
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] font-black uppercase text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
                    >
                      <Download className="h-3 w-3" /> EXPORT CUP (
                      {activeCup.tracks.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-testid="editor-sidebar-export-all-btn"
                      onClick={handleExportAllMapsCatalogJson}
                      title="Download ALL Cups & ALL Maps in the game as a single defaultCups.json file"
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-400/50 bg-amber-500/20 px-2 py-1.5 text-[10px] font-black uppercase text-amber-100 hover:bg-amber-500/30 cursor-pointer"
                    >
                      <Download className="h-3 w-3 text-amber-300" /> EXPORT ALL MAPS
                    </button>
                    <button
                      type="button"
                      data-testid="editor-sidebar-copy-all-btn"
                      onClick={handleCopyAllMapsCatalogJson}
                      title="Copy the entire defaultCups.json (all Cups & Maps) to your clipboard"
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2 py-1.5 text-[10px] font-black uppercase text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
                    >
                      📋 COPY ALL MAPS JSON
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible Cup Metadata Editor (Name, Subtitle, Color, Delete Custom Cup) */}
              {activeCup && showCupSettings && (
                <div className="rounded-xl border border-white/15 bg-slate-900/90 p-2.5 space-y-2">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      CUP SERIES NAME
                    </label>
                    <input
                      type="text"
                      data-testid="editor-cup-name-input"
                      value={activeCup.name}
                      onChange={(e) =>
                        onUpdateCupMeta?.(activeCup.id, {
                          name: e.target.value,
                        })
                      }
                      className="mt-0.5 w-full rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      CUP SUBTITLE
                    </label>
                    <input
                      type="text"
                      data-testid="editor-cup-subtitle-input"
                      value={activeCup.subtitle}
                      onChange={(e) =>
                        onUpdateCupMeta?.(activeCup.id, {
                          subtitle: e.target.value,
                        })
                      }
                      className="mt-0.5 w-full rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1">
                      {[
                        "#f59e0b",
                        "#06b6d4",
                        "#f43f5e",
                        "#10b981",
                        "#a855f7",
                        "#3b82f6",
                      ].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            onUpdateCupMeta?.(activeCup.id, {
                              badgeColor: hex,
                            })
                          }
                          style={{ backgroundColor: hex }}
                          className={`h-4 w-4 rounded-full border ${
                            activeCup.badgeColor === hex
                              ? "border-white scale-110"
                              : "border-transparent opacity-70"
                          } cursor-pointer`}
                        />
                      ))}
                    </div>
                    {!isBuiltinCup && cupsCatalog.length > 1 && onDeleteCustomCup && (
                      <button
                        type="button"
                        data-testid="editor-delete-cup-btn"
                        onClick={() => {
                          onDeleteCustomCup(activeCup.id);
                          setShowCupSettings(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" /> DELETE CUP
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Tracks inside Selected Cup */}
              {activeCup && (
                <div className="space-y-1">
                  {activeCup.tracks.map((t, idx) => {
                    const isTrackActive =
                      activeCup.id === activeCupId && idx === activeTrackIdx;
                    const displayMod = isTrackActive
                      ? trackDef.isUserModified
                      : t.isUserModified;
                    return (
                      <button
                        key={t.id ?? idx}
                        type="button"
                        data-testid={`editor-track-item-${idx}`}
                        onClick={() => requestSwitchCupTrack(activeCup.id, idx)}
                        className={`w-full flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                          isTrackActive
                            ? "border-cyan-400 bg-cyan-500/20 text-white font-black"
                            : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
                        }`}
                      >
                        <span className="truncate flex items-center gap-1.5">
                          <span className="text-amber-300 font-mono">
                            R{idx + 1}
                          </span>
                          <span className="truncate">
                            {isTrackActive ? trackDef.name : t.name}
                          </span>
                          {displayMod && (
                            <span className="rounded bg-amber-400/20 border border-amber-400/40 px-1 text-[8px] font-black uppercase text-amber-200 shrink-0">
                              EDITED
                            </span>
                          )}
                        </span>
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Unsaved Changes Prompt when switching tracks */}
              {pendingSwitchTarget && (
                <div className="rounded-xl border border-amber-400 bg-amber-950/80 p-2.5 text-xs space-y-2">
                  <div className="font-black text-amber-200">
                    You have unsaved changes on {trackDef.name}!
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleSaveMap();
                        onSelectCupAndTrack?.(
                          pendingSwitchTarget.cupId,
                          pendingSwitchTarget.trackIdx
                        );
                        setPendingSwitchTarget(null);
                      }}
                      className="flex-1 rounded-lg bg-emerald-400 py-1 text-[10px] font-black uppercase text-slate-950 cursor-pointer"
                    >
                      SAVE &amp; SWITCH
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDiscardChanges();
                        onSelectCupAndTrack?.(
                          pendingSwitchTarget.cupId,
                          pendingSwitchTarget.trackIdx
                        );
                        setPendingSwitchTarget(null);
                      }}
                      className="flex-1 rounded-lg bg-rose-500/80 py-1 text-[10px] font-black uppercase text-white cursor-pointer"
                    >
                      DISCARD
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingSwitchTarget(null)}
                      className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300 cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}

              {/* Track Name Editor + Official Default Reset / Delete Custom Map */}
              <div className="pt-1.5 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    CIRCUIT NAME
                  </label>
                  <div className="flex items-center gap-1.5">
                    {isOfficialSlot &&
                      (trackDef.isUserModified || isDirty) && (
                        <button
                          type="button"
                          data-testid="editor-reset-official-btn"
                          onClick={handleResetCurrentTrackToOfficial}
                          title="Discard local browser overrides and restore the official shipped circuit"
                          className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-200 hover:bg-amber-500/25 cursor-pointer"
                        >
                          <RotateCcw className="h-2.5 w-2.5" /> RESET OFFICIAL
                        </button>
                      )}
                    {canDeleteCurrentTrack &&
                      activeCup &&
                      onDeleteTrackFromCup && (
                        <button
                          type="button"
                          data-testid="editor-delete-track-btn"
                          onClick={() =>
                            onDeleteTrackFromCup(activeCup.id, activeTrackIdx)
                          }
                          title="Delete this custom circuit from the Cup"
                          className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-200 hover:bg-rose-500/25 cursor-pointer"
                        >
                          <Trash2 className="h-2.5 w-2.5" /> DELETE MAP
                        </button>
                      )}
                  </div>
                </div>
                <input
                  type="text"
                  value={trackDef.name}
                  onChange={(e) =>
                    commitWorkingEdit({
                      ...trackDef,
                      name: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 1. Track Spline & 3D Elevation Tools */}
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-amber-300 mb-2 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              1. TRACK SPLINE &amp; 3D ELEVATION
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveTool({ kind: "SPLINE" })}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-black transition cursor-pointer ${
                  activeTool.kind === "SPLINE"
                    ? "border-amber-400 bg-amber-400/20 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <MousePointer className="h-4 w-4 text-amber-400 shrink-0" />
                <div>
                  <div>MOVE SPLINE (X/Z)</div>
                  <div className="text-[10px] font-normal text-slate-400">
                    Auto-clears trees
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool({ kind: "SPLINE_ELEVATION" })}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-black transition cursor-pointer ${
                  activeTool.kind === "SPLINE_ELEVATION"
                    ? "border-cyan-400 bg-cyan-400/20 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <ArrowUpDown className="h-4 w-4 text-cyan-400 shrink-0" />
                <div>
                  <div>HILL HEIGHT (Y)</div>
                  <div className="text-[10px] font-normal text-slate-400">
                    Drag node up/down
                  </div>
                </div>
              </button>
            </div>

            {/* Road Width & Selected Spline Node Controls */}
            <div className="mt-2.5 rounded-xl border border-white/10 bg-slate-950/70 p-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-400">ROAD WIDTH</span>
                  <span className="text-amber-300 font-mono">
                    {(trackDef.roadHalfWidth * 2).toFixed(0)}m
                  </span>
                </div>
                <input
                  type="range"
                  min={9}
                  max={20}
                  step={0.5}
                  value={trackDef.roadHalfWidth}
                  onChange={(e) =>
                    commitWorkingEdit(
                      syncTracksideSceneryAndClearRoad({
                        ...trackDef,
                        roadHalfWidth: parseFloat(e.target.value),
                      })
                    )
                  }
                  className="mt-1 w-full accent-amber-400 cursor-pointer"
                />
              </div>

              {selectedPt && (
                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">
                      NODE P{selectedControlIdx} 3D ELEVATION (Y)
                    </span>
                    <span className="text-cyan-300 font-mono">
                      {selectedPt.y.toFixed(1)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={22}
                    step={0.5}
                    value={selectedPt.y}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      const nextPts = trackDef.controlPoints.map((pt, i) =>
                        i === selectedControlIdx ? { ...pt, y: val } : pt
                      );
                      commitWorkingEdit({
                        ...trackDef,
                        controlPoints: nextPts,
                      });
                    }}
                    className="mt-1 w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleInsertControlPointAfter}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 py-1.5 text-[11px] font-bold text-cyan-300 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> INSERT NODE
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelectedControlPoint}
                      disabled={trackDef.controlPoints.length <= 4}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 py-1.5 text-[11px] font-bold text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> REMOVE NODE
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. 3D Terrain Sculptor (Raise Mountain, Lower Valley, Flatten, Hill Scale) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                <Mountain className="h-3.5 w-3.5" />
                2. 3D TERRAIN SCULPTING BRUSHES
              </span>
              {(trackDef.terrainMods?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    commitWorkingEdit({ ...trackDef, terrainMods: [] })
                  }
                  className="text-[10px] font-bold text-rose-400 hover:underline cursor-pointer"
                >
                  Reset Sculpt ({trackDef.terrainMods?.length})
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTool({ kind: "TERRAIN_RAISE" })}
                className={`rounded-xl border p-2 text-center transition cursor-pointer ${
                  activeTool.kind === "TERRAIN_RAISE"
                    ? "border-emerald-400 bg-emerald-500/25 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <div className="text-[11px] font-black text-emerald-300">
                  + RAISE HILL
                </div>
                <div className="text-[9px] text-slate-400">Click terrain</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool({ kind: "TERRAIN_LOWER" })}
                className={`rounded-xl border p-2 text-center transition cursor-pointer ${
                  activeTool.kind === "TERRAIN_LOWER"
                    ? "border-amber-400 bg-amber-500/25 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <div className="text-[11px] font-black text-amber-300">
                  - LOWER VALLEY
                </div>
                <div className="text-[9px] text-slate-400">Carve basin</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool({ kind: "TERRAIN_FLATTEN" })}
                className={`rounded-xl border p-2 text-center transition cursor-pointer ${
                  activeTool.kind === "TERRAIN_FLATTEN"
                    ? "border-cyan-400 bg-cyan-500/25 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <div className="text-[11px] font-black text-cyan-300">
                  SMOOTH / ERASE
                </div>
                <div className="text-[9px] text-slate-400">Clear mounds</div>
              </button>
            </div>

            <div className="mt-2.5 rounded-xl border border-white/10 bg-slate-950/70 p-3 space-y-2.5">
              <div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-400">GLOBAL HILLINESS SCALE</span>
                  <span className="text-emerald-300 font-mono">
                    {(trackDef.terrainHillScale ?? 1.0).toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2.6}
                  step={0.1}
                  value={trackDef.terrainHillScale ?? 1.0}
                  onChange={(e) =>
                    commitWorkingEdit({
                      ...trackDef,
                      terrainHillScale: parseFloat(e.target.value),
                    })
                  }
                  className="mt-1 w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/10">
                <div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-400">BRUSH SIZE</span>
                    <span className="text-emerald-300 font-mono">
                      {brushRadius}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={25}
                    max={120}
                    step={5}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(parseFloat(e.target.value))}
                    className="mt-1 w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-400">PEAK HEIGHT</span>
                    <span className="text-emerald-300 font-mono">
                      {brushStrength}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={1}
                    value={brushStrength}
                    onChange={(e) =>
                      setBrushStrength(parseFloat(e.target.value))
                    }
                    className="mt-1 w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Procedural Trackside Scenery (Auto-Follows Spline + Manual Stamp) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                <Trees className="h-3.5 w-3.5" />
                3. TRACKSIDE SCENERY ({trackDef.sceneryProps.length})
              </span>
              <button
                type="button"
                onClick={() => setActiveTool({ kind: "ERASER" })}
                className={`text-[10px] font-black px-2 py-0.5 rounded border cursor-pointer ${
                  activeTool.kind === "ERASER"
                    ? "border-rose-400 bg-rose-500/25 text-rose-200"
                    : "border-white/15 bg-slate-800 text-slate-300"
                }`}
              >
                ERASER TOOL
              </button>
            </div>

            <div className="mb-2.5 rounded-xl border border-emerald-400/30 bg-emerald-950/25 p-3 space-y-2">
              <label className="flex items-center justify-between text-xs font-bold cursor-pointer">
                <span className="text-emerald-200">
                  Auto-Follow Spline &amp; Clear Road
                </span>
                <input
                  type="checkbox"
                  checked={trackDef.autoTracksideScenery !== false}
                  onChange={(e) =>
                    commitWorkingEdit(
                      syncTracksideSceneryAndClearRoad({
                        ...trackDef,
                        autoTracksideScenery: e.target.checked,
                      })
                    )
                  }
                  className="h-4 w-4 accent-emerald-400"
                />
              </label>

              <div>
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">FOREST &amp; PROP DENSITY</span>
                  <span className="text-emerald-300 font-mono">
                    {Math.round((trackDef.sceneryDensity ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={1.8}
                  step={0.1}
                  value={trackDef.sceneryDensity ?? 1.0}
                  onChange={(e) =>
                    commitWorkingEdit(
                      syncTracksideSceneryAndClearRoad({
                        ...trackDef,
                        sceneryDensity: parseFloat(e.target.value),
                      })
                    )
                  }
                  className="mt-1 w-full accent-emerald-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {SCENERY_LIBRARY.map((prefab) => {
                const selected =
                  activeTool.kind === "SCENERY" &&
                  activeTool.prefab === prefab.type;
                return (
                  <button
                    key={prefab.type}
                    type="button"
                    onClick={() =>
                      setActiveTool({ kind: "SCENERY", prefab: prefab.type })
                    }
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      selected
                        ? "border-emerald-400 bg-emerald-500/20 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: prefab.color }}
                      />
                      <span className="text-[11px] font-black truncate">
                        {prefab.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Speed Boost Pads, Item Box Rows & Obstacles */}
          <div>
            <div className="text-[11px] font-black uppercase tracking-widest text-yellow-300 mb-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              4. BOOST PADS, POWER-UPS &amp; OBSTACLES
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setActiveTool({ kind: "BOOST_PAD" })}
                className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                  activeTool.kind === "BOOST_PAD"
                    ? "border-yellow-400 bg-yellow-400/20 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-yellow-300">
                    BOOST PAD ({trackDef.boostPads.length})
                  </span>
                  <Flame className="h-3.5 w-3.5 text-yellow-400" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool({ kind: "ITEM_ROW" })}
                className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                  activeTool.kind === "ITEM_ROW"
                    ? "border-cyan-400 bg-cyan-400/20 text-white"
                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-cyan-300">
                    ITEM ROW ({trackDef.itemBoxRows.length})
                  </span>
                  <Box className="h-3.5 w-3.5 text-cyan-400" />
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {OBSTACLE_LIBRARY.map((obs) => {
                const selected =
                  activeTool.kind === "OBSTACLE" &&
                  activeTool.prefab === obs.type;
                return (
                  <button
                    key={obs.type}
                    type="button"
                    onClick={() =>
                      setActiveTool({ kind: "OBSTACLE", prefab: obs.type })
                    }
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      selected
                        ? "border-orange-400 bg-orange-500/20 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: obs.color }}
                      />
                      <span className="text-[11px] font-black truncate">
                        {obs.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Main Area: 3D Babylon.js Viewport + 2D Overhead Blueprint */}
        <main
          className={`lg:col-span-8 xl:col-span-9 grid ${
            viewportLayout === "SPLIT_3D_2D"
              ? "grid-cols-1 xl:grid-cols-2"
              : "grid-cols-1"
          } h-[calc(100vh-68px)] overflow-hidden bg-slate-950`}
        >
          {/* 3D Interactive Babylon.js Viewport */}
          {viewportLayout !== "2D_ONLY" && (
            <div className="relative h-full w-full border-r border-white/10 overflow-hidden">
              <canvas
                ref={canvas3dRef}
                data-testid="editor-3d-canvas"
                className="h-full w-full block outline-none touch-none"
              />

              {/* 3D Camera Preset Overlay */}
              <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 pointer-events-auto">
                <span className="rounded-lg bg-slate-950/85 border border-white/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300 backdrop-blur-md">
                  3D TERRAIN VIEW (Right-Drag Orbit • Scroll Zoom)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cam = camera3dRef.current;
                    if (cam) {
                      cam.alpha = -Math.PI / 2.2;
                      cam.beta = 0.72;
                      cam.radius = 460;
                      cam.target.set(110, 0, -35);
                    }
                  }}
                  className="rounded-lg bg-slate-900/90 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  3D PERSPECTIVE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cam = camera3dRef.current;
                    if (cam) {
                      cam.alpha = -Math.PI / 2;
                      cam.beta = 0.1;
                      cam.radius = 560;
                      cam.target.set(110, 0, -35);
                    }
                  }}
                  className="rounded-lg bg-slate-900/90 border border-white/15 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  3D TOP-DOWN
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool({ kind: "ORBIT_CAM" })}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                    activeTool.kind === "ORBIT_CAM"
                      ? "border-amber-400 bg-amber-400 text-slate-950"
                      : "border-white/15 bg-slate-900/90 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Eye className="inline h-3 w-3 mr-1" />
                  FREE ORBIT
                </button>
              </div>

              {/* AI Path Trace Legend Banner in 3D Viewport */}
              {showAiTraces && recordedAiTraces.length > 0 && (
                <div className="absolute bottom-3 left-3 z-10 pointer-events-auto flex flex-wrap items-center gap-2.5 rounded-xl border border-fuchsia-400/50 bg-slate-950/90 px-3 py-1.5 text-[10px] font-bold backdrop-blur-md shadow-xl">
                  <span className="text-fuchsia-300 font-black uppercase">
                    3D TRACE ({traceColorMode}):
                  </span>
                  {traceColorMode === "SPEED" ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-rose-300">
                        <span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;65% Scrub
                      </span>
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <span className="h-2 w-2 rounded-full bg-orange-500" /> 65–85% Accel
                      </span>
                      <span className="inline-flex items-center gap-1 text-yellow-300">
                        <span className="h-2 w-2 rounded-full bg-yellow-400" /> 85–98% Cruise
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> 100% Top Spd
                      </span>
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> &gt;108% Boosted
                      </span>
                    </>
                  ) : traceColorMode === "MINI_TURBO" ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-yellow-200">
                        <span className="h-2 w-2 rounded-full bg-yellow-300" /> Drift Start
                      </span>
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> Tier 1 Blue
                      </span>
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <span className="h-2 w-2 rounded-full bg-orange-500" /> Tier 2 Orange
                      </span>
                      <span className="inline-flex items-center gap-1 text-fuchsia-300">
                        <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Tier 3 Purple
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Boost Release
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> On-Track
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <span className="h-2 w-2 rounded-full bg-amber-400" /> Drifting
                      </span>
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> Boosted Cut
                      </span>
                      <span className="inline-flex items-center gap-1 text-rose-300 font-black">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white/70" /> Off-Road Overshoot
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2D Overhead Interactive Blueprint Viewport */}
          {viewportLayout !== "3D_ONLY" && (
            <div className="relative h-full w-full overflow-hidden flex flex-col">
              <div className="absolute top-3 left-3 z-10 pointer-events-none">
                <span className="rounded-lg bg-slate-950/85 border border-white/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-cyan-300 backdrop-blur-md">
                  2D OVERHEAD SPLINE &amp; CONTOUR MAP (Drag P0..Pn)
                </span>
              </div>

              {/* AI Path Trace Legend Banner in 2D Blueprint Viewport */}
              {showAiTraces && recordedAiTraces.length > 0 && (
                <div className="absolute bottom-3 left-3 z-10 pointer-events-none flex flex-wrap items-center gap-2.5 rounded-xl border border-fuchsia-400/50 bg-slate-950/90 px-3 py-1.5 text-[10px] font-bold backdrop-blur-md shadow-xl">
                  <span className="text-fuchsia-300 font-black uppercase">
                    2D TRACE ({traceColorMode}):
                  </span>
                  {traceColorMode === "SPEED" ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-rose-300">
                        <span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;65% Scrub
                      </span>
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <span className="h-2 w-2 rounded-full bg-orange-500" /> 65–85% Accel
                      </span>
                      <span className="inline-flex items-center gap-1 text-yellow-300">
                        <span className="h-2 w-2 rounded-full bg-yellow-400" /> 85–98% Cruise
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> 100% Top Spd
                      </span>
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> &gt;108% Boosted
                      </span>
                    </>
                  ) : traceColorMode === "MINI_TURBO" ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-yellow-200">
                        <span className="h-2 w-2 rounded-full bg-yellow-300" /> Drift Start
                      </span>
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> Tier 1 Blue
                      </span>
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <span className="h-2 w-2 rounded-full bg-orange-500" /> Tier 2 Orange
                      </span>
                      <span className="inline-flex items-center gap-1 text-fuchsia-300">
                        <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> Tier 3 Purple
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Boost Release
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> On-Track
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <span className="h-2 w-2 rounded-full bg-amber-400" /> Drifting
                      </span>
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" /> Boosted Cut
                      </span>
                      <span className="inline-flex items-center gap-1 text-rose-300 font-black">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white/70" /> Off-Road Overshoot
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl border border-white/15 bg-slate-900/90 p-1 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.6, z * 1.25))}
                  className="rounded-lg bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.45, z / 1.25))}
                  className="rounded-lg bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1.0);
                    setPan({ x: 110, y: 35 });
                  }}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  CENTER
                </button>
              </div>

              <svg
                ref={svgRef}
                viewBox={viewBox}
                onPointerDown={handle2DPointerDown}
                onPointerMove={handle2DPointerMove}
                onPointerUp={handle2DPointerUp}
                className="w-full h-full flex-1 touch-none cursor-crosshair bg-[#0d1f14]"
              >
                <defs>
                  <pattern
                    id="editorGrid"
                    width="50"
                    height="50"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 50 0 L 0 0 0 50"
                      fill="none"
                      stroke="#1e3a28"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect
                  x="-2000"
                  y="-2000"
                  width="4000"
                  height="4000"
                  fill="url(#editorGrid)"
                />

                {/* Sculpted Terrain Hill / Valley Contour Rings */}
                {(trackDef.terrainMods ?? []).map((mod) => (
                  <circle
                    key={mod.id}
                    cx={mod.x}
                    cy={-mod.z}
                    r={mod.radius}
                    fill={
                      mod.deltaY >= 0
                        ? "rgba(52, 211, 153, 0.16)"
                        : "rgba(251, 191, 36, 0.16)"
                    }
                    stroke={mod.deltaY >= 0 ? "#34d399" : "#fbbf24"}
                    strokeWidth={1.2}
                    strokeDasharray="6 4"
                  />
                ))}

                {/* 1. Outer Grass/Dirt Runoff Perimeter Zone */}
                <path
                  d={svgPathString}
                  fill="none"
                  stroke="#3f2e1e"
                  strokeWidth={(trackDef.roadHalfWidth + 12.5) * 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.55}
                />

                {/* 2. Red/White Rumble Strip Curb Outline */}
                <path
                  d={svgPathString}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={(trackDef.roadHalfWidth + 1.6) * 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />

                {/* 3. Asphalt Road Ribbon */}
                <path
                  d={svgPathString}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={trackDef.roadHalfWidth * 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* 4. Dashed Yellow Centerline */}
                <path
                  d={svgPathString}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth={1.6}
                  strokeDasharray="10 10"
                  opacity={0.85}
                />

                {/* 4b. Recorded AI Racing Path Traces & Off-Road Overshoot Hotspots */}
                {showAiTraces &&
                  recordedAiTraces.map((racerTrace) => (
                    <g
                      key={`ai_trace_${racerTrace.racerId}`}
                      className="pointer-events-none"
                    >
                      {racerTrace.pathSamples.map((s, idx) => {
                        if (idx === 0) return null;
                        const prev = racerTrace.pathSamples[idx - 1];
                        const distSq =
                          (s.x - prev.x) * (s.x - prev.x) +
                          (s.z - prev.z) * (s.z - prev.z);
                        if (distSq > 1600) return null;
                        const isUnboostedOffRoad =
                          s.surface === "OFFROAD" &&
                          !s.boosting &&
                          !s.combatDisrupted;
                        const strokeColor = getAiTraceSampleColors(
                          s,
                          traceColorMode
                        ).hex;
                        return (
                          <React.Fragment key={idx}>
                            <line
                              x1={prev.x}
                              y1={-prev.z}
                              x2={s.x}
                              y2={-s.z}
                              stroke={strokeColor}
                              strokeWidth={isUnboostedOffRoad ? 2.8 : 1.9}
                              strokeOpacity={0.92}
                              strokeLinecap="round"
                            />
                            {isUnboostedOffRoad && idx % 2 === 0 && (
                              <circle
                                cx={s.x}
                                cy={-s.z}
                                r={2.2}
                                fill="#f43f5e"
                                stroke="#ffffff"
                                strokeWidth={0.6}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </g>
                  ))}

                {/* 5. Start / Finish Line Banner */}
                {splineData.samples.length > 0 && (() => {
                  const s0 = splineData.samples[0];
                  const p1 = s0.position.subtract(
                    s0.binormal.scale(trackDef.roadHalfWidth)
                  );
                  const p2 = s0.position.add(
                    s0.binormal.scale(trackDef.roadHalfWidth)
                  );
                  return (
                    <line
                      x1={p1.x}
                      y1={-p1.z}
                      x2={p2.x}
                      y2={-p2.z}
                      stroke="#ffffff"
                      strokeWidth={4.5}
                      strokeDasharray="4 4"
                    />
                  );
                })()}

                {/* 6. Placed Scenery Prefabs */}
                {trackDef.sceneryProps.map((prop) => {
                  const meta =
                    SCENERY_LIBRARY.find((s) => s.type === prop.type) ??
                    SCENERY_LIBRARY[0];
                  const r =
                    prop.type === "GRANDSTAND"
                      ? 9.0
                      : prop.type === "SUBURBAN_HOUSE"
                      ? 6.0
                      : prop.type === "OAK_TREE"
                      ? 4.0 * prop.scale
                      : prop.type === "PINE_TREE"
                      ? 3.4 * prop.scale
                      : 2.5 * prop.scale;
                  return (
                    <g
                      key={prop.id}
                      transform={`translate(${prop.x}, ${-prop.z})`}
                      onClick={(e) => {
                        if (activeTool.kind === "ERASER") {
                          e.stopPropagation();
                          commitWorkingEdit({
                            ...trackDef,
                            sceneryProps: trackDef.sceneryProps.filter(
                              (p) => p.id !== prop.id
                            ),
                          });
                        }
                      }}
                    >
                      <circle
                        cx={0}
                        cy={0}
                        r={r}
                        fill={meta.color}
                        stroke="#052e16"
                        strokeWidth={1}
                      />
                    </g>
                  );
                })}

                {/* 7. Speed Boost Pads */}
                {trackDef.boostPads.map((pad) => {
                  const sample = splineData.getPointAtNormalizedT(
                    pad.normT,
                    pad.lateral
                  );
                  const angleDeg =
                    (Math.atan2(sample.tangent.x, sample.tangent.z) * 180) /
                    Math.PI;
                  return (
                    <g
                      key={pad.id}
                      transform={`translate(${sample.position.x.toFixed(1)}, ${(-sample.position.z).toFixed(1)}) rotate(${angleDeg.toFixed(1)})`}
                      onClick={(e) => {
                        if (activeTool.kind === "ERASER") {
                          e.stopPropagation();
                          commitWorkingEdit({
                            ...trackDef,
                            boostPads: trackDef.boostPads.filter(
                              (b) => b.id !== pad.id
                            ),
                          });
                        }
                      }}
                    >
                      <rect
                        x={-2.6}
                        y={-3.6}
                        width={5.2}
                        height={7.2}
                        rx={1}
                        fill="#18181b"
                        stroke="#facc15"
                        strokeWidth={1.2}
                      />
                    </g>
                  );
                })}

                {/* 8. Item Box Rows */}
                {trackDef.itemBoxRows.map((row) => {
                  const offsets = [-8.4, -2.8, 2.8, 8.4];
                  return (
                    <g
                      key={row.id}
                      onClick={(e) => {
                        if (activeTool.kind === "ERASER") {
                          e.stopPropagation();
                          commitWorkingEdit({
                            ...trackDef,
                            itemBoxRows: trackDef.itemBoxRows.filter(
                              (r) => r.id !== row.id
                            ),
                          });
                        }
                      }}
                    >
                      {offsets.map((lat, idx) => {
                        const pt = splineData.getPointAtNormalizedT(
                          row.normT,
                          lat
                        ).position;
                        return (
                          <rect
                            key={idx}
                            x={pt.x - 1.5}
                            y={-pt.z - 1.5}
                            width={3}
                            height={3}
                            fill="#22d3ee"
                            stroke="#facc15"
                            strokeWidth={1}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* 9. Obstacles */}
                {trackDef.obstacles.map((obs) => {
                  const meta =
                    OBSTACLE_LIBRARY.find((o) => o.type === obs.type) ??
                    OBSTACLE_LIBRARY[0];
                  return (
                    <circle
                      key={obs.id}
                      cx={obs.x}
                      cy={-obs.z}
                      r={3.5 * (obs.scale || 1)}
                      fill={meta.color}
                      stroke="#ffffff"
                      strokeWidth={1.2}
                      onClick={(e) => {
                        if (activeTool.kind === "ERASER") {
                          e.stopPropagation();
                          commitWorkingEdit({
                            ...trackDef,
                            obstacles: trackDef.obstacles.filter(
                              (o) => o.id !== obs.id
                            ),
                          });
                        }
                      }}
                    />
                  );
                })}

                {/* 10. Draggable Catmull-Rom Spline Control Points (P0..Pn) */}
                {trackDef.controlPoints.map((pt, idx) => {
                  const isSelected = idx === selectedControlIdx;
                  const isBottleneckNode =
                    showAiTraces && bottleneckNodeMap.has(idx);
                  const isBuckledNode = buckledNodeSet.has(idx);
                  return (
                    <g
                      key={idx}
                      transform={`translate(${pt.x}, ${-pt.z})`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedControlIdx(idx);
                        if (
                          activeTool.kind === "SPLINE" ||
                          activeTool.kind === "SPLINE_ELEVATION"
                        ) {
                          pushUndoSnapshot();
                          setDraggingNodeIdx(idx);
                        }
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      {(isBottleneckNode || isBuckledNode) && (
                        <circle
                          cx={0}
                          cy={0}
                          r={12.5}
                          fill={
                            isBottleneckNode
                              ? "rgba(244, 63, 94, 0.22)"
                              : "rgba(249, 115, 22, 0.22)"
                          }
                          stroke={isBottleneckNode ? "#fb7185" : "#fb923c"}
                          strokeWidth={1.8}
                          strokeDasharray="3 2"
                        />
                      )}
                      <circle
                        cx={0}
                        cy={0}
                        r={isSelected ? 7.5 : 5.8}
                        fill={
                          idx === 0
                            ? "#facc15"
                            : isSelected
                            ? "#38bdf8"
                            : isBottleneckNode
                            ? "#f43f5e"
                            : isBuckledNode
                            ? "#f97316"
                            : "#f8fafc"
                        }
                        stroke="#0f172a"
                        strokeWidth={2.2}
                      />
                      <text
                        x={0}
                        y={-10}
                        textAnchor="middle"
                        fill={
                          isBottleneckNode
                            ? "#fda4af"
                            : isBuckledNode
                            ? "#fdba74"
                            : "#f8fafc"
                        }
                        fontSize="8.5"
                        fontWeight="bold"
                      >
                        P{idx} ({pt.y.toFixed(0)}m)
                        {isBottleneckNode ? " ⚠️" : isBuckledNode ? " 🔧" : ""}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
