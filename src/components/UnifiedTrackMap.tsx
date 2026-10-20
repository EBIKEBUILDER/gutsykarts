"use client";

import React, { useMemo } from "react";
import {
  AiPathSample,
  CustomTrackDefinition,
  ObstaclePrefabType,
  PlacedBoostPad,
  PlacedItemBoxRow,
  PlacedObstacle,
  PlacedSceneryProp,
  PlacedTrackMask,
  RacerStanding,
  SceneryPrefabType,
} from "@/src/types/game";
import {
  computeTrackSplineSamples,
  synthesizeDefaultShortcutMasks,
  TrackSample,
} from "@/src/game/world/TrackBuilder";

export type UnifiedMapVariant = "RADAR" | "AI_TRACE" | "PREVIEW" | "EDITOR";
export type AiTraceColorMode = "SURFACE" | "SPEED" | "MINI_TURBO";

export interface UnifiedMapRacerTrace {
  racerId: string;
  racerName?: string;
  color?: string;
  pathSamples: AiPathSample[];
}

export interface UnifiedMapBottleneckZone {
  x: number;
  z: number;
  hits: number;
}

export interface UnifiedMapActiveHazard {
  id: string;
  type: "CRYO_MINE" | "GLITCH_PRISM";
  x: number;
  z: number;
}

export function getUnifiedAiTraceSampleColor(
  s: AiPathSample,
  mode: AiTraceColorMode
): { hex: string; label: string } {
  if (mode === "MINI_TURBO") {
    if (s.miniTurboTier >= 3) {
      return { hex: "#e879f9", label: "Tier 3 Purple Ultra MT" };
    }
    if (s.miniTurboTier === 2) {
      return { hex: "#f97316", label: "Tier 2 Orange Super MT" };
    }
    if (s.miniTurboTier === 1) {
      return { hex: "#38bdf8", label: "Tier 1 Blue Mini-Turbo" };
    }
    if (s.driftState === "DRIFT_ACTIVE") {
      return { hex: "#facc15", label: "Charging Drift" };
    }
    return { hex: "#475569", label: "Straightaway Grip" };
  }
  if (mode === "SPEED") {
    if (s.boosting || s.miniTurboTier > 0) {
      return { hex: "#38bdf8", label: "Boost / Mini-Turbo (>100%)" };
    }
    if (s.speedRatio < 0.65) {
      return { hex: "#f43f5e", label: "Heavy Speed Scrub (<65%)" };
    }
    if (s.speedRatio < 0.88) {
      return { hex: "#fbbf24", label: "Cornering Load (65–88%)" };
    }
    return { hex: "#34d399", label: "High-Speed Apex Lock (>88%)" };
  }
  if (s.surface === "OFFROAD") {
    return s.boosting
      ? { hex: "#38bdf8", label: "Boosted Shortcut Cut" }
      : { hex: "#f43f5e", label: "Unboosted Off-Road Drag" };
  }
  if (s.driftState === "DRIFT_ACTIVE") {
    return { hex: "#fbbf24", label: "Active Drift Arc" };
  }
  return { hex: "#34d399", label: "Clean Pavement Line" };
}

const OBSTACLE_COLORS: Record<ObstaclePrefabType, string> = {
  PYLON_CONE: "#f97316",
  OIL_SLICK: "#a855f7",
  WATER_PUDDLE: "#38bdf8",
  BARRIER_CRATE: "#eab308",
  JUMP_RAMP: "#ec4899",
};

const SCENERY_COLORS: Record<SceneryPrefabType, string> = {
  PINE_TREE: "#15803d",
  OAK_TREE: "#22c55e",
  BOULDER: "#94a3b8",
  GRANDSTAND: "#ef4444",
  SUBURBAN_HOUSE: "#f59e0b",
  LAMP_POST: "#fde047",
};

export interface ComputedMaskGeometry {
  mask: PlacedTrackMask;
  isSynthesized: boolean;
  outerPolygonPoints: string;
  innerPolygonPoints: string;
  leftEdgePath: string;
  rightEdgePath: string;
  centerlinePath: string;
  midX: number;
  midY: number;
  midAngleDeg: number;
  entryGate?: { lx: number; ly: number; rx: number; ry: number };
  exitGate?: { lx: number; ly: number; rx: number; ry: number };
}

export interface ComputedBoostPadGeometry {
  pad: PlacedBoostPad;
  x: number;
  y: number;
  angleDeg: number;
}

export interface ComputedItemBoxRowGeometry {
  row: PlacedItemBoxRow;
  boxes: Array<{ x: number; y: number }>;
}

export interface ComputedUnifiedMapGeometry {
  splineData: ReturnType<typeof computeTrackSplineSamples>;
  effectiveMasks: PlacedTrackMask[];
  wallRibbonPath: string;
  wallLeftEdgePath: string;
  wallRightEdgePath: string;
  curbRibbonPath: string;
  roadRibbonPath: string;
  leftCurbEdgePath: string;
  rightCurbEdgePath: string;
  centerlinePath: string;
  maskGeometries: ComputedMaskGeometry[];
  boostPadGeometries: ComputedBoostPadGeometry[];
  itemBoxRowGeometries: ComputedItemBoxRowGeometry[];
  finishBanner: {
    x: number;
    y: number;
    angleDeg: number;
    halfWidth: number;
  };
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    viewBox: string;
  };
}

