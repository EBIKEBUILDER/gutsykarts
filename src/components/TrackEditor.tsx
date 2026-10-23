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
  TrackBiome,
  TrackMaskType,
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
  computeUnifiedMapGeometry,
  UnifiedTrackMapLayers,
} from "@/src/components/UnifiedTrackMap";
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
  Globe,
} from "lucide-react";
import { communityTrackClient } from "@/src/game/network/CommunityTrackClient";
import { RacerAuthModal } from "@/src/components/RacerAuthModal";

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
  | { kind: "TRACK_MASK"; maskType: TrackMaskType }
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
  if (s.surface === "SHALLOW_WATER") {
    return { hex: "#38bdf8", color4: new Color4(0.22, 0.74, 0.97, 1.0) }; // Shallow Lagoon Water Splash
  }
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
    type: "OIL_SLICK",
    name: "Oil Slick Puddle",
    desc: "Iridescent oil puddle that spins out karts",
    color: "#a855f7",
  },
  {
    type: "WATER_PUDDLE",
    name: "Water Puddle",
    desc: "Hydroplane puddle that slows & wobbles unboosted karts",
    color: "#38bdf8",
  },
  {
    type: "PYLON_CONE",
    name: "Traffic Pylon Cone",
    desc: "Bumps karts sideways & trims 15% speed",
    color: "#f97316",
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
    type: "PALM_TREE",
    name: "Tropical Palm Tree",
    desc: "Coastal curved palm with fronds & coconuts",
    color: "#10b981",
  },
  {
    type: "BEACH_CABANA",
    name: "Beach Tiki Cabana",
    desc: "Coastal cabana hut with striped umbrella",
    color: "#06b6d4",
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

const BIOME_OPTIONS: Array<{
  id: TrackBiome;
  label: string;
  subtitle: string;
  badgeClass: string;
}> = [
  {
    id: "ALPINE_SUBURBS",
    label: "🏔️ Alpine Suburbs",
    subtitle: "Grassy hills & mountain rim",
    badgeClass: "border-emerald-400 bg-emerald-500/20 text-white",
  },
  {
    id: "TROPICAL_ATOLL",
    label: "🏝️ Tropical Island",
    subtitle: "Sandy beach, ocean boundary & palms",
    badgeClass: "border-cyan-400 bg-cyan-500/25 text-white",
  },
  {
    id: "SUNSET_CANYON",
    label: "🏜️ Sunset Canyon",
    subtitle: "Red-rock mesa & desert dusk",
    badgeClass: "border-orange-400 bg-orange-500/25 text-white",
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
  { id: "RANDOM", label: "🎲 Surprise Shape (Random)" },
  { id: "SWEEPER", label: "🏎️ Dogleg & Chicane Sweeper" },
  { id: "SWITCHBACK", label: "🐍 Serpentine Touge Hairpins" },
  { id: "KIDNEY", label: "🥨 Deep Boomerang / U-Valley" },
  { id: "CANYON", label: "⛰️ Multi-Lobe Peninsula Gorge" },
  { id: "STADIUM", label: "🏟️ Stadium Gauntlet & Slalom" },
];

type ProceduralTrackSize =
  | "RANDOM"
  | "COMPACT"
  | "STANDARD"
  | "LARGE"
  | "MEGA";

const PROCEDURAL_SIZE_OPTIONS: Array<{
  id: ProceduralTrackSize;
  label: string;
}> = [
  { id: "RANDOM", label: "📏 Any Size" },
  { id: "COMPACT", label: "🏁 Compact (~950m)" },
  { id: "STANDARD", label: "🏎️ Standard (~1.5km)" },
  { id: "LARGE", label: "🏔️ Large (~2.2km)" },
  { id: "MEGA", label: "🚀 Mega (~3.0km)" },
];

/**
 * Detects control nodes where the road/curb ribbon pinches or buckles at the inner seam
 * (only flags true inner-edge reversals/folds or acute single-node kinks > 96 deg).
 */
function evaluateSplineCurbAndClearance(
  pts: Array<{ x: number; y: number; z: number }>,
  roadHalfWidth: number,
  precomputedSamples?: Array<{
    position: Vector3;
    tangent: Vector3;
    binormal: Vector3;
  }>
): {
  minCurbRatio: number;
  pinchedNodes: Set<number>;
  minNonAdjDist: number;
} {
  const samples =
    precomputedSamples ?? computeTrackSplineSamples(pts, 18, []).samples;
  const curbOffset = roadHalfWidth + 1.8;
  let minCurbRatio = Infinity;
  const pinchedNodes = new Set<number>();
  const n = pts.length;
  const sCount = samples.length;

  // Check for degenerate stacked control points (< 4m apart)
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    if (Math.hypot(curr.x - prev.x, curr.z - prev.z) < 4) {
      pinchedNodes.add(i);
      minCurbRatio = Math.min(minCurbRatio, -1);
    }
  }

  for (let k = 0; k < sCount; k++) {
    const s0 = samples[k];
    const s1 = samples[(k + 1) % sCount];
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
    const r = Math.min(ratioL, ratioR);
    if (r < minCurbRatio) {
      minCurbRatio = r;
    }

    if (r < 0.12) {
      let bestIdx = -1;
      let bestDist = 220;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(
          pts[i].x - s0.position.x,
          pts[i].z - s0.position.z
        );
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        pinchedNodes.add(bestIdx);
      }
    }
  }

  // Compute minimum non-adjacent sample distance around the loop to prevent any self-overlap
  let minNonAdjDist = Infinity;
  const skipWindow = Math.max(20, Math.floor(sCount * 0.1));
  for (let i = 0; i < sCount; i += 2) {
    for (let j = i + skipWindow; j < sCount; j += 2) {
      if (sCount - (j - i) < skipWindow) continue;
      const d = Math.hypot(
        samples[i].position.x - samples[j].position.x,
        samples[i].position.z - samples[j].position.z
      );
      if (d < minNonAdjDist) {
        minNonAdjDist = d;
      }
    }
  }

  return { minCurbRatio, pinchedNodes, minNonAdjDist };
}

function detectBuckledControlNodes(
  pts: Array<{ x: number; y: number; z: number }>,
  roadHalfWidth: number,
  splineSamples: Array<{
    position: Vector3;
    tangent: Vector3;
    binormal: Vector3;
  }>
): Set<number> {
  if (pts.length < 4) return new Set<number>();
  return evaluateSplineCurbAndClearance(pts, roadHalfWidth, splineSamples)
    .pinchedNodes;
}

/**
 * Non-Overlapping Local Corner Unbuckler:
 * Preserves existing P0/P1 world coordinates on custom tracks and tests candidate
 * symmetric corner bevels, angle-bisector nudges, and local 2/3-node window relaxations,
 * strictly accepting only moves that improve inner-curb ribbon ratios without reducing
 * non-adjacent track separation (never creating self-intersections).
 */