function buildQuadStripSvgPath(
  samples: TrackSample[],
  getHalfWidth: (s: TrackSample) => number,
  step = 2
): string {
  const n = samples.length;
  if (n < 3) return "";
  const chunks: string[] = [];
  for (let i = 0; i < n; i += step) {
    const s0 = samples[i];
    const s1 = samples[(i + step) % n];
    const w0 = getHalfWidth(s0);
    const w1 = getHalfWidth(s1);

    const ext = 0.45;
    const p0x = s0.position.x - s0.tangent.x * 0.15;
    const p0z = s0.position.z - s0.tangent.z * 0.15;
    const p1x = s1.position.x + s1.tangent.x * ext;
    const p1z = s1.position.z + s1.tangent.z * ext;

    const l0x = p0x - s0.binormal.x * w0;
    const l0y = -(p0z - s0.binormal.z * w0);
    const l1x = p1x - s1.binormal.x * w1;
    const l1y = -(p1z - s1.binormal.z * w1);
    const r1x = p1x + s1.binormal.x * w1;
    const r1y = -(p1z + s1.binormal.z * w1);
    const r0x = p0x + s0.binormal.x * w0;
    const r0y = -(p0z + s0.binormal.z * w0);

    chunks.push(
      `M${l0x.toFixed(1)},${l0y.toFixed(1)}L${l1x.toFixed(1)},${l1y.toFixed(
        1
      )}L${r1x.toFixed(1)},${r1y.toFixed(1)}L${r0x.toFixed(1)},${r0y.toFixed(
        1
      )}Z`
    );
  }
  return chunks.join("");
}