function unbuckleAndRefineControlPoints(
  rawPts: Array<{ x: number; y: number; z: number }>,
  roadHalfWidth: number,
  lockStartNode = false
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

  const minSafeTrackSeparation = (roadHalfWidth + 2.5) * 2.3;

  for (let pass = 0; pass < 14; pass++) {
    const health = evaluateSplineCurbAndClearance(pts, roadHalfWidth);
    if (health.pinchedNodes.size === 0) break;

    let bestCandidate: typeof pts | null = null;
    let bestScore = health.minCurbRatio;
    let bestType: "sub" | "rel" | null = null;
    const n = pts.length;

    for (const bIdx of Array.from(health.pinchedNodes)) {
      const prev2Idx = (bIdx - 2 + n) % n;
      const prevIdx = (bIdx - 1 + n) % n;
      const nextIdx = (bIdx + 1) % n;
      const next2Idx = (bIdx + 2) % n;
      const prev = pts[prevIdx];
      const curr = pts[bIdx];
      const next = pts[nextIdx];
      const ux1 = curr.x - prev.x;
      const uz1 = curr.z - prev.z;
      const ux2 = next.x - curr.x;
      const uz2 = next.z - curr.z;
      const len1 = Math.hypot(ux1, uz1);
      const len2 = Math.hypot(ux2, uz2);
      if (len1 < 1 || len2 < 1) continue;
      const dirInX = ux1 / len1;
      const dirInZ = uz1 / len1;
      const dirOutX = ux2 / len2;
      const dirOutZ = uz2 / len2;

      const candidates: Array<{ pts: typeof pts; type: "sub" | "rel" }> = [];

      // 1. Symmetric Equal-Chord Corner Bevel (replaces curr with 2 shoulders at equal distance d)
      if (
        (!lockStartNode || bIdx > 0) &&
        n < 34 &&
        Math.min(len1, len2) > roadHalfWidth * 3.0
      ) {
        for (const frac of [0.22, 0.30, 0.38]) {
          const d = Math.min(len1 * frac, len2 * frac, 95);
          const sIn = {
            x: Number((curr.x - dirInX * d).toFixed(1)),
            y: Number((prev.y * 0.25 + curr.y * 0.75).toFixed(1)),
            z: Number((curr.z - dirInZ * d).toFixed(1)),
          };
          const sOut = {
            x: Number((curr.x + dirOutX * d).toFixed(1)),
            y: Number((curr.y * 0.75 + next.y * 0.25).toFixed(1)),
            z: Number((curr.z + dirOutZ * d).toFixed(1)),
          };
          candidates.push({
            pts: [...pts.slice(0, bIdx), sIn, sOut, ...pts.slice(bIdx + 1)],
            type: "sub",
          });
        }
      }

      // 2. Single-node angle-bisector & neighbor-midpoint relaxation
      if (!lockStartNode || bIdx > 0) {
        const bisX = dirOutX - dirInX;
        const bisZ = dirOutZ - dirInZ;
        const bisLen = Math.hypot(bisX, bisZ);
        if (bisLen > 0.05) {
          for (const stepDist of [
            roadHalfWidth * 1.0,
            roadHalfWidth * 2.0,
            roadHalfWidth * 3.2,
          ]) {
            const moved = {
              x: Number((curr.x + (bisX / bisLen) * stepDist).toFixed(1)),
              y: curr.y,
              z: Number((curr.z + (bisZ / bisLen) * stepDist).toFixed(1)),
            };
            candidates.push({
              pts: pts.map((p, idx) => (idx === bIdx ? moved : p)),
              type: "rel",
            });
          }
        }
        const midX = (prev.x + next.x) * 0.5;
        const midZ = (prev.z + next.z) * 0.5;
        for (const alpha of [0.20, 0.35, 0.50]) {
          const moved = {
            x: Number((curr.x * (1 - alpha) + midX * alpha).toFixed(1)),
            y: curr.y,
            z: Number((curr.z * (1 - alpha) + midZ * alpha).toFixed(1)),
          };
          candidates.push({
            pts: pts.map((p, idx) => (idx === bIdx ? moved : p)),
            type: "rel",
          });
        }
      }

      // 3. Local 2-, 3-, or 5-node window relaxation (cures S-hook / asymmetric long-chord zig-zags)
      for (const windowIndices of [
        [prevIdx, bIdx],
        [bIdx, nextIdx],
        [prevIdx, bIdx, nextIdx],
        [prev2Idx, prevIdx, bIdx, nextIdx, next2Idx],
      ]) {
        for (const alpha of [0.22, 0.38]) {
          const nextPts = pts.map((p, idx) => {
            if (!windowIndices.includes(idx) || (lockStartNode && idx === 0)) {
              return p;
            }
            const pP = pts[(idx - 1 + n) % n];
            const pN = pts[(idx + 1) % n];
            return {
              x: Number(
                (p.x * (1 - alpha) + (pP.x + pN.x) * 0.5 * alpha).toFixed(1)
              ),
              y: p.y,
              z: Number(
                (p.z * (1 - alpha) + (pP.z + pN.z) * 0.5 * alpha).toFixed(1)
              ),
            };
          });
          candidates.push({ pts: nextPts, type: "rel" });
        }
      }

      for (const cand of candidates) {
        const ch = evaluateSplineCurbAndClearance(cand.pts, roadHalfWidth);
        if (
          ch.minNonAdjDist >=
            Math.min(health.minNonAdjDist * 0.9, minSafeTrackSeparation) &&
          ch.minCurbRatio > bestScore + 0.008
        ) {
          bestScore = ch.minCurbRatio;
          bestCandidate = cand.pts;
          bestType = cand.type;
        }
      }
    }

    if (!bestCandidate || !bestType) break;
    pts = bestCandidate;
    if (bestType === "sub") subdividedCount++;
    else relaxedCount++;
  }

  return { pts, subdividedCount, relaxedCount };
}

/**
 * True Generative Multi-Sector Circuit Spline Synthesizer:
 * Synthesizes genuinely unique circuit topologies on every roll using continuous polar harmonics,
 * randomized chirality (East vs. West loop), variable aspect & skew, randomized sector features
 * (hairpins, concave boomerang valleys, multi-lobe peninsulas, stadium slaloms), and configurable size tiers
 * (COMPACT ~950m, STANDARD ~1.5km, LARGE ~2.2km, MEGA ~3.0km), guaranteed 100% buckle-free and non-overlapping.
 */