function buildClosedOffsetEdgePath(
  samples: TrackSample[],
  getSignedOffset: (s: TrackSample) => number,
  step = 2
): string {
  const n = samples.length;
  if (n < 3) return "";
  const pts: string[] = [];
  for (let i = 0; i < n; i += step) {
    const s = samples[i];
    const off = getSignedOffset(s);
    const x = s.position.x + s.binormal.x * off;
    const y = -(s.position.z + s.binormal.z * off);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  pts.push("Z");
  return pts.join("");
}

export function computeUnifiedMapGeometry(
  trackDef: CustomTrackDefinition
): ComputedUnifiedMapGeometry {
  const explicitIds = new Set((trackDef.trackMasks ?? []).map((m) => m.id));
  const effectiveMasks = synthesizeDefaultShortcutMasks(
    trackDef.controlPoints,
    trackDef.roadHalfWidth,
    trackDef.id || trackDef.name || "track",
    trackDef.trackMasks
  );

  // 16 subdivisions per control point yields ~220 smooth samples around the loop with half the SVG path payload
  const splineData = computeTrackSplineSamples(
    trackDef.controlPoints,
    16,
    trackDef.terrainMods ?? [],
    trackDef.roadHalfWidth,
    effectiveMasks
  );
  const samples = splineData.samples;
  const totalLen = Math.max(100, splineData.totalTrackLength);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includePoint = (x: number, y: number, pad = 0) => {
    if (x - pad < minX) minX = x - pad;
    if (x + pad > maxX) maxX = x + pad;
    if (y - pad < minY) minY = y - pad;
    if (y + pad > maxY) maxY = y + pad;
  };

  for (let i = 0; i < samples.length; i += 2) {
    const s = samples[i];
    const wallW =
      s.localWallHalfWidth ||
      (s.localRoadHalfWidth || trackDef.roadHalfWidth) + 12.5;
    includePoint(
      s.position.x - s.binormal.x * wallW,
      -(s.position.z - s.binormal.z * wallW)
    );
    includePoint(
      s.position.x + s.binormal.x * wallW,
      -(s.position.z + s.binormal.z * wallW)
    );
  }

  const wallRibbonPath = buildQuadStripSvgPath(
    samples,
    (s) =>
      s.localWallHalfWidth ||
      (s.localRoadHalfWidth || trackDef.roadHalfWidth) + 12.5,
    2
  );
  const wallLeftEdgePath = buildClosedOffsetEdgePath(
    samples,
    (s) =>
      -(
        s.localWallHalfWidth ||
        (s.localRoadHalfWidth || trackDef.roadHalfWidth) + 12.5
      ),
    2
  );
  const wallRightEdgePath = buildClosedOffsetEdgePath(
    samples,
    (s) =>
      s.localWallHalfWidth ||
      (s.localRoadHalfWidth || trackDef.roadHalfWidth) + 12.5,
    2
  );

  const curbRibbonPath = buildQuadStripSvgPath(
    samples,
    (s) => (s.localRoadHalfWidth || trackDef.roadHalfWidth) + 1.65,
    2
  );
  const roadRibbonPath = buildQuadStripSvgPath(
    samples,
    (s) => s.localRoadHalfWidth || trackDef.roadHalfWidth,
    2
  );

  const leftCurbEdgePath = buildClosedOffsetEdgePath(
    samples,
    (s) => -((s.localRoadHalfWidth || trackDef.roadHalfWidth) + 0.8),
    2
  );
  const rightCurbEdgePath = buildClosedOffsetEdgePath(
    samples,
    (s) => (s.localRoadHalfWidth || trackDef.roadHalfWidth) + 0.8,
    2
  );
  const centerlinePath = buildClosedOffsetEdgePath(samples, () => 0, 2);

  // Build true curved ribbon geometry for every track mask (SPLIT_MEDIAN, PAVED_SHORTCUT, BOOST_SHORTCUT, ROAD_HOLE)
  const maskGeometries: ComputedMaskGeometry[] = effectiveMasks.map((mask) => {
    const isSynthesized = !explicitIds.has(mask.id);
    const steps =
      mask.type === "ROAD_HOLE"
        ? 12
        : mask.type === "SPLIT_MEDIAN"
        ? 14
        : 16;
    const halfSpanT =
      Math.max(8, mask.length * 0.5) / Math.max(100, totalLen);
    const halfW = Math.max(1.5, mask.width * 0.5);
    const sideSign = mask.lateral >= 0 ? 1 : -1;
    const attachLat = sideSign * Math.max(6.5, trackDef.roadHalfWidth - 1.0);

    const outerLeft: Array<{ x: number; y: number }> = [];
    const outerRight: Array<{ x: number; y: number }> = [];
    const innerLeft: Array<{ x: number; y: number }> = [];
    const innerRight: Array<{ x: number; y: number }> = [];
    const centerPts: Array<{ x: number; y: number }> = [];

    let midX = 0;
    let midY = 0;
    let midAngleDeg = 0;

    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const t = mask.normT - halfSpanT + u * (halfSpanT * 2);

      let latCenter = mask.lateral;
      let localHalfW = halfW;

      if (mask.type === "SPLIT_MEDIAN") {
        latCenter = 0;
        const taper =
          u < 0.16
            ? Math.sin((u / 0.16) * (Math.PI * 0.5))
            : u > 0.84
            ? Math.sin(((1 - u) / 0.16) * (Math.PI * 0.5))
            : 1.0;
        localHalfW = Math.max(0.45, halfW * taper);
      } else if (
        mask.type === "BOOST_SHORTCUT" ||
        mask.type === "PAVED_SHORTCUT"
      ) {
        const archBell = Math.sin(u * Math.PI);
        latCenter = attachLat + (mask.lateral - attachLat) * archBell;
      } else if (mask.type === "ROAD_HOLE") {
        const holeProfile = Math.sin(u * Math.PI);
        localHalfW = Math.max(0.3, halfW * holeProfile);
      }

      const pt = splineData.getPointAtNormalizedT(t, latCenter);
      const cx = pt.position.x;
      const cy = -pt.position.z;
      const bx = pt.binormal.x;
      const by = -pt.binormal.z;

      if (s === Math.floor(steps / 2)) {
        midX = cx;
        midY = cy;
        midAngleDeg =
          (Math.atan2(pt.tangent.x, pt.tangent.z) * 180) / Math.PI;
      }

      const curbPad = mask.type === "SPLIT_MEDIAN" ? 1.05 : 0.75;
      const olx = cx - bx * (localHalfW + curbPad);
      const oly = cy - by * (localHalfW + curbPad);
      const orx = cx + bx * (localHalfW + curbPad);
      const ory = cy + by * (localHalfW + curbPad);

      const ilx = cx - bx * localHalfW;
      const ily = cy - by * localHalfW;
      const irx = cx + bx * localHalfW;
      const iry = cy + by * localHalfW;

      includePoint(olx, oly, 4);
      includePoint(orx, ory, 4);

      outerLeft.push({ x: olx, y: oly });
      outerRight.push({ x: orx, y: ory });
      innerLeft.push({ x: ilx, y: ily });
      innerRight.push({ x: irx, y: iry });
      centerPts.push({ x: cx, y: cy });
    }

    const outerPolygonPoints = [
      ...outerLeft.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      ...[...outerRight]
        .reverse()
        .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    ].join(" ");

    const innerPolygonPoints = [
      ...innerLeft.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      ...[...innerRight]
        .reverse()
        .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    ].join(" ");

    const leftEdgePath = innerLeft
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join("");
    const rightEdgePath = innerRight
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join("");
    const centerlinePath = centerPts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join("");

    const entryGate =
      innerLeft.length > 1
        ? {
            lx: innerLeft[1].x,
            ly: innerLeft[1].y,
            rx: innerRight[1].x,
            ry: innerRight[1].y,
          }
        : undefined;
    const exitGate =
      innerLeft.length > 2
        ? {
            lx: innerLeft[innerLeft.length - 2].x,
            ly: innerLeft[innerLeft.length - 2].y,
            rx: innerRight[innerRight.length - 2].x,
            ry: innerRight[innerRight.length - 2].y,
          }
        : undefined;

    return {
      mask,
      isSynthesized,
      outerPolygonPoints,
      innerPolygonPoints,
      leftEdgePath,
      rightEdgePath,
      centerlinePath,
      midX,
      midY,
      midAngleDeg,
      entryGate,
      exitGate,
    };
  });

  // Precompute Boost Pad & Item Box Row coordinates once so zero spline evaluations occur during render
  const boostPadGeometries: ComputedBoostPadGeometry[] = (
    trackDef.boostPads ?? []
  ).map((pad) => {
    const sample = splineData.getPointAtNormalizedT(pad.normT, pad.lateral);
    const angleDeg =
      (Math.atan2(sample.tangent.x, sample.tangent.z) * 180) / Math.PI;
    return {
      pad,
      x: sample.position.x,
      y: -sample.position.z,
      angleDeg,
    };
  });

  const itemBoxOffsets = [-8.4, -2.8, 2.8, 8.4];
  const itemBoxRowGeometries: ComputedItemBoxRowGeometry[] = (
    trackDef.itemBoxRows ?? []
  ).map((row) => ({
    row,
    boxes: itemBoxOffsets.map((lat) => {
      const pt = splineData.getPointAtNormalizedT(row.normT, lat).position;
      return { x: pt.x, y: -pt.z };
    }),
  }));

  const s0 = samples[0];
  const finishAngleDeg = s0
    ? (Math.atan2(s0.tangent.x, s0.tangent.z) * 180) / Math.PI
    : 0;
  const finishBanner = {
    x: s0 ? s0.position.x : 0,
    y: s0 ? -s0.position.z : 0,
    angleDeg: finishAngleDeg,
    halfWidth: s0
      ? s0.localRoadHalfWidth || trackDef.roadHalfWidth
      : trackDef.roadHalfWidth,
  };

  if (!Number.isFinite(minX)) {
    minX = -150;
    minY = -150;
    maxX = 150;
    maxY = 150;
  }

  const margin = 16;
  const bMinX = minX - margin;
  const bMinY = minY - margin;
  const bWidth = Math.max(60, maxX - minX + margin * 2);
  const bHeight = Math.max(60, maxY - minY + margin * 2);

  return {
    splineData,
    effectiveMasks,
    wallRibbonPath,
    wallLeftEdgePath,
    wallRightEdgePath,
    curbRibbonPath,
    roadRibbonPath,
    leftCurbEdgePath,
    rightCurbEdgePath,
    centerlinePath,
    maskGeometries,
    boostPadGeometries,
    itemBoxRowGeometries,
    finishBanner,
    bounds: {
      minX: bMinX,
      minY: bMinY,
      maxX: maxX + margin,
      maxY: maxY + margin,
      width: bWidth,
      height: bHeight,
      viewBox: `${bMinX.toFixed(1)} ${bMinY.toFixed(1)} ${bWidth.toFixed(
        1
      )} ${bHeight.toFixed(1)}`,
    },
  };
}

interface StaticTrackLayersProps {
  trackDef: CustomTrackDefinition;
  geometry: ComputedUnifiedMapGeometry;
  variant: UnifiedMapVariant;
  showScenery?: boolean;
  showWallBoundary?: boolean;
  showItemBoxes?: boolean;
  showObstacles?: boolean;
  showBoostPads?: boolean;
  onClickMask?: (mask: PlacedTrackMask, e: React.MouseEvent) => void;
  onClickBoostPad?: (pad: PlacedBoostPad, e: React.MouseEvent) => void;
  onClickItemBoxRow?: (row: PlacedItemBoxRow, e: React.MouseEvent) => void;
  onClickObstacle?: (obs: PlacedObstacle, e: React.MouseEvent) => void;
  onClickSceneryProp?: (prop: PlacedSceneryProp, e: React.MouseEvent) => void;
}

const MemoizedStaticTrackLayers: React.FC<StaticTrackLayersProps> = React.memo(
  ({
    trackDef,
    geometry,
    variant,
    showScenery = variant === "EDITOR",
    showWallBoundary = variant !== "PREVIEW",
    showItemBoxes = variant !== "PREVIEW",
    showObstacles = true,
    showBoostPads = true,
    onClickMask,
    onClickBoostPad,
    onClickItemBoxRow,
    onClickObstacle,
    onClickSceneryProp,
  }) => {
    const {
      wallRibbonPath,
      wallLeftEdgePath,
      wallRightEdgePath,
      curbRibbonPath,
      roadRibbonPath,
      leftCurbEdgePath,
      rightCurbEdgePath,
      centerlinePath,
      maskGeometries,
      boostPadGeometries,
      itemBoxRowGeometries,
      finishBanner,
    } = geometry;

    const isCompact = variant === "RADAR" || variant === "PREVIEW";

    return (
      <>
        {/* 0. Sculpted Terrain Hill / Valley Contour Rings */}
        {!isCompact &&
          (trackDef.terrainMods ?? []).map((mod) => (
            <circle
              key={mod.id}
              cx={mod.x}
              cy={-mod.z}
              r={mod.radius}
              fill={
                mod.deltaY >= 0
                  ? "rgba(52, 211, 153, 0.12)"
                  : "rgba(251, 191, 36, 0.12)"
              }
              stroke={mod.deltaY >= 0 ? "#34d399" : "#fbbf24"}
              strokeWidth={1.2}
              strokeDasharray="6 4"
              className="pointer-events-none"
            />
          ))}

        {/* 1. Outer Grass/Dirt Runoff & Dynamic Wall Perimeter Zone */}
        {showWallBoundary && wallRibbonPath && (
          <g className="pointer-events-none">
            <path
              d={wallRibbonPath}
              fill="#14291d"
              fillRule="nonzero"
              opacity={variant === "EDITOR" ? 0.65 : 0.55}
            />
            <path
              d={wallLeftEdgePath}
              fill="none"
              stroke="#334155"
              strokeWidth={variant === "RADAR" ? 1.4 : 1.1}
              strokeDasharray="6 4"
              opacity={0.65}
            />
            <path
              d={wallRightEdgePath}
              fill="none"
              stroke="#334155"
              strokeWidth={variant === "RADAR" ? 1.4 : 1.1}
              strokeDasharray="6 4"
              opacity={0.65}
            />
          </g>
        )}

        {/* 2. Shortcuts (`BOOST_SHORTCUT` & `PAVED_SHORTCUT`) Drawn Under/Merging Into Main Curbs */}
        {maskGeometries
          .filter(
            (mg) =>
              mg.mask.type === "BOOST_SHORTCUT" ||
              mg.mask.type === "PAVED_SHORTCUT"
          )
          .map((mg) => {
            const isPaved = mg.mask.type === "PAVED_SHORTCUT";
            return (
              <g
                key={mg.mask.id}
                onClick={
                  onClickMask ? (e) => onClickMask(mg.mask, e) : undefined
                }
                className={
                  onClickMask ? "cursor-pointer" : "pointer-events-none"
                }
              >
                <polygon
                  points={mg.outerPolygonPoints}
                  fill={isPaved ? "#06b6d4" : "#f59e0b"}
                  fillOpacity={0.85}
                />
                <polygon
                  points={mg.innerPolygonPoints}
                  fill={isPaved ? "#0f172a" : "#78350f"}
                  fillOpacity={0.95}
                />
                <path
                  d={mg.leftEdgePath}
                  fill="none"
                  stroke={isPaved ? "#22d3ee" : "#fbbf24"}
                  strokeWidth={isCompact ? 1.8 : 1.4}
                  strokeDasharray={isPaved ? undefined : "4 3"}
                />
                <path
                  d={mg.rightEdgePath}
                  fill="none"
                  stroke={isPaved ? "#22d3ee" : "#fbbf24"}
                  strokeWidth={isCompact ? 1.8 : 1.4}
                  strokeDasharray={isPaved ? undefined : "4 3"}
                />
                <path
                  d={mg.centerlinePath}
                  fill="none"
                  stroke={isPaved ? "#67e8f9" : "#fde047"}
                  strokeWidth={isCompact ? 1.6 : 1.2}
                  strokeDasharray="5 5"
                  opacity={0.9}
                />
                {mg.entryGate && (
                  <>
                    <circle
                      cx={mg.entryGate.lx}
                      cy={mg.entryGate.ly}
                      r={isCompact ? 2.4 : 1.9}
                      fill={isPaved ? "#22d3ee" : "#facc15"}
                      stroke="#020617"
                      strokeWidth={0.8}
                    />
                    <circle
                      cx={mg.entryGate.rx}
                      cy={mg.entryGate.ry}
                      r={isCompact ? 2.4 : 1.9}
                      fill={isPaved ? "#22d3ee" : "#facc15"}
                      stroke="#020617"
                      strokeWidth={0.8}
                    />
                  </>
                )}
                {mg.exitGate && (
                  <>
                    <circle
                      cx={mg.exitGate.lx}
                      cy={mg.exitGate.ly}
                      r={isCompact ? 2.4 : 1.9}
                      fill={isPaved ? "#22d3ee" : "#facc15"}
                      stroke="#020617"
                      strokeWidth={0.8}
                    />
                    <circle
                      cx={mg.exitGate.rx}
                      cy={mg.exitGate.ry}
                      r={isCompact ? 2.4 : 1.9}
                      fill={isPaved ? "#22d3ee" : "#facc15"}
                      stroke="#020617"
                      strokeWidth={0.8}
                    />
                  </>
                )}
                <g
                  transform={`translate(${mg.midX.toFixed(1)}, ${mg.midY.toFixed(
                    1
                  )}) rotate(${mg.midAngleDeg.toFixed(1)})`}
                >
                  <polygon
                    points="0,-4.2 3.4,2.8 0,1.0 -3.4,2.8"
                    fill={isPaved ? "#22d3ee" : "#facc15"}
                    stroke="#020617"
                    strokeWidth={0.7}
                  />
                </g>
              </g>
            );
          })}

        {/* 3. Main Variable-Width Rumble Strip Curb Base & Asphalt Road Ribbon */}
        <g className="pointer-events-none">
          <path
            d={curbRibbonPath}
            fill="#dc2626"
            fillRule="nonzero"
            opacity={0.9}
          />
          <path
            d={leftCurbEdgePath}
            fill="none"
            stroke="#f8fafc"
            strokeWidth={1.6}
            strokeDasharray="6 6"
            opacity={0.88}
          />
          <path
            d={rightCurbEdgePath}
            fill="none"
            stroke="#f8fafc"
            strokeWidth={1.6}
            strokeDasharray="6 6"
            opacity={0.88}
          />
          <path d={roadRibbonPath} fill="#1e293b" fillRule="nonzero" />
          <path
            d={centerlinePath}
            fill="none"
            stroke={variant === "RADAR" ? "#94a3b8" : "#facc15"}
            strokeWidth={isCompact ? 1.8 : 1.4}
            strokeDasharray="9 9"
            opacity={variant === "RADAR" ? 0.65 : 0.8}
          />
        </g>

        {/* 4. Parallel Split Medians (`SPLIT_MEDIAN`) & Road Holes (`ROAD_HOLE`) On Top of Asphalt */}
        {maskGeometries
          .filter(
            (mg) =>
              mg.mask.type === "SPLIT_MEDIAN" || mg.mask.type === "ROAD_HOLE"
          )
          .map((mg) => {
            if (mg.mask.type === "ROAD_HOLE") {
              return (
                <g
                  key={mg.mask.id}
                  onClick={
                    onClickMask ? (e) => onClickMask(mg.mask, e) : undefined
                  }
                  className={
                    onClickMask ? "cursor-pointer" : "pointer-events-none"
                  }
                >
                  <polygon
                    points={mg.outerPolygonPoints}
                    fill="#f43f5e"
                    fillOpacity={0.85}
                  />
                  <polygon
                    points={mg.innerPolygonPoints}
                    fill="#020617"
                    stroke="#fbbf24"
                    strokeWidth={1.0}
                    strokeDasharray="3 2"
                  />
                </g>
              );
            }

            return (
              <g
                key={mg.mask.id}
                onClick={
                  onClickMask ? (e) => onClickMask(mg.mask, e) : undefined
                }
                className={
                  onClickMask ? "cursor-pointer" : "pointer-events-none"
                }
              >
                <polygon
                  points={mg.outerPolygonPoints}
                  fill="#ef4444"
                  stroke="#f8fafc"
                  strokeWidth={1.1}
                  strokeDasharray="4 4"
                />
                <polygon
                  points={mg.innerPolygonPoints}
                  fill="#15803d"
                  stroke="#052e16"
                  strokeWidth={0.8}
                />
                <path
                  d={mg.centerlinePath}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth={1.0}
                  strokeDasharray="3 3"
                  opacity={0.75}
                />
              </g>
            );
          })}

        {/* 5. Checkered Start / Finish Line Banner & Direction Arrow */}
        <g
          data-testid="minimap-finish-line"
          transform={`translate(${finishBanner.x.toFixed(
            1
          )}, ${finishBanner.y.toFixed(1)}) rotate(${finishBanner.angleDeg.toFixed(
            1
          )})`}
          className="pointer-events-none"
        >
          <rect
            x={-finishBanner.halfWidth}
            y={-3.2}
            width={finishBanner.halfWidth * 2}
            height={6.4}
            rx={1.0}
            fill="#0f172a"
            stroke="#f8fafc"
            strokeWidth={1.0}
          />
          {[0, 1].map((row) => {
            const cols = 8;
            const cellW = (finishBanner.halfWidth * 2 - 1.2) / cols;
            return Array.from({ length: cols }).map((_, col) => (
              <rect
                key={`${row}-${col}`}
                x={-finishBanner.halfWidth + 0.6 + col * cellW}
                y={-2.6 + row * 2.6}
                width={cellW}
                height={2.6}
                fill={(row + col) % 2 === 0 ? "#f8fafc" : "#0f172a"}
              />
            ));
          })}
          <polygon
            points="0,-9.5 4.2,-4.2 1.5,-4.2 1.5,-1.2 -1.5,-1.2 -1.5,-4.2 -4.2,-4.2"
            fill="#38bdf8"
            stroke="#020617"
            strokeWidth={0.8}
          />
        </g>

        {/* 6. Placed Scenery Prefabs (Editor / Optional) */}
        {showScenery &&
          trackDef.sceneryProps.map((prop) => {
            const fill = SCENERY_COLORS[prop.type] ?? "#22c55e";
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
                onClick={
                  onClickSceneryProp
                    ? (e) => onClickSceneryProp(prop, e)
                    : undefined
                }
                className={
                  onClickSceneryProp ? "cursor-pointer" : "pointer-events-none"
                }
              >
                <circle
                  cx={0}
                  cy={0}
                  r={r}
                  fill={fill}
                  stroke="#052e16"
                  strokeWidth={1}
                />
              </g>
            );
          })}

        {/* 7. Speed Boost Pads (using precomputed coordinates) */}
        {showBoostPads &&
          boostPadGeometries.map(({ pad, x, y, angleDeg }) => (
            <g
              key={pad.id}
              transform={`translate(${x.toFixed(1)}, ${y.toFixed(
                1
              )}) rotate(${angleDeg.toFixed(1)})`}
              onClick={
                onClickBoostPad ? (e) => onClickBoostPad(pad, e) : undefined
              }
              className={
                onClickBoostPad ? "cursor-pointer" : "pointer-events-none"
              }
            >
              <rect
                x={-2.8}
                y={-3.8}
                width={5.6}
                height={7.6}
                rx={1.2}
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth={1.3}
              />
              <polygon
                points="0,-2.6 2.1,1.8 0,0.6 -2.1,1.8"
                fill="#facc15"
              />
            </g>
          ))}

        {/* 8. Item Box Rows (using precomputed coordinates) */}
        {showItemBoxes &&
          itemBoxRowGeometries.map(({ row, boxes }) => (
            <g
              key={row.id}
              onClick={
                onClickItemBoxRow
                  ? (e) => onClickItemBoxRow(row, e)
                  : undefined
              }
              className={
                onClickItemBoxRow ? "cursor-pointer" : "pointer-events-none"
              }
            >
              {boxes.map((pt, idx) => (
                <rect
                  key={idx}
                  x={pt.x - 1.55}
                  y={pt.y - 1.55}
                  width={3.1}
                  height={3.1}
                  rx={0.6}
                  fill="#22d3ee"
                  stroke="#facc15"
                  strokeWidth={0.9}
                />
              ))}
            </g>
          ))}

        {/* 9. Static Obstacles & Stunt Jump Ramps */}
        {showObstacles &&
          trackDef.obstacles.map((obs) => {
            const fill = OBSTACLE_COLORS[obs.type] ?? "#f97316";
            const s = obs.scale || 1;
            if (obs.type === "JUMP_RAMP") {
              const rotDeg = ((obs.rotationY || 0) * 180) / Math.PI;
              return (
                <g
                  key={obs.id}
                  transform={`translate(${obs.x.toFixed(1)}, ${(-obs.z).toFixed(
                    1
                  )}) rotate(${rotDeg.toFixed(1)})`}
                  onClick={
                    onClickObstacle ? (e) => onClickObstacle(obs, e) : undefined
                  }
                  className={
                    onClickObstacle ? "cursor-pointer" : "pointer-events-none"
                  }
                >
                  <rect
                    x={-3.4 * s}
                    y={-4.2 * s}
                    width={6.8 * s}
                    height={8.4 * s}
                    rx={1.2}
                    fill="#be185d"
                    stroke="#f472b6"
                    strokeWidth={1.3}
                  />
                  <polygon
                    points={`0,${-3.0 * s} ${2.4 * s},${2.2 * s} ${-2.4 * s},${
                      2.2 * s
                    }`}
                    fill="#fde047"
                  />
                </g>
              );
            }
            return (
              <circle
                key={obs.id}
                cx={obs.x}
                cy={-obs.z}
                r={Math.max(2.6, 3.2 * s)}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={1.1}
                onClick={
                  onClickObstacle ? (e) => onClickObstacle(obs, e) : undefined
                }
                className={
                  onClickObstacle ? "cursor-pointer" : "pointer-events-none"
                }
              />
            );
          })}
      </>
    );
  }
);
MemoizedStaticTrackLayers.displayName = "MemoizedStaticTrackLayers";