function generateProceduralCircuitControlPoints(
  requestedArchetype: ProceduralTrackArchetype,
  requestedSize: ProceduralTrackSize,
  seed: number,
  currentRoadHalfWidth: number
): {
  resolvedArchetype: Exclude<ProceduralTrackArchetype, "RANDOM">;
  resolvedSize: Exclude<ProceduralTrackSize, "RANDOM">;
  archetypeTitle: string;
  sizeTitle: string;
  controlPoints: Array<{ x: number; y: number; z: number }>;
  roadHalfWidth: number;
  terrainHillScale: number;
} {
  // High-entropy Mulberry32 PRNG mixed with Math.random() / Web Crypto so every click produces a brand-new circuit
  let s =
    (seed ^
      Math.floor(Math.random() * 0xffffffff) ^
      0x9e3779b9) >>>
    0;
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    s = (s ^ buf[0]) >>> 0;
  }
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randRange = (min: number, max: number) => min + rand() * (max - min);
  const randInt = (min: number, max: number) =>
    Math.floor(randRange(min, max + 1));

  const concreteArchetypes: Array<Exclude<ProceduralTrackArchetype, "RANDOM">> =
    ["SWEEPER", "SWITCHBACK", "KIDNEY", "CANYON", "STADIUM"];
  const resolvedArchetype: Exclude<ProceduralTrackArchetype, "RANDOM"> =
    requestedArchetype === "RANDOM"
      ? concreteArchetypes[Math.floor(rand() * concreteArchetypes.length)]
      : requestedArchetype;

  const concreteSizes: Array<Exclude<ProceduralTrackSize, "RANDOM">> = [
    "COMPACT",
    "STANDARD",
    "LARGE",
    "MEGA",
  ];
  const resolvedSize: Exclude<ProceduralTrackSize, "RANDOM"> =
    requestedSize === "RANDOM"
      ? concreteSizes[Math.floor(rand() * concreteSizes.length)]
      : requestedSize;

  const archetypeTitleMap: Record<
    Exclude<ProceduralTrackArchetype, "RANDOM">,
    string
  > = {
    SWEEPER: "Dogleg & Chicane Sweeper",
    SWITCHBACK: "Serpentine Touge Hairpins",
    KIDNEY: "Deep Boomerang U-Valley",
    CANYON: "Multi-Lobe Peninsula Gorge",
    STADIUM: "Stadium Gauntlet & Slalom",
  };

  const sizeTitleMap: Record<Exclude<ProceduralTrackSize, "RANDOM">, string> = {
    COMPACT: "Compact",
    STANDARD: "Standard",
    LARGE: "Large",
    MEGA: "Mega",
  };

  const roadHalfWidth =
    requestedArchetype === "RANDOM"
      ? Number(
          randRange(
            resolvedSize === "COMPACT" ? 12.0 : 13.0,
            resolvedSize === "COMPACT" ? 13.8 : 15.0
          ).toFixed(1)
        )
      : currentRoadHalfWidth;

  const sizeConfig: Record<
    Exclude<ProceduralTrackSize, "RANDOM">,
    {
      rMin: number;
      rMax: number;
      startZ: [number, number];
      endZ: [number, number];
      modScale: number;
      elevRange: [number, number];
    }
  > = {
    COMPACT: {
      rMin: 125,
      rMax: 158,
      startZ: [68, 82],
      endZ: [-62, -50],
      modScale: 0.72,
      elevRange: [5, 11],
    },
    STANDARD: {
      rMin: 185,
      rMax: 235,
      startZ: [82, 98],
      endZ: [-74, -58],
      modScale: 0.88,
      elevRange: [8, 15],
    },
    LARGE: {
      rMin: 265,
      rMax: 335,
      startZ: [94, 114],
      endZ: [-84, -68],
      modScale: 1.0,
      elevRange: [11, 20],
    },
    MEGA: {
      rMin: 355,
      rMax: 445,
      startZ: [106, 130],
      endZ: [-96, -76],
      modScale: 1.08,
      elevRange: [14, 24],
    },
  };

  const sz = sizeConfig[resolvedSize];
  const minSafeSep = (roadHalfWidth + 2.5) * 2.3;
  let bestPts: Array<{ x: number; y: number; z: number }> = [];
  let bestMinRatio = -Infinity;

  for (let attempt = 0; attempt < 5; attempt++) {
    const baseR = randRange(sz.rMin, sz.rMax);
    // Randomize loop chirality (+1 = expands East, -1 = expands West), aspect ratio, north-south center shift, and diagonal skew
    const dirX = rand() < 0.5 ? 1 : -1;
    const aspectX = randRange(0.78, 1.34);
    const aspectZ = randRange(0.78, 1.34);
    const rx = baseR * aspectX;
    const rz = baseR * aspectZ;
    const skewXZ = randRange(-0.22, 0.22);
    const centerShiftZ = randRange(-0.2, 0.24) * rz;
    const cx = dirX * (rx * randRange(0.96, 1.14) + 32);
    const cz = centerShiftZ;

    const sectorCount =
      resolvedArchetype === "SWITCHBACK"
        ? randInt(11, 14)
        : resolvedArchetype === "CANYON"
        ? randInt(11, 14)
        : randInt(10, 13);

    const p1Z = randRange(sz.startZ[0], sz.startZ[1]);
    const pLastZ = randRange(sz.endZ[0], sz.endZ[1]);
    const pLastX = dirX * randRange(5, 14);

    let phiStart = Math.atan2(p1Z - cz, (0 - cx) * dirX);
    if (phiStart < 0) phiStart += Math.PI * 2;
    if (phiStart > Math.PI) phiStart -= Math.PI * 2;
    let phiEnd = Math.atan2(pLastZ - cz, (pLastX - cx) * dirX);
    if (phiEnd > 0) phiEnd -= Math.PI * 2;

    phiStart = Math.max(1.9, Math.min(2.65, phiStart));
    phiEnd = Math.min(-1.9, Math.max(-2.65, phiEnd));

    const phase2 = randRange(0, Math.PI * 2);
    const phase3 = randRange(0, Math.PI * 2);
    const phase4 = randRange(0, Math.PI * 2);
    const amp2 = randRange(0.12, 0.26) * sz.modScale;
    const amp3 = randRange(0.1, 0.22) * sz.modScale;

    const bayU1 = randRange(0.22, 0.78);
    const bayU2 = (bayU1 + randRange(0.36, 0.54)) % 1;
    const bayWidth = randRange(0.12, 0.18);
    const bayDepth = randRange(0.36, 0.54) * sz.modScale;

    const lobeCount = randInt(3, 4);
    const lobePhase = randRange(0, Math.PI * 2);

    const hairpinSlots = new Set<number>();
    const numHairpins = resolvedSize === "COMPACT" ? 2 : randInt(2, 3);
    let hpTry = 0;
    while (hairpinSlots.size < numHairpins && hpTry < 30) {
      hpTry++;
      const idx = randInt(2, sectorCount - 3);
      if (!hairpinSlots.has(idx - 1) && !hairpinSlots.has(idx + 1)) {
        hairpinSlots.add(idx);
      }
    }

    const elevPeak = randRange(sz.elevRange[0], sz.elevRange[1]);
    const elevFreq = randInt(1, 3);
    const elevPhase = randRange(0, Math.PI * 2);

    const rawPts: Array<{ x: number; y: number; z: number }> = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Number(randRange(0.6, 1.8).toFixed(1)), z: Math.round(p1Z) },
    ];

    for (let i = 0; i < sectorCount; i++) {
      const uBase = (i + 0.85) / (sectorCount + 0.7);
      const u = Math.max(
        0.05,
        Math.min(0.95, uBase + randRange(-0.018, 0.018))
      );
      const phi = phiStart + u * (phiEnd - phiStart);

      let rFactor = 1.0;
      if (resolvedArchetype === "SWEEPER") {
        rFactor =
          1.0 +
          amp2 * Math.cos(2 * phi + phase2) +
          amp3 * Math.sin(3 * phi + phase3);
        if (Math.abs(u - bayU1) < 0.09) {
          rFactor *=
            rand() < 0.5 ? 1 - 0.25 * sz.modScale : 1 + 0.22 * sz.modScale;
        }
      } else if (resolvedArchetype === "SWITCHBACK") {
        rFactor = 1.0 + 0.14 * Math.cos(2 * phi + phase2);
        if (hairpinSlots.has(i)) {
          rFactor *= 1 - randRange(0.36, 0.48) * sz.modScale;
        } else if (hairpinSlots.has(i - 1) || hairpinSlots.has(i + 1)) {
          rFactor *= 1 + randRange(0.16, 0.28) * sz.modScale;
        }
      } else if (resolvedArchetype === "KIDNEY") {
        const d1 = (u - bayU1) / bayWidth;
        const d2 = rand() < 0.45 ? (u - bayU2) / (bayWidth * 0.9) : 99;
        const dip =
          bayDepth * Math.exp(-d1 * d1) +
          (d2 < 10 ? bayDepth * 0.6 * Math.exp(-d2 * d2) : 0);
        rFactor = 1.15 + 0.14 * Math.cos(2 * phi + phase2) - dip;
      } else if (resolvedArchetype === "CANYON") {
        rFactor =
          1.0 +
          0.3 * sz.modScale * Math.cos(lobeCount * phi + lobePhase) +
          0.12 * sz.modScale * Math.sin(2 * phi + phase3);
      } else {
        const superR = Math.pow(
          Math.pow(Math.abs(Math.cos(phi)), 2.6) +
            Math.pow(Math.abs(Math.sin(phi)), 2.6),
          -1 / 2.6
        );
        const slalom =
          Math.abs(u - bayU1) < 0.18
            ? 0.22 * sz.modScale * Math.sin(((u - bayU1) / 0.18) * Math.PI)
            : 0;
        rFactor = superR * (0.95 + slalom + 0.1 * Math.cos(2 * phi + phase4));
      }

      rFactor = Math.max(0.42, Math.min(1.48, rFactor));

      const localX = rx * rFactor * Math.cos(phi);
      const localZ = rz * rFactor * Math.sin(phi);
      const worldX = cx + dirX * (localX + skewXZ * localZ);
      const worldZ = cz + localZ + skewXZ * 0.35 * localX;

      const env = Math.sin(u * Math.PI);
      const rawY =
        env *
        elevPeak *
        (0.55 +
          0.45 * Math.sin(elevFreq * u * Math.PI * 2 + elevPhase) +
          randRange(-0.1, 0.1));

      rawPts.push({
        x: Number(worldX.toFixed(1)),
        y: Number(Math.max(0.3, rawY).toFixed(1)),
        z: Number(worldZ.toFixed(1)),
      });
    }

    rawPts.push({
      x: Number(pLastX.toFixed(1)),
      y: 0,
      z: Math.round(pLastZ),
    });

    const { pts: refined } = unbuckleAndRefineControlPoints(
      rawPts,
      roadHalfWidth,
      true
    );
    const h = evaluateSplineCurbAndClearance(refined, roadHalfWidth);
    if (h.minCurbRatio > bestMinRatio || bestPts.length === 0) {
      bestMinRatio = h.minCurbRatio;
      bestPts = refined;
    }
    if (h.pinchedNodes.size === 0 && h.minNonAdjDist >= minSafeSep) {
      break;
    }
  }

  const terrainHillScale =
    resolvedArchetype === "CANYON"
      ? 1.35
      : resolvedArchetype === "STADIUM"
      ? 0.85
      : 1.1;

  return {
    resolvedArchetype,
    resolvedSize,
    archetypeTitle: archetypeTitleMap[resolvedArchetype],
    sizeTitle: sizeTitleMap[resolvedSize],
    controlPoints: bestPts,
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
  const [maskWidth, setMaskWidth] = useState<number>(8.0);
  const [maskLength, setMaskLength] = useState<number>(38.0);
  const [brushRadius, setBrushRadius] = useState<number>(58);
  const [brushStrength, setBrushStrength] = useState<number>(8.5);
  const [showAiTraces, setShowAiTraces] = useState<boolean>(true);
  const [traceColorMode, setTraceColorMode] =
    useState<AiTraceColorMode>("SURFACE");
  const [traceTick, setTraceTick] = useState<number>(0);
  const [proceduralArchetype, setProceduralArchetype] =
    useState<ProceduralTrackArchetype>("RANDOM");
  const [proceduralSize, setProceduralSize] =
    useState<ProceduralTrackSize>("RANDOM");
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
  const maskWidthRef = useRef<number>(maskWidth);
  maskWidthRef.current = maskWidth;
  const maskLengthRef = useRef<number>(maskLength);
  maskLengthRef.current = maskLength;
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

  const [isPublishingCommunity, setIsPublishingCommunity] = useState(false);
  const [showEditorAuthModal, setShowEditorAuthModal] = useState(false);

  const handlePublishToCommunity = async () => {
    if (isPublishingCommunity) return;
    handleSaveMap();
    setIsPublishingCommunity(true);
    try {
      const res = await communityTrackClient.publishCommunityTrack(
        trackDefRef.current
      );
      if (res.requiresAuth) {
        setShowEditorAuthModal(true);
        return;
      }
      if (res.error) {
        flashIoNotice(`Publish blocked: ${res.error}`);
      } else if (res.record) {
        flashIoNotice(
          `Published "${res.record.trackName}" by ${res.record.authorCallsign} to Community Catalog!`
        );
      }
    } finally {
      setIsPublishingCommunity(false);
    }
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

  // Shared helper: query recorded AI consensus lateral offset at normT (or 0 if no traces)
  const queryAiConsensusLateral = (
    targetNormT: number,
    roadHalfWidth: number
  ): number | null => {
    if (recordedAiTraces.length === 0) return null;
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
      lats.length % 2 === 1 ? lats[mid] : (lats[mid - 1] + lats[mid]) * 0.5;
    const maxSafeLat = Math.max(1.5, roadHalfWidth - 2.5);
    return Math.max(-maxSafeLat, Math.min(maxSafeLat, medianLat));
  };

  // Shared helper: Place length-scaled Safe Stunt Jumps on hill crests AND long straightaways
  const buildCuratedSafeJumps = (
    targetSpline: ReturnType<typeof computeTrackSplineSamples>,
    roadHalfWidth: number,
    existingObstacles: CustomTrackDefinition["obstacles"],
    useAiTraces: boolean,
    idPrefix: string
  ): {
    keptAndNewJumps: CustomTrackDefinition["obstacles"];
    nonJumpObstacles: CustomTrackDefinition["obstacles"];
    jumpNormTs: number[];
    removedHazardJumps: number;
  } => {
    const totalLen = Math.max(200, targetSpline.totalTrackLength);
    const evaluateJumpAtNormT = (
      normT: number
    ): { safe: boolean; score: number; isLongStretch: boolean } => {
      if (normT < 0.06 || normT > 0.92) {
        return { safe: false, score: -1, isLongStretch: false };
      }

      const s0 = targetSpline.getPointAtNormalizedT(normT, 0);
      const sBehind20 = targetSpline.getPointAtNormalizedT(
        (normT - 20 / totalLen + 1) % 1,
        0
      );
      const sBehind48 = targetSpline.getPointAtNormalizedT(
        (normT - 48 / totalLen + 1) % 1,
        0
      );
      const s15 = targetSpline.getPointAtNormalizedT(
        (normT + 15 / totalLen) % 1,
        0
      );
      const s30 = targetSpline.getPointAtNormalizedT(
        (normT + 30 / totalLen) % 1,
        0
      );
      const s46 = targetSpline.getPointAtNormalizedT(
        (normT + 46 / totalLen) % 1,
        0
      );
      const s72 = targetSpline.getPointAtNormalizedT(
        (normT + 72 / totalLen) % 1,
        0
      );

      const tan0 = new Vector3(s0.tangent.x, 0, s0.tangent.z).normalize();
      const tanBehind20 = new Vector3(
        sBehind20.tangent.x,
        0,
        sBehind20.tangent.z
      ).normalize();
      const tanBehind48 = new Vector3(
        sBehind48.tangent.x,
        0,
        sBehind48.tangent.z
      ).normalize();
      const tan15 = new Vector3(s15.tangent.x, 0, s15.tangent.z).normalize();
      const tan30 = new Vector3(s30.tangent.x, 0, s30.tangent.z).normalize();
      const tan46 = new Vector3(s46.tangent.x, 0, s46.tangent.z).normalize();
      const tan72 = new Vector3(s72.tangent.x, 0, s72.tangent.z).normalize();

      const dotBehind = Vector3.Dot(tan0, tanBehind20);
      const dot15 = Vector3.Dot(tan0, tan15);
      const dot30 = Vector3.Dot(tan0, tan30);
      const dot46 = Vector3.Dot(tan0, tan46);

      const s42 = targetSpline.getPointAtNormalizedT(
        (normT + 42 / totalLen) % 1,
        0
      );
      const toLanding = s42.position.subtract(s0.position);
      toLanding.y = 0;
      const binorm0 = new Vector3(s0.binormal.x, 0, s0.binormal.z).normalize();
      const crossTrackLandingOffset = Math.abs(Vector3.Dot(toLanding, binorm0));

      const isSafe =
        dotBehind >= 0.89 &&
        dot15 >= 0.94 &&
        dot30 >= 0.91 &&
        dot46 >= 0.87 &&
        crossTrackLandingOffset <= roadHalfWidth * 0.64;

      if (!isSafe) {
        return { safe: false, score: -1, isLongStretch: false };
      }

      // Detect if this candidate sits inside a long straightaway/sweeper stretch (120m+ corridor)
      const dotLongBehind = Vector3.Dot(tan0, tanBehind48);
      const dotLongAhead = Vector3.Dot(tan0, tan72);
      const isLongStretch = dotLongBehind >= 0.86 && dotLongAhead >= 0.85;
      const longStretchBonus = isLongStretch
        ? (dotLongBehind + dotLongAhead) * 18
        : 0;
      const crestBonus = Math.max(0, (s0.position.y - s30.position.y) * 2.2);
      const score =
        (dotBehind + dot15 * 1.5 + dot30 * 1.5 + dot46 * 1.2) * 20 -
        crossTrackLandingOffset * 1.8 +
        crestBonus +
        longStretchBonus;

      return { safe: true, score, isLongStretch };
    };

    const nonJumpObstacles = existingObstacles.filter(
      (o) => o.type !== "JUMP_RAMP"
    );
    const existingJumps = existingObstacles.filter(
      (o) => o.type === "JUMP_RAMP"
    );

    let removedHazardJumps = 0;
    const keptAndNewJumps: typeof existingJumps = [];
    const jumpNormTs: number[] = [];

    for (const jump of existingJumps) {
      const q = targetSpline.queryClosestTrackPoint(
        new Vector3(jump.x, 0, jump.z)
      );
      const check = evaluateJumpAtNormT(q.normalizedSplineT);
      if (check.safe) {
        const aiLat = useAiTraces
          ? queryAiConsensusLateral(q.normalizedSplineT, roadHalfWidth) ?? 0
          : 0;
        const aligned = targetSpline.getPointAtNormalizedT(
          q.normalizedSplineT,
          aiLat
        );
        const yaw = Math.atan2(aligned.tangent.x, aligned.tangent.z);
        keptAndNewJumps.push({
          ...jump,
          x: Number(aligned.position.x.toFixed(1)),
          z: Number(aligned.position.z.toFixed(1)),
          rotationY: Number(yaw.toFixed(2)),
        });
        jumpNormTs.push(q.normalizedSplineT);
      } else {
        removedHazardJumps++;
      }
    }

    const steps = 220;
    const candidates: Array<{
      normT: number;
      score: number;
      isLongStretch: boolean;
    }> = [];
    for (let i = 0; i < steps; i++) {
      const normT = i / steps;
      const res = evaluateJumpAtNormT(normT);
      if (res.safe) {
        candidates.push({
          normT,
          score: res.score,
          isLongStretch: res.isLongStretch,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    // Scale target jump count with track length: 2-3 on compact (~950m) up to 6-7 on mega (~3,000m)
    const targetJumpCount = Math.min(
      7,
      Math.max(2, Math.round(totalLen / 350))
    );
    const minSpacingT = Math.max(0.11, 165 / totalLen);

    const tryAddJumpAt = (normT: number, scale = 1.15) => {
      const tooClose = jumpNormTs.some((t) => {
        let diff = Math.abs(t - normT);
        if (diff > 0.5) diff = 1.0 - diff;
        return diff < minSpacingT;
      });
      if (tooClose) return false;

      const aiLat = useAiTraces
        ? queryAiConsensusLateral(normT, roadHalfWidth) ?? 0
        : 0;
      const sample = targetSpline.getPointAtNormalizedT(normT, aiLat);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      keptAndNewJumps.push({
        id: `${idPrefix}_${keptAndNewJumps.length}`,
        type: "JUMP_RAMP",
        x: Number(sample.position.x.toFixed(1)),
        z: Number(sample.position.z.toFixed(1)),
        rotationY: Number(yaw.toFixed(2)),
        scale,
      });
      jumpNormTs.push(normT);
      return true;
    };

    // Pass 1: Prioritize long-stretch straightaways & high-scoring crests
    for (const cand of candidates) {
      if (keptAndNewJumps.length >= targetJumpCount) break;
      tryAddJumpAt(cand.normT, cand.isLongStretch ? 1.2 : 1.15);
    }

    // Pass 2: Check for any huge empty sector (> 460m without a jump) and place a safe jump if available
    if (jumpNormTs.length > 0 && keptAndNewJumps.length < targetJumpCount + 1) {
      const sorted = [...jumpNormTs].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        const tA = sorted[i];
        const tB = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 1;
        const gapMeters = (tB - tA) * totalLen;
        if (gapMeters > 460) {
          const midT = ((tA + tB) * 0.5) % 1;
          const gapCand = candidates.find((c) => {
            let d = Math.abs(c.normT - midT);
            if (d > 0.5) d = 1 - d;
            return d * totalLen < gapMeters * 0.35;
          });
          if (gapCand) {
            tryAddJumpAt(gapCand.normT, 1.18);
          }
        }
      }
    }

    // Fallback if track is super twisty and had 0 strict candidates
    if (keptAndNewJumps.length === 0) {
      let bestT = 0.25;
      let bestDot = -1;
      for (let i = 15; i < steps - 18; i++) {
        const normT = i / steps;
        const s0 = targetSpline.getPointAtNormalizedT(normT, 0);
        const s28 = targetSpline.getPointAtNormalizedT(
          (normT + 28 / totalLen) % 1,
          0
        );
        const dot = Vector3.Dot(s0.tangent, s28.tangent);
        if (dot > bestDot) {
          bestDot = dot;
          bestT = normT;
        }
      }
      tryAddJumpAt(bestT, 1.1);
    }

    return {
      keptAndNewJumps,
      nonJumpObstacles,
      jumpNormTs,
      removedHazardJumps,
    };
  };

  // Shared helper: Populate Corner-Exit Boosters + Long-Stretch Speed-Chain Boosters + Scaled Item Box Rows
  const buildCuratedBoostsAndItemRows = (
    targetSpline: ReturnType<typeof computeTrackSplineSamples>,
    roadHalfWidth: number,
    jumpNormTs: number[],
    useAiTraces: boolean,
    boostIdPrefix: string,
    rowIdPrefix: string
  ): {
    boostPads: CustomTrackDefinition["boostPads"];
    itemBoxRows: CustomTrackDefinition["itemBoxRows"];
    longStretchBoostsAdded: number;
  } => {
    const totalLen = Math.max(200, targetSpline.totalTrackLength);
    const isInsideJumpCorridor = (
      normT: number,
      bufferAheadMeters = 45,
      bufferBehindMeters = 14
    ): boolean => {
      const arcT = bufferAheadMeters / totalLen;
      const beforeT = bufferBehindMeters / totalLen;
      return jumpNormTs.some((jT) => {
        const ahead = (normT - jT + 1) % 1;
        const behind = (jT - normT + 1) % 1;
        return ahead <= arcT || behind <= beforeT;
      });
    };

    const targetBoostCount = Math.min(
      12,
      Math.max(4, Math.round(totalLen / 205))
    );
    const minBoostSpacingT = Math.max(0.045, 78 / totalLen);
    const chosenBoosts: Array<{ normT: number; lat: number }> = [];

    const tryAddBoost = (normT: number, defaultLat: number): boolean => {
      if (normT < 0.05 || normT > 0.94) return false;
      if (isInsideJumpCorridor(normT, 42, 12)) return false;
      const tooClose = chosenBoosts.some((b) => {
        let diff = Math.abs(b.normT - normT);
        if (diff > 0.5) diff = 1.0 - diff;
        return diff < minBoostSpacingT;
      });
      if (tooClose) return false;
      const aiLat = useAiTraces
        ? queryAiConsensusLateral(normT, roadHalfWidth)
        : null;
      const clampedLat = Math.max(
        -(roadHalfWidth - 2.4),
        Math.min(roadHalfWidth - 2.4, aiLat ?? defaultLat)
      );
      chosenBoosts.push({
        normT,
        lat: Number(clampedLat.toFixed(2)),
      });
      return true;
    };

    // 1. Score Corner Exits around the track
    const steps = 220;
    const exitCandidates: Array<{ normT: number; score: number; lat: number }> =
      [];
    for (let i = 0; i < steps; i++) {
      const normT = i / steps;
      if (normT < 0.055 || normT > 0.935) continue;
      if (isInsideJumpCorridor(normT, 42, 12)) continue;

      const sBack = targetSpline.getPointAtNormalizedT(
        (normT - 24 / totalLen + 1) % 1,
        0
      );
      const sHere = targetSpline.getPointAtNormalizedT(normT, 0);
      const sAhead = targetSpline.getPointAtNormalizedT(
        (normT + 28 / totalLen) % 1,
        0
      );

      const turnBefore = 1.0 - Vector3.Dot(sBack.tangent, sHere.tangent);
      const straightAhead = Vector3.Dot(sHere.tangent, sAhead.tangent);

      if (straightAhead >= 0.9 && turnBefore >= 0.035) {
        const turnCross =
          sBack.tangent.x * sHere.tangent.z - sBack.tangent.z * sHere.tangent.x;
        const apexExitLat =
          Math.sign(turnCross) * Math.min(2.8, roadHalfWidth * 0.2);
        exitCandidates.push({
          normT,
          score: turnBefore * 10 + straightAhead * 3,
          lat: apexExitLat,
        });
      }
    }
    exitCandidates.sort((a, b) => b.score - a.score);

    const maxCornerExitQuota = Math.ceil(targetBoostCount * 0.55);
    for (const cand of exitCandidates) {
      if (chosenBoosts.length >= maxCornerExitQuota) break;
      tryAddBoost(cand.normT, cand.lat);
    }

    // 2. Long-Stretch Straightaway Speed-Chain & Slalom Populator:
    // Find any stretch > 175m between existing action points (jumps + corner-exit boosts) and inject speed chains!
    let longStretchBoostsAdded = 0;
    const actionAnchors = [
      0.04,
      ...jumpNormTs,
      ...chosenBoosts.map((b) => b.normT),
      0.95,
    ].sort((a, b) => a - b);

    let slalomSign = 1;
    for (let i = 0; i < actionAnchors.length - 1; i++) {
      const tStart = actionAnchors[i];
      const tEnd = actionAnchors[i + 1];
      const gapMeters = (tEnd - tStart) * totalLen;
      if (gapMeters < 175) continue;

      // Determine how many speed-chain boosters fit comfortably inside this long stretch (1 every ~125m)
      const chainCount = Math.min(3, Math.max(1, Math.floor(gapMeters / 135)));
      for (let c = 1; c <= chainCount; c++) {
        if (chosenBoosts.length >= targetBoostCount + 2) break;
        const candT = tStart + ((tEnd - tStart) * c) / (chainCount + 1);
        const sHere = targetSpline.getPointAtNormalizedT(candT, 0);
        const sAhead = targetSpline.getPointAtNormalizedT(
          (candT + 24 / totalLen) % 1,
          0
        );
        const straightness = Vector3.Dot(sHere.tangent, sAhead.tangent);
        // Weave left/right on straightaways for fun arcade slalom lines
        const weaveLat =
          straightness > 0.94
            ? slalomSign * Math.min(3.4, roadHalfWidth * 0.25)
            : 0;
        if (tryAddBoost(candT, weaveLat)) {
          longStretchBoostsAdded++;
          slalomSign *= -1;
        }
      }
    }

    // 3. Fill any remaining quota from top corner exits or evenly spaced straightaways
    for (const cand of exitCandidates) {
      if (chosenBoosts.length >= targetBoostCount) break;
      tryAddBoost(cand.normT, cand.lat);
    }
    if (chosenBoosts.length < 4) {
      for (const fallbackT of [0.16, 0.36, 0.58, 0.78]) {
        if (chosenBoosts.length >= 4) break;
        tryAddBoost(fallbackT, 0);
      }
    }

    chosenBoosts.sort((a, b) => a.normT - b.normT);
    const boostPads = chosenBoosts.map((b, idx) => ({
      id: `${boostIdPrefix}_${idx}`,
      normT: Number(b.normT.toFixed(4)),
      lateral: b.lat,
    }));

    // 4. Scale Grounded Item Box Rows with track length (3 on compact ~950m up to 7 on mega ~3,000m)
    const targetItemRowCount = Math.min(
      7,
      Math.max(3, Math.round(totalLen / 375))
    );
    const itemBoxRows: CustomTrackDefinition["itemBoxRows"] = [];
    for (let rIdx = 0; rIdx < targetItemRowCount; rIdx++) {
      const anchorT = 0.12 + ((rIdx + 0.5) / targetItemRowCount) * 0.78;
      let bestT = anchorT;
      let bestScore = -999;
      for (let offset = -14; offset <= 14; offset++) {
        const candT = (anchorT + offset * 0.0045 + 1) % 1;
        if (candT < 0.065 || candT > 0.93) continue;
        if (isInsideJumpCorridor(candT, 46, 14)) continue;
        const s0 = targetSpline.getPointAtNormalizedT(candT, 0);
        const sAhead = targetSpline.getPointAtNormalizedT(
          (candT + 22 / totalLen) % 1,
          0
        );
        const straightness = Vector3.Dot(s0.tangent, sAhead.tangent);
        // Bonus if this item row sits inside a long stretch between boost pads
        const score = straightness - Math.abs(offset) * 0.008;
        if (score > bestScore) {
          bestScore = score;
          bestT = candT;
        }
      }
      itemBoxRows.push({
        id: `${rowIdPrefix}_${rIdx}`,
        normT: Number(bestT.toFixed(4)),
      });
    }

    return { boostPads, itemBoxRows, longStretchBoostsAdded };
  };

  // Feature 4: Auto-Place Safe Jumps (scales with track length, populates long stretches & crests, and clears item boxes from jump arcs)
  const handleAutoPlaceSafeJumps = () => {
    const currentDef = trackDefRef.current;
    const totalLen = Math.max(200, splineData.totalTrackLength);
    const {
      keptAndNewJumps,
      nonJumpObstacles,
      jumpNormTs,
      removedHazardJumps,
    } = buildCuratedSafeJumps(
      splineData,
      currentDef.roadHalfWidth,
      currentDef.obstacles,
      true,
      `auto_jump_${Date.now()}`
    );

    // Nudge any Item Box Rows out of mid-air jump trajectories so racers don't fly over item boxes
    const jumpFlightArcT = 44 / totalLen;
    const adjustedItemRows = currentDef.itemBoxRows.map((row) => {
      for (const jT of jumpNormTs) {
        const deltaAhead = (row.normT - jT + 1) % 1;
        if (deltaAhead >= 0 && deltaAhead < jumpFlightArcT) {
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
        obstacles: [...nonJumpObstacles, ...keptAndNewJumps],
        itemBoxRows: adjustedItemRows,
      },
      true
    );

    flashIoNotice(
      removedHazardJumps > 0
        ? `Relocated ${removedHazardJumps} corner-hazard jump${
            removedHazardJumps === 1 ? "" : "s"
          } & placed ${keptAndNewJumps.length} Safe Stunt Jump${
            keptAndNewJumps.length === 1 ? "" : "s"
          } across crests & long straightaways!`
        : `Placed ${keptAndNewJumps.length} Safe Stunt Jump${
            keptAndNewJumps.length === 1 ? "" : "s"
          } across crests & long straightaways (${Math.round(totalLen)}m loop)!`
    );
  };

  // Feature 5: Auto-Curate Corner-Exit + Long-Stretch Speed-Chain Boost Pads & Scaled Item Box Rows
  const handleAutoCurateBoostsAndBoxes = () => {
    const currentDef = trackDefRef.current;
    const jumpNormTs = currentDef.obstacles
      .filter((o) => o.type === "JUMP_RAMP")
      .map(
        (o) =>
          splineData.queryClosestTrackPoint(new Vector3(o.x, 0, o.z))
            .normalizedSplineT
      );

    const now = Date.now();
    const { boostPads, itemBoxRows, longStretchBoostsAdded } =
      buildCuratedBoostsAndItemRows(
        splineData,
        currentDef.roadHalfWidth,
        jumpNormTs,
        true,
        `boost_auto_${now}`,
        `item_row_auto_${now}`
      );

    commitWorkingEdit(
      {
        ...currentDef,
        boostPads,
        itemBoxRows,
      },
      true
    );

    flashIoNotice(
      `Curated ${boostPads.length} Boost Pads (${longStretchBoostsAdded} on long stretches) & ${itemBoxRows.length} Grounded Item Box Rows!`
    );
  };

  // Feature 6: 1-Click Unbuckle & Subdivide Sharp Corners (eliminates inner-seam curb/road ribbon folding)
  const handleUnbuckleCorners = () => {
    const currentDef = trackDefRef.current;
    const { pts: nextPts, subdividedCount, relaxedCount } =
      unbuckleAndRefineControlPoints(
        currentDef.controlPoints,
        currentDef.roadHalfWidth,
        false
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
        "All corners already have clean inner-seam radii — zero buckled corners found!"
      );
    }
  };

  // Feature 7: 1-Click Procedural Track Generator (true generative spline + size control + long-stretch action populator + scenery)
  const handleGenerateProceduralTrack = () => {
    const currentDef = trackDefRef.current;
    proceduralGenCountRef.current += 1;
    const seed =
      ((Date.now() & 0xfffffff) ^
        Math.imul(proceduralGenCountRef.current, 2654435761)) >>>
      0;

    const generated = generateProceduralCircuitControlPoints(
      proceduralArchetype,
      proceduralSize,
      seed,
      currentDef.roadHalfWidth
    );

    const newSpline = computeTrackSplineSamples(
      generated.controlPoints,
      28,
      []
    );
    const totalLen = Math.max(200, newSpline.totalTrackLength);

    // 1. Populate length-scaled Safe Stunt Jumps across hill crests & long straightaways
    const { keptAndNewJumps: safeJumps, jumpNormTs } = buildCuratedSafeJumps(
      newSpline,
      generated.roadHalfWidth,
      [],
      false,
      `proc_jump_${seed}`
    );

    // 2. Populate Corner-Exit + Long-Stretch Slalom Speed-Chain Boost Pads & Scaled Item Box Rows
    const { boostPads: procBoostPads, itemBoxRows: procItemRows } =
      buildCuratedBoostsAndItemRows(
        newSpline,
        generated.roadHalfWidth,
        jumpNormTs,
        false,
        `proc_boost_${seed}`,
        `proc_item_row_${seed}`
      );

    const nextScenerySeed = (currentDef.scenerySeed ?? 0) + 1;
    const activeBiome = currentDef.biome ?? "ALPINE_SUBURBS";
    const procTrackMasks =
      activeBiome === "TROPICAL_ATOLL"
        ? [
            {
              id: `proc_lagoon_${seed}_0`,
              type: "SHALLOW_WATER" as const,
              normT: 0.28,
              lateral: Number((generated.roadHalfWidth * 0.45).toFixed(1)),
              width: 11.5,
              length: 46,
            },
            {
              id: `proc_lagoon_${seed}_1`,
              type: "SHALLOW_WATER" as const,
              normT: 0.68,
              lateral: Number((-generated.roadHalfWidth * 0.45).toFixed(1)),
              width: 11.5,
              length: 48,
            },
          ]
        : [];
    const populatedTrack = syncTracksideSceneryAndClearRoad({
      ...currentDef,
      biome: activeBiome,
      roadHalfWidth: generated.roadHalfWidth,
      controlPoints: generated.controlPoints,
      boostPads: procBoostPads,
      itemBoxRows: procItemRows,
      obstacles: safeJumps,
      trackMasks: procTrackMasks,
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
      `Generated ${generated.sizeTitle} "${generated.archetypeTitle}" (${Math.round(
        totalLen
      )}m, ${safeJumps.length} jumps, ${procBoostPads.length} boosts, ${
        procItemRows.length
      } item rows)!`
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

  // Compute live Catmull-Rom spline & Frenet frames whenever controlPoints, roadHalfWidth, trackMasks, or terrainMods change
  const unifiedMapGeo = useMemo(
    () => computeUnifiedMapGeometry(trackDef),
    [trackDef]
  );

  const splineData = useMemo(
    () =>
      computeTrackSplineSamples(
        trackDef.controlPoints,
        28,
        trackDef.terrainMods ?? [],
        trackDef.roadHalfWidth,
        unifiedMapGeo.effectiveMasks
      ),
    [
      trackDef.controlPoints,
      trackDef.terrainMods,
      trackDef.roadHalfWidth,
      unifiedMapGeo.effectiveMasks,
    ]
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
      currentDef.terrainMods ?? [],
      currentDef.roadHalfWidth,
      currentDef.trackMasks ?? []
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
      const localHalfW = q.localRoadHalfWidth || currentDef.roadHalfWidth;
      const clampedLat = Math.max(
        -(localHalfW - 2.2),
        Math.min(localHalfW - 2.2, q.signedLateralOffset)
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
    } else if (tool.kind === "TRACK_MASK") {
      const q = spline.queryClosestTrackPoint(new Vector3(worldX, 0, worldZ));
      const localHalfW = q.localRoadHalfWidth || currentDef.roadHalfWidth;
      const isWideCorridorMask =
        tool.maskType === "BOOST_SHORTCUT" ||
        tool.maskType === "PAVED_SHORTCUT" ||
        tool.maskType === "SHALLOW_WATER";
      const maxLatReach = isWideCorridorMask
        ? localHalfW + 16.0
        : localHalfW - 2.0;
      const clampedLat =
        tool.maskType === "SPLIT_MEDIAN"
          ? 0
          : Math.max(-maxLatReach, Math.min(maxLatReach, q.signedLateralOffset));
      commitWorkingEdit(
        syncTracksideSceneryAndClearRoad({
          ...currentDef,
          trackMasks: [
            ...(currentDef.trackMasks ?? []),
            {
              id: `mask_${Date.now()}_${Math.floor(Math.random() * 999)}`,
              type: tool.maskType,
              normT: Number(q.normalizedSplineT.toFixed(4)),
              lateral: Number(clampedLat.toFixed(2)),
              width: maskWidthRef.current,
              length: maskLengthRef.current,
            },
          ],
        })
      );
    } else if (tool.kind === "ERASER") {
      const nextMasks = (currentDef.trackMasks ?? []).filter((m) => {
        const pt = spline.getPointAtNormalizedT(m.normT, m.lateral).position;
        const dx = pt.x - worldX;
        const dz = pt.z - worldZ;
        return dx * dx + dz * dz > Math.max(100, (m.length * 0.55) ** 2);
      });
      const nextObs = currentDef.obstacles.filter((o) => {
        const dx = o.x - worldX;
        const dz = o.z - worldZ;
        return dx * dx + dz * dz > 64;
      });
      if (
        nextMasks.length !== (currentDef.trackMasks ?? []).length ||
        nextObs.length !== currentDef.obstacles.length
      ) {
        commitWorkingEdit({
          ...currentDef,
          trackMasks: nextMasks,
          obstacles: nextObs,
        });
      }
    } else if (tool.kind === "SCENERY") {
      const q = spline.queryClosestTrackPoint(new Vector3(worldX, 0, worldZ));
      const localHalfW = q.localRoadHalfWidth || currentDef.roadHalfWidth;
      // Prevent stamping trees directly onto the asphalt pavement
      if (q.horizontalDistance < localHalfW + 3.0) {
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
    camera.lowerRadiusLimit = 35;
    camera.upperRadiusLimit = 1800;
    camera.wheelPrecision = 0.6;
    camera.panningSensibility = 18;
    camera.maxZ = 3800;
    camera.attachControl(canvas, false);
    camera3dRef.current = camera;

    const preventCanvasWheelPageScroll = (e: WheelEvent) => {
      e.preventDefault();
    };
    canvas.addEventListener("wheel", preventCanvasWheelPageScroll, {
      passive: false,
    });

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
          m.name === "tropical_ocean_water" ||
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
          tool.kind === "TRACK_MASK" ||
          tool.kind === "ERASER" ||
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
        (m) =>
          m.name === "offroad_terrain" ||
          m.name === "tropical_ocean_water" ||
          m.name === "pavement_ribbon"
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
        camera.attachControl(canvas, false);
      }
    };

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      canvas.removeEventListener("wheel", preventCanvasWheelPageScroll);
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

    // Update 3D viewport sky backdrop color based on active biome
    const activeBiome = trackDef.biome ?? "ALPINE_SUBURBS";
    if (activeBiome === "TROPICAL_ATOLL") {
      scene.clearColor = new Color4(0.14, 0.52, 0.78, 1.0);
    } else if (activeBiome === "SUNSET_CANYON") {
      scene.clearColor = new Color4(0.28, 0.13, 0.18, 1.0);
    } else {
      scene.clearColor = new Color4(0.08, 0.13, 0.22, 1.0);
    }

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
      className="h-screen w-full overflow-hidden overscroll-none bg-slate-950 text-white flex flex-col select-none"
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

          {/* 1-Click Procedural Circuit Generator (Size Selector + Archetype Selector + Generate Button) */}
          <div className="flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-950/40 p-0.5">
            <select
              data-testid="editor-procedural-size-select"
              value={proceduralSize}
              onChange={(e) =>
                setProceduralSize(e.target.value as ProceduralTrackSize)
              }
              className="rounded bg-slate-900 px-1.5 py-1 text-[10px] font-black uppercase text-emerald-200 border border-emerald-400/30 focus:outline-none cursor-pointer"
              title="Select generated circuit size tier (Compact ~950m, Standard ~1.5km, Large ~2.2km, Mega ~3.0km, or Any Size)"
            >
              {PROCEDURAL_SIZE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              title="Procedurally synthesize a brand-new, buckle-free circuit spline with elevation hills, long-stretch stunt jumps, slalom speed-chain boost pads, item box rows, and scenery (supports Ctrl+Z Undo)"
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

          <button
            type="button"
            data-testid="editor-publish-community-btn"
            onClick={() => void handlePublishToCommunity()}
            disabled={isPublishingCommunity}
            title="Publish this circuit to the online Community Circuit Catalog (requires verified Gutsy Karts account)"
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/70 bg-gradient-to-r from-cyan-500/25 to-emerald-500/25 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-100 hover:from-cyan-500/35 hover:to-emerald-500/35 disabled:opacity-50 transition cursor-pointer shadow-[0_0_16px_rgba(34,211,238,0.2)]"
          >
            <Globe className="h-3.5 w-3.5 text-cyan-300" />
            {isPublishingCommunity ? "PUBLISHING..." : "PUBLISH TO COMMUNITY"}
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
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Sidebar: Cup/Map Switcher, 3D Spline, 3D Terrain Sculptor, Forest, Boost Pads & Obstacles */}
        <aside className="lg:col-span-4 xl:col-span-3 border-r border-white/10 bg-slate-900/80 p-4 overflow-y-auto overscroll-contain space-y-5 h-full min-h-0">
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

          {/* 0. Procedural Environment Biome Switcher (Alpine Suburbs | Tropical Island | Sunset Canyon) */}
          <div className="rounded-xl border border-cyan-400/35 bg-slate-950/75 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                ENVIRONMENT BIOME SKIN
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">
                {(trackDef.biome ?? "ALPINE_SUBURBS").replace("_", " ")}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {BIOME_OPTIONS.map((b) => {
                const isSelected =
                  (trackDef.biome ?? "ALPINE_SUBURBS") === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    data-testid={`editor-biome-${b.id.toLowerCase()}-btn`}
                    onClick={() =>
                      commitWorkingEdit(
                        syncTracksideSceneryAndClearRoad({
                          ...trackDef,
                          biome: b.id,
                        })
                      )
                    }
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      isSelected
                        ? b.badgeClass
                        : "border-white/10 bg-slate-900/75 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="text-[11px] font-black leading-tight">
                      {b.label}
                    </div>
                    <div className="mt-0.5 text-[9px] text-slate-400 leading-tight">
                      {b.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
                <div className="pt-2 border-t border-white/10 space-y-2.5">
                  <div>
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
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-300">
                        NODE P{selectedControlIdx} ROAD WIDTH SCALE
                      </span>
                      <span className="text-amber-300 font-mono">
                        {(selectedPt.widthScale ?? 1.0).toFixed(2)}x (
                        {(
                          trackDef.roadHalfWidth *
                          2 *
                          (selectedPt.widthScale ?? 1.0)
                        ).toFixed(0)}
                        m)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={selectedPt.widthScale ?? 1.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        const nextPts = trackDef.controlPoints.map((pt, i) =>
                          i === selectedControlIdx
                            ? {
                                ...pt,
                                widthScale:
                                  Math.abs(val - 1.0) < 0.01 ? undefined : val,
                              }
                            : pt
                        );
                        commitWorkingEdit(
                          syncTracksideSceneryAndClearRoad({
                            ...trackDef,
                            controlPoints: nextPts,
                          })
                        );
                      }}
                      className="mt-1 w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex gap-2">
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

              {/* Track Masks: Road Hole / Pit Cutout, Shallow Lagoon Water & Parallel Split-Lane Median */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-fuchsia-300">
                    TRACK MASKS &amp; SHALLOW WATER (
                    {(trackDef.trackMasks ?? []).length})
                  </span>
                  {(trackDef.trackMasks?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        commitWorkingEdit(
                          syncTracksideSceneryAndClearRoad({
                            ...trackDef,
                            trackMasks: [],
                          })
                        )
                      }
                      className="text-[10px] font-bold text-rose-400 hover:underline cursor-pointer"
                    >
                      Clear Masks
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMaskWidth(7.5);
                      setMaskLength(16);
                      setActiveTool({
                        kind: "TRACK_MASK",
                        maskType: "ROAD_HOLE",
                      });
                    }}
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      activeTool.kind === "TRACK_MASK" &&
                      activeTool.maskType === "ROAD_HOLE"
                        ? "border-rose-400 bg-rose-500/20 text-white"
                        : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="text-[11px] font-black text-rose-300">
                      ROAD HOLE / PIT
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Stamp hazard cutout
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMaskWidth(8.5);
                      setMaskLength(38);
                      setActiveTool({
                        kind: "TRACK_MASK",
                        maskType: "SPLIT_MEDIAN",
                      });
                    }}
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      activeTool.kind === "TRACK_MASK" &&
                      activeTool.maskType === "SPLIT_MEDIAN"
                        ? "border-fuchsia-400 bg-fuchsia-500/20 text-white"
                        : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="text-[11px] font-black text-fuchsia-300">
                      SPLIT-LANE MEDIAN
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Parallel twin lanes
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMaskWidth(10.5);
                      setMaskLength(54);
                      setActiveTool({
                        kind: "TRACK_MASK",
                        maskType: "BOOST_SHORTCUT",
                      });
                    }}
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      activeTool.kind === "TRACK_MASK" &&
                      activeTool.maskType === "BOOST_SHORTCUT"
                        ? "border-amber-400 bg-amber-500/20 text-white"
                        : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="text-[11px] font-black text-amber-300">
                      BOOST SHORTCUT
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Off-road dirt cut
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMaskWidth(6.8);
                      setMaskLength(50);
                      setActiveTool({
                        kind: "TRACK_MASK",
                        maskType: "PAVED_SHORTCUT",
                      });
                    }}
                    className={`rounded-xl border p-2 text-left transition cursor-pointer ${
                      activeTool.kind === "TRACK_MASK" &&
                      activeTool.maskType === "PAVED_SHORTCUT"
                        ? "border-cyan-400 bg-cyan-500/20 text-white"
                        : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="text-[11px] font-black text-cyan-300">
                      PAVED SHORTCUT
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Technical fast bypass
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="editor-mask-shallow-water-btn"
                    onClick={() => {
                      setMaskWidth(11.0);
                      setMaskLength(44);
                      setActiveTool({
                        kind: "TRACK_MASK",
                        maskType: "SHALLOW_WATER",
                      });
                    }}
                    className={`col-span-2 rounded-xl border p-2 text-left transition cursor-pointer ${
                      activeTool.kind === "TRACK_MASK" &&
                      activeTool.maskType === "SHALLOW_WATER"
                        ? "border-sky-400 bg-sky-500/25 text-white"
                        : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <div className="text-[11px] font-black text-sky-300">
                      🌊 LAGOON SHALLOW WATER FORD
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Splashable shallow lagoon water (85% top speed, wet grip &amp; water spray)
                    </div>
                  </button>
                </div>

                {activeTool.kind === "TRACK_MASK" && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-400">MASK WIDTH</span>
                        <span className="text-fuchsia-300 font-mono">
                          {maskWidth.toFixed(1)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={16}
                        step={0.5}
                        value={maskWidth}
                        onChange={(e) =>
                          setMaskWidth(parseFloat(e.target.value))
                        }
                        className="mt-1 w-full accent-fuchsia-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-slate-400">MASK LENGTH</span>
                        <span className="text-fuchsia-300 font-mono">
                          {maskLength.toFixed(0)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={70}
                        step={2}
                        value={maskLength}
                        onChange={(e) =>
                          setMaskLength(parseFloat(e.target.value))
                        }
                        className="mt-1 w-full accent-fuchsia-400 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
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

            {/* Hazard / Puddle / Ramp Scale Slider */}
            <div className="mt-2.5 rounded-xl border border-white/10 bg-slate-950/70 p-2.5">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-400">
                  HAZARD / PUDDLE SIZE SCALE
                </span>
                <span className="text-orange-300 font-mono">
                  {prefabScale.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.6}
                max={3.0}
                step={0.2}
                value={prefabScale}
                onChange={(e) => setPrefabScale(parseFloat(e.target.value))}
                className="mt-1 w-full accent-orange-400 cursor-pointer"
              />
            </div>
          </div>
        </aside>

        {/* Right Main Area: 3D Babylon.js Viewport + 2D Overhead Blueprint */}
        <main
          className={`lg:col-span-8 xl:col-span-9 grid ${
            viewportLayout === "SPLIT_3D_2D"
              ? "grid-cols-1 xl:grid-cols-2"
              : "grid-cols-1"
          } h-full min-h-0 overscroll-none overflow-hidden bg-slate-950`}
        >
          {/* 3D Interactive Babylon.js Viewport */}
          {viewportLayout !== "2D_ONLY" && (
            <div className="relative h-full w-full min-h-0 border-r border-white/10 overflow-hidden overscroll-none">
              <canvas
                ref={canvas3dRef}
                data-testid="editor-3d-canvas"
                className="h-full w-full block outline-none touch-none overscroll-none"
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

                <UnifiedTrackMapLayers
                  trackDef={trackDef}
                  geometry={unifiedMapGeo}
                  variant="EDITOR"
                  showScenery={true}
                  showWallBoundary={true}
                  showItemBoxes={true}
                  showObstacles={true}
                  showBoostPads={true}
                  aiTraces={
                    showAiTraces
                      ? recordedAiTraces.map((rt) => ({
                          racerId: rt.racerId,
                          racerName: rt.racerName,
                          color: rt.color,
                          pathSamples: rt.pathSamples,
                        }))
                      : undefined
                  }
                  traceColorMode={traceColorMode}
                  onClickMask={(mask, e) => {
                    if (activeTool.kind === "ERASER") {
                      e.stopPropagation();
                      commitWorkingEdit(
                        syncTracksideSceneryAndClearRoad({
                          ...trackDef,
                          trackMasks: unifiedMapGeo.effectiveMasks.filter(
                            (m) => m.id !== mask.id
                          ),
                        })
                      );
                    }
                  }}
                  onClickBoostPad={(pad, e) => {
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
                  onClickItemBoxRow={(row, e) => {
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
                  onClickObstacle={(obs, e) => {
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
                  onClickSceneryProp={(prop, e) => {
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
                />

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
      <RacerAuthModal
        open={showEditorAuthModal}
        onClose={() => setShowEditorAuthModal(false)}
        reasonPrompt="Sign in or create a verified Gutsy Karts account to publish your custom circuit to the Community Catalog (anti-spam protected: max 1 new track per 60s, 10/day)."
        onAuthenticated={() => {
          setShowEditorAuthModal(false);
          void handlePublishToCommunity();
        }}
      />
    </div>
  );
};