interface DynamicTrackOverlayProps {
  variant: UnifiedMapVariant;
  aiTraces?: UnifiedMapRacerTrace[];
  traceColorMode?: AiTraceColorMode;
  bottleneckZones?: UnifiedMapBottleneckZone[];
  activeHazards?: UnifiedMapActiveHazard[];
  racers?: RacerStanding[];
}

const DynamicTrackOverlayLayers: React.FC<DynamicTrackOverlayProps> = ({
  variant,
  aiTraces,
  traceColorMode = "SURFACE",
  bottleneckZones,
  activeHazards,
  racers,
}) => {
  const isCompact = variant === "RADAR" || variant === "PREVIEW";

  // Batch AI trace segments by color into a handful of <path> strings instead of ~1,000 individual <line> DOM nodes
  const batchedTracePaths = useMemo(() => {
    if (!aiTraces || aiTraces.length === 0) return [];
    const byColor = new Map<string, string[]>();
    for (const racerTrace of aiTraces) {
      const samples = racerTrace.pathSamples;
      if (!samples || samples.length < 2) continue;
      for (let idx = 1; idx < samples.length; idx++) {
        const s = samples[idx];
        const prev = samples[idx - 1];
        const distSq =
          (s.x - prev.x) * (s.x - prev.x) + (s.z - prev.z) * (s.z - prev.z);
        if (distSq > 1600) continue;
        const hex = getUnifiedAiTraceSampleColor(s, traceColorMode).hex;
        let bucket = byColor.get(hex);
        if (!bucket) {
          bucket = [];
          byColor.set(hex, bucket);
        }
        bucket.push(
          `M${prev.x.toFixed(1)},${(-prev.z).toFixed(1)}L${s.x.toFixed(1)},${(
            -s.z
          ).toFixed(1)}`
        );
      }
    }
    return Array.from(byColor.entries()).map(([hex, segs]) => ({
      hex,
      d: segs.join(""),
    }));
  }, [aiTraces, traceColorMode]);

  return (
    <>
      {/* 10. Live Deployed Combat Hazards (Cryo Mines & Glitch Prisms) */}
      {activeHazards &&
        activeHazards.map((hz) => {
          const isCryo = hz.type === "CRYO_MINE";
          return (
            <g
              key={hz.id}
              transform={`translate(${hz.x.toFixed(1)}, ${(-hz.z).toFixed(1)})`}
              className="pointer-events-none"
            >
              <circle
                cx={0}
                cy={0}
                r={isCompact ? 4.8 : 4.0}
                fill={
                  isCryo
                    ? "rgba(34,211,238,0.28)"
                    : "rgba(232,121,249,0.28)"
                }
                stroke={isCryo ? "#22d3ee" : "#e879f9"}
                strokeWidth={1.3}
              />
              <circle
                cx={0}
                cy={0}
                r={isCompact ? 2.2 : 1.8}
                fill={isCryo ? "#67e8f9" : "#f0abfc"}
              />
            </g>
          );
        })}

      {/* 11. Batched Recorded AI Racing Path Traces */}
      {batchedTracePaths.map(({ hex, d }) => (
        <path
          key={hex}
          d={d}
          fill="none"
          stroke={hex}
          strokeWidth={hex === "#f43f5e" ? 2.6 : 1.8}
          strokeOpacity={0.9}
          strokeLinecap="round"
          className="pointer-events-none"
        />
      ))}

      {/* 12. Spatial Bottleneck / Off-Road Scrub Cluster Rings */}
      {bottleneckZones &&
        bottleneckZones.map((bz, idx) => (
          <g key={`bz-${idx}`} className="pointer-events-none">
            <circle
              cx={bz.x}
              cy={-bz.z}
              r={Math.min(18, 8.5 + bz.hits * 1.1)}
              fill="rgba(244,63,94,0.22)"
              stroke="#fb7185"
              strokeWidth={1.6}
              strokeDasharray="3.5 2.5"
            />
            <circle cx={bz.x} cy={-bz.z} r={3.2} fill="#f43f5e" />
          </g>
        ))}

      {/* 13. Live Racers (Karts on Radar / AI Trace Map) */}
      {racers &&
        racers.map((r) => {
          const isHeavy = r.mass >= 200 || r.effectiveMass >= 9999;
          const isFeather = r.mass <= 60;
          const isHuman = Boolean(r.isPlayer || r.isRemoteHuman);
          const baseScale = variant === "AI_TRACE" ? 0.72 : 1.0;
          const radius =
            (r.isPlayer ? 12.5 : isHeavy ? 11.2 : isFeather ? 8.4 : 9.6) *
            baseScale;
          return (
            <g key={r.racerId} className="pointer-events-none">
              {isHuman && (
                <circle
                  cx={r.worldX}
                  cy={-r.worldZ}
                  r={radius + 4.5 * baseScale}
                  fill="none"
                  stroke={r.isPlayer ? "#fde047" : "#22d3ee"}
                  strokeWidth={1.8 * baseScale}
                  opacity={0.75}
                />
              )}
              <circle
                cx={r.worldX}
                cy={-r.worldZ}
                r={radius}
                fill={r.color}
                stroke={
                  r.isPlayer
                    ? "#ffffff"
                    : r.isRemoteHuman
                    ? "#22d3ee"
                    : "#020617"
                }
                strokeWidth={(isHuman ? 3.6 : 2.2) * baseScale}
              />
              {isHuman && variant === "RADAR" && (
                <text
                  x={r.worldX}
                  y={-r.worldZ - radius - 5}
                  textAnchor="middle"
                  fill={r.isPlayer ? "#fde047" : "#67e8f9"}
                  stroke="#020617"
                  strokeWidth="3.0"
                  paintOrder="stroke"
                  fontSize="12"
                  fontWeight="900"
                >
                  {r.isPlayer ? "YOU" : r.name.slice(0, 8).toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
    </>
  );
};

export interface UnifiedTrackMapLayersProps {
  trackDef: CustomTrackDefinition;
  geometry: ComputedUnifiedMapGeometry;
  variant: UnifiedMapVariant;
  showScenery?: boolean;
  showWallBoundary?: boolean;
  showItemBoxes?: boolean;
  showObstacles?: boolean;
  showBoostPads?: boolean;
  aiTraces?: UnifiedMapRacerTrace[];
  traceColorMode?: AiTraceColorMode;
  bottleneckZones?: UnifiedMapBottleneckZone[];
  activeHazards?: UnifiedMapActiveHazard[];
  racers?: RacerStanding[];
  onClickMask?: (mask: PlacedTrackMask, e: React.MouseEvent) => void;
  onClickBoostPad?: (pad: PlacedBoostPad, e: React.MouseEvent) => void;
  onClickItemBoxRow?: (row: PlacedItemBoxRow, e: React.MouseEvent) => void;
  onClickObstacle?: (obs: PlacedObstacle, e: React.MouseEvent) => void;
  onClickSceneryProp?: (prop: PlacedSceneryProp, e: React.MouseEvent) => void;
}

export const UnifiedTrackMapLayers: React.FC<UnifiedTrackMapLayersProps> = ({
  trackDef,
  geometry,
  variant,
  showScenery = variant === "EDITOR",
  showWallBoundary = variant !== "PREVIEW",
  showItemBoxes = variant !== "PREVIEW",
  showObstacles = true,
  showBoostPads = true,
  aiTraces,
  traceColorMode = "SURFACE",
  bottleneckZones,
  activeHazards,
  racers,
  onClickMask,
  onClickBoostPad,
  onClickItemBoxRow,
  onClickObstacle,
  onClickSceneryProp,
}) => {
  return (
    <>
      <MemoizedStaticTrackLayers
        trackDef={trackDef}
        geometry={geometry}
        variant={variant}
        showScenery={showScenery}
        showWallBoundary={showWallBoundary}
        showItemBoxes={showItemBoxes}
        showObstacles={showObstacles}
        showBoostPads={showBoostPads}
        onClickMask={onClickMask}
        onClickBoostPad={onClickBoostPad}
        onClickItemBoxRow={onClickItemBoxRow}
        onClickObstacle={onClickObstacle}
        onClickSceneryProp={onClickSceneryProp}
      />
      <DynamicTrackOverlayLayers
        variant={variant}
        aiTraces={aiTraces}
        traceColorMode={traceColorMode}
        bottleneckZones={bottleneckZones}
        activeHazards={activeHazards}
        racers={racers}
      />
    </>
  );
};

interface StaticTrackSvgContainerProps {
  trackDef: CustomTrackDefinition;
  geometry: ComputedUnifiedMapGeometry;
  variant: UnifiedMapVariant;
  showScenery?: boolean;
  showWallBoundary?: boolean;
  showItemBoxes?: boolean;
  showObstacles?: boolean;
  showBoostPads?: boolean;
}

/**
 * Isolated Static SVG Layer:
 * Never receives `racers`, `activeHazards`, or `aiTraces`, so React.memo skips it 100% of the time during
 * 12.5Hz HUD telemetry updates, and the browser compositor caches the rasterized track bitmap on the GPU!
 */
const MemoizedStaticTrackSvgContainer: React.FC<StaticTrackSvgContainerProps> =
  React.memo(
    ({
      trackDef,
      geometry,
      variant,
      showScenery,
      showWallBoundary,
      showItemBoxes,
      showObstacles,
      showBoostPads,
    }) => {
      return (
        <svg
          viewBox={geometry.bounds.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full block pointer-events-none"
          style={{ transform: "translateZ(0)" }}
        >
          <MemoizedStaticTrackLayers
            trackDef={trackDef}
            geometry={geometry}
            variant={variant}
            showScenery={showScenery}
            showWallBoundary={showWallBoundary}
            showItemBoxes={showItemBoxes}
            showObstacles={showObstacles}
            showBoostPads={showBoostPads}
          />
        </svg>
      );
    }
  );
MemoizedStaticTrackSvgContainer.displayName = "MemoizedStaticTrackSvgContainer";

export interface UnifiedTrackMapProps {
  trackDef: CustomTrackDefinition;
  variant?: UnifiedMapVariant;
  className?: string;
  testId?: string;
  showScenery?: boolean;
  showWallBoundary?: boolean;
  showItemBoxes?: boolean;
  showObstacles?: boolean;
  showBoostPads?: boolean;
  aiTraces?: UnifiedMapRacerTrace[];
  traceColorMode?: AiTraceColorMode;
  bottleneckZones?: UnifiedMapBottleneckZone[];
  activeHazards?: UnifiedMapActiveHazard[];
  racers?: RacerStanding[];
}

export const UnifiedTrackMap: React.FC<UnifiedTrackMapProps> = ({
  trackDef,
  variant = "RADAR",
  className = "",
  testId,
  showScenery,
  showWallBoundary,
  showItemBoxes,
  showObstacles,
  showBoostPads,
  aiTraces,
  traceColorMode = "SURFACE",
  bottleneckZones,
  activeHazards,
  racers,
}) => {
  const geometry = useMemo(
    () => computeUnifiedMapGeometry(trackDef),
    [trackDef]
  );

  const hasDynamicOverlay = Boolean(
    (racers && racers.length > 0) ||
      (activeHazards && activeHazards.length > 0) ||
      (aiTraces && aiTraces.length > 0) ||
      (bottleneckZones && bottleneckZones.length > 0)
  );

  return (
    <div
      data-testid={testId}
      className={`relative select-none overflow-hidden ${className}`}
    >
      {/* Layer 1: GPU-Cached Static Track Geometry SVG (never repaints when karts move!) */}
      <MemoizedStaticTrackSvgContainer
        trackDef={trackDef}
        geometry={geometry}
        variant={variant}
        showScenery={showScenery}
        showWallBoundary={showWallBoundary}
        showItemBoxes={showItemBoxes}
        showObstacles={showObstacles}
        showBoostPads={showBoostPads}
      />

      {/* Layer 2: Lightweight Dynamic Overlay SVG (only 4 kart circles & active traps/traces) */}
      {hasDynamicOverlay && (
        <svg
          viewBox={geometry.bounds.viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full block pointer-events-none"
        >
          <DynamicTrackOverlayLayers
            variant={variant}
            aiTraces={aiTraces}
            traceColorMode={traceColorMode}
            bottleneckZones={bottleneckZones}
            activeHazards={activeHazards}
            racers={racers}
          />
        </svg>
      )}
    </div>
  );
};
