import {
  Color3,
  Color4,
  Curve3,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Path3D,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Culling/ray";
import {
  CustomTrackDefinition,
  GrandPrixCupDefinition,
  ObstaclePrefabType,
  PlacedBoostPad,
  PlacedObstacle,
  PlacedSceneryProp,
  PlacedTrackMask,
  SceneryPrefabType,
  TerrainSculptMod,
  TrackBiome,
  TrackMaskType,
} from "@/src/types/game";
import defaultCupsJson from "./defaultCups.json";

export interface TrackSample {
  index: number;
  position: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
  cumulativeDistance: number;
  widthScale: number;
  localRoadHalfWidth: number;
  localCurbWidth: number;
  localWallHalfWidth: number;
}

export interface ClosestTrackQuery {
  sampleIndex: number;
  closestPoint: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
  horizontalDistance: number;
  signedLateralOffset: number;
  roadY: number;
  normalizedSplineT: number;
  distanceAlongTrack: number;
  widthScale: number;
  localRoadHalfWidth: number;
  localCurbWidth: number;
  localWallHalfWidth: number;
}

export interface BoostPadZone {
  id: string;
  position: Vector3;
  tangent: Vector3;
  radius: number;
}

export interface TrackObstacleZone {
  id: string;
  type: ObstaclePrefabType;
  position: Vector3;
  radius: number;
  rotationY: number;
  scale?: number;
}

export interface BuiltTrack {
  biome: TrackBiome;
  controlPoints: Vector3[];
  splinePoints: Vector3[];
  path3d: Path3D;
  samples: TrackSample[];
  totalTrackLength: number;
  roadHalfWidth: number;
  curbWidth: number;
  wallHalfWidth: number;
  pavementMesh: Mesh;
  leftCurbMesh: Mesh;
  rightCurbMesh: Mesh;
  groundMesh: Mesh;
  shadowGenerator: ShadowGenerator;
  itemBoxRowIndices: number[];
  boostPads: BoostPadZone[];
  obstacles: TrackObstacleZone[];
  trackMasks: PlacedTrackMask[];
  queryClosestTrackPoint: (
    worldPos: Vector3,
    hintSampleIndex?: number
  ) => ClosestTrackQuery;
  getPointAtNormalizedT: (t: number, lateralOffset?: number) => {
    position: Vector3;
    tangent: Vector3;
    normal: Vector3;
    binormal: Vector3;
    sampleIndex: number;
  };
  miniMapSvgPath: string;
  miniMapViewBox: string;
}

export const ROAD_HALF_WIDTH = 13.5; // 27 units total default asphalt width
export const CURB_OUTER_WIDTH = ROAD_HALF_WIDTH + 1.5; // 15.0
export const WALL_HALF_WIDTH = 26.0; // Outer boundary wall allowing 11.0u of grass/dirt runoff on each side

const TRACK_STORAGE_KEY = "gutsy_karts_custom_track_v1";

export const DEFAULT_CONTROL_POINTS: Array<{ x: number; y: number; z: number }> = [
  { x: 0, y: 0.0, z: 0 }, // 0: Start/Finish straightaway center
  { x: 0, y: 0.6, z: 84 }, // 1: Main straightaway north exit
  { x: 32, y: 4.2, z: 164 }, // 2: North-East sweeper climb
  { x: 104, y: 8.5, z: 208 }, // 3: High crest approach
  { x: 188, y: 10.5, z: 196 }, // 4: Overlook summit
  { x: 252, y: 7.5, z: 136 }, // 5: Sweeping downhill turn
  { x: 264, y: 3.6, z: 48 }, // 6: Eastern S-curve entry
  { x: 208, y: 1.6, z: -20 }, // 7: S-curve inner apex
  { x: 224, y: 4.2, z: -104 }, // 8: S-curve outer counter-bend
  { x: 260, y: 8.0, z: -184 }, // 9: South-East hill crest
  { x: 208, y: 5.8, z: -256 }, // 10: Southern hairpin entry
  { x: 124, y: 2.6, z: -276 }, // 11: Southern backstretch
  { x: 40, y: 1.0, z: -256 }, // 12: South-West sweeper
  { x: -24, y: 0.3, z: -204 }, // 13: Suburban cul-de-sac bend
  { x: -28, y: 0.0, z: -128 }, // 14: Final corner exit
  { x: -6, y: 0.0, z: -64 }, // 15: Start straightaway approach
];

/**
 * Evaluates a Centripetal Catmull-Rom spline segment (alpha = 0.5) which is mathematically
 * guaranteed never to form cusps or self-intersecting pigtail loops even when control points
 * are placed at highly uneven distances in the Track Editor.
 */
function evalCentripetalCatmullRom(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
  alpha = 0.5
): Vector3 {
  const d01 = Math.max(1e-3, Math.pow(Vector3.Distance(p0, p1), alpha));
  const d12 = Math.max(1e-3, Math.pow(Vector3.Distance(p1, p2), alpha));
  const d23 = Math.max(1e-3, Math.pow(Vector3.Distance(p2, p3), alpha));

  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const u = t1 + t * (t2 - t1);

  const A1 = p0
    .scale((t1 - u) / (t1 - t0))
    .add(p1.scale((u - t0) / (t1 - t0)));
  const A2 = p1
    .scale((t2 - u) / (t2 - t1))
    .add(p2.scale((u - t1) / (t2 - t1)));
  const A3 = p2
    .scale((t3 - u) / (t3 - t2))
    .add(p3.scale((u - t2) / (t3 - t2)));

  const B1 = A1
    .scale((t2 - u) / (t2 - t0))
    .add(A2.scale((u - t0) / (t2 - t0)));
  const B2 = A2
    .scale((t3 - u) / (t3 - t1))
    .add(A3.scale((u - t1) / (t3 - t1)));

  return B1
    .scale((t2 - u) / (t2 - t1))
    .add(B2.scale((u - t1) / (t2 - t1)));
}

/**
 * Evaluates C2-continuous radial terrain brush strokes (hills, mounds, valleys) at (wx, wz).
 */
export function evaluateTerrainModsAt(
  wx: number,
  wz: number,
  terrainMods: TerrainSculptMod[] = []
): number {
  let customDeltaY = 0;
  for (let m = 0; m < terrainMods.length; m++) {
    const mod = terrainMods[m];
    const dx = wx - mod.x;
    const dz = wz - mod.z;
    const dSq = dx * dx + dz * dz;
    const rSq = mod.radius * mod.radius;
    if (dSq < rSq) {
      const t = 1 - dSq / rSq;
      // C2-continuous cubic-squared bell curve (zero slope and zero curvature at boundary)
      customDeltaY += mod.deltaY * t * t * t;
    }
  }
  return customDeltaY;
}

/**
 * Pure mathematical spline + Frenet-Serret sample builder shared by both the 2D Overhead Track Editor
 * and the 3D Babylon.js TrackBuilder.
 */
export function computeTrackSplineSamples(
  rawControlPoints: Array<{ x: number; y: number; z: number; widthScale?: number }>,
  subdivisionsPerSegment = 35,
  terrainMods: TerrainSculptMod[] = [],
  baseRoadHalfWidth = ROAD_HALF_WIDTH,
  trackMasks: PlacedTrackMask[] = []
): {
  controlPoints: Vector3[];
  splinePoints: Vector3[];
  path3d: Path3D;
  samples: TrackSample[];
  totalTrackLength: number;
  queryClosestTrackPoint: (
    worldPos: Vector3,
    hintSampleIndex?: number
  ) => ClosestTrackQuery;
  getPointAtNormalizedT: (t: number, lateralOffset?: number) => {
    position: Vector3;
    tangent: Vector3;
    normal: Vector3;
    binormal: Vector3;
    sampleIndex: number;
  };
} {
  const safePoints =
    rawControlPoints.length >= 4 ? rawControlPoints : DEFAULT_CONTROL_POINTS;
  const controlPoints = safePoints.map((p) => new Vector3(p.x, p.y, p.z));
  const hasCustomWidths = safePoints.some(
    (p) =>
      typeof (p as { widthScale?: number }).widthScale === "number" &&
      Math.abs(((p as { widthScale?: number }).widthScale ?? 1.0) - 1.0) > 1e-3
  );

  // 1. Evaluate dense Centripetal Catmull-Rom (alpha = 0.5), which is mathematically guaranteed
  // never to form self-intersecting pigtail loops or cusps on unevenly spaced control points.
  const denseCentripetal: Vector3[] = [];
  const denseWidths: number[] = [];
  const numCtrl = controlPoints.length;
  const denseSteps = 36;
  for (let i = 0; i < numCtrl; i++) {
    const p0 = controlPoints[(i - 1 + numCtrl) % numCtrl];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % numCtrl];
    const p3 = controlPoints[(i + 2) % numCtrl];
    const w1 = Math.max(
      0.5,
      Math.min(
        2.2,
        Number((safePoints[i] as { widthScale?: number }).widthScale ?? 1.0) || 1.0
      )
    );
    const w2 = Math.max(
      0.5,
      Math.min(
        2.2,
        Number(
          (safePoints[(i + 1) % numCtrl] as { widthScale?: number }).widthScale ?? 1.0
        ) || 1.0
      )
    );
    for (let s = 0; s < denseSteps; s++) {
      const u = s / denseSteps;
      denseCentripetal.push(evalCentripetalCatmullRom(p0, p1, p2, p3, u));
      const smoothU = u * u * (3 - 2 * u);
      denseWidths.push(w1 + (w2 - w1) * smoothU);
    }
  }

  // 2. Resample the Centripetal curve at uniform horizontal arc-length intervals so Curve3.CreateCatmullRomSpline
  // receives uniformly-spaced guide nodes and never bunches or steps on steep vertical climbs.
  const denseDists: number[] = [0];
  let denseTotalLen = 0;
  for (let i = 1; i < denseCentripetal.length; i++) {
    const a = denseCentripetal[i - 1];
    const b = denseCentripetal[i];
    denseTotalLen += Math.hypot(b.x - a.x, b.z - a.z);
    denseDists.push(denseTotalLen);
  }
  const lastDense = denseCentripetal[denseCentripetal.length - 1];
  const firstDense = denseCentripetal[0];
  denseTotalLen += Math.hypot(
    firstDense.x - lastDense.x,
    firstDense.z - lastDense.z
  );

  const numGuideNodes = Math.max(72, numCtrl * 8);
  const uniformGuidePoints: Vector3[] = [];
  const uniformGuideWidths: number[] = [];
  let searchIdx = 0;
  for (let g = 0; g < numGuideNodes; g++) {
    const targetD = (g / numGuideNodes) * denseTotalLen;
    while (
      searchIdx + 1 < denseDists.length &&
      denseDists[searchIdx + 1] <= targetD
    ) {
      searchIdx++;
    }
    const nextIdx = (searchIdx + 1) % denseCentripetal.length;
    const d0 = denseDists[searchIdx];
    const d1 = nextIdx === 0 ? denseTotalLen : denseDists[nextIdx];
    const f = d1 > d0 ? Math.max(0, Math.min(1, (targetD - d0) / (d1 - d0))) : 0;
    uniformGuidePoints.push(
      Vector3.Lerp(denseCentripetal[searchIdx], denseCentripetal[nextIdx], f)
    );
    uniformGuideWidths.push(
      denseWidths[searchIdx] +
        (denseWidths[nextIdx] - denseWidths[searchIdx]) * f
    );
  }

  const subStep = Math.max(
    3,
    Math.round((numCtrl * subdivisionsPerSegment) / numGuideNodes)
  );
  const closedSpline = Curve3.CreateCatmullRomSpline(
    uniformGuidePoints,
    subStep,
    true
  );
  const rawPoints = closedSpline.getPoints();

  const splinePoints =
    rawPoints.length > 1 &&
    Vector3.DistanceSquared(rawPoints[0], rawPoints[rawPoints.length - 1]) <
      0.001
      ? rawPoints.slice(0, rawPoints.length - 1)
      : rawPoints;

  // Apply C2-continuous terrainMods brush height to dense road spline samples so brushing a hill over the road
  // raises the road with glass-smooth continuous curvature!
  if (terrainMods.length > 0) {
    for (let i = 0; i < splinePoints.length; i++) {
      const pt = splinePoints[i];
      const modY = evaluateTerrainModsAt(pt.x, pt.z, terrainMods);
      pt.y = Math.max(-16, Math.min(60, pt.y + modY));
    }
  }

  // Apply longitudinal circular binomial smoothing [0.25, 0.5, 0.25] on splinePoints[i].y
  // to guarantee zero steps, brush seams, or kinks anywhere along the 3D road elevation profile.
  const nPts = splinePoints.length;
  if (nPts >= 4) {
    const smoothPasses = terrainMods.length > 0 ? 22 : 12;
    const tempY = new Float64Array(nPts);
    for (let pass = 0; pass < smoothPasses; pass++) {
      for (let i = 0; i < nPts; i++) {
        const prevY = splinePoints[(i - 1 + nPts) % nPts].y;
        const currY = splinePoints[i].y;
        const nextY = splinePoints[(i + 1) % nPts].y;
        tempY[i] = 0.25 * prevY + 0.5 * currY + 0.25 * nextY;
      }
      for (let i = 0; i < nPts; i++) {
        splinePoints[i].y = tempY[i];
      }
    }
  }

  // Compute per-sample widthScale (strictly 1.0 everywhere if no custom node widths or split medians exist)
  const sampleWidths = new Float64Array(nPts);
  if (!hasCustomWidths) {
    sampleWidths.fill(1.0);
  } else {
    for (let i = 0; i < nPts; i++) {
      const gFloat = (i / nPts) * numGuideNodes;
      const g0 = Math.floor(gFloat) % numGuideNodes;
      const g1 = (g0 + 1) % numGuideNodes;
      const gf = gFloat - Math.floor(gFloat);
      sampleWidths[i] =
        uniformGuideWidths[g0] +
        (uniformGuideWidths[g1] - uniformGuideWidths[g0]) * gf;
    }
    const tempW = new Float64Array(nPts);
    for (let pass = 0; pass < 10; pass++) {
      for (let i = 0; i < nPts; i++) {
        const prevW = sampleWidths[(i - 1 + nPts) % nPts];
        const currW = sampleWidths[i];
        const nextW = sampleWidths[(i + 1) % nPts];
        tempW[i] = 0.25 * prevW + 0.5 * currW + 0.25 * nextW;
      }
      for (let i = 0; i < nPts; i++) {
        sampleWidths[i] = tempW[i];
      }
    }
  }

  const path3d = new Path3D(splinePoints, new Vector3(0, 1, 0), false, true);

  const samples: TrackSample[] = [];
  const worldUp = new Vector3(0, 1, 0);
  let runningDistance = 0;

  for (let i = 0; i < splinePoints.length; i++) {
    const center = splinePoints[i].clone();
    if (i > 0) {
      runningDistance += Vector3.Distance(splinePoints[i - 1], center);
    }

    const nextPt = splinePoints[(i + 1) % splinePoints.length];
    const prevPt =
      splinePoints[(i - 1 + splinePoints.length) % splinePoints.length];

    // Central-difference tangent guarantees smooth, forward-oriented tangents even at sharp custom control points
    let tangent = nextPt.subtract(prevPt);
    if (tangent.lengthSquared() < 1e-6) {
      tangent = nextPt.subtract(center);
    }
    if (tangent.lengthSquared() < 1e-6) {
      tangent = new Vector3(0, 0, 1);
    } else {
      tangent.normalize();
    }

    let binormal = Vector3.Cross(worldUp, tangent);
    if (binormal.lengthSquared() < 1e-5) {
      binormal = new Vector3(1, 0, 0);
    } else {
      binormal.normalize();
    }

    const normal = Vector3.Cross(tangent, binormal).normalize();

    const wScale = sampleWidths[i];
    const localHalfW = baseRoadHalfWidth * wScale;
    samples.push({
      index: i,
      position: center,
      tangent,
      normal,
      binormal,
      cumulativeDistance: runningDistance,
      widthScale: wScale,
      localRoadHalfWidth: localHalfW,
      localCurbWidth: localHalfW + 1.5,
      localWallHalfWidth: Math.max(WALL_HALF_WIDTH, localHalfW + 12.5),
    });
  }

  const lastSample = samples[samples.length - 1];
  const closingStep = Vector3.Distance(
    lastSample.position,
    samples[0].position
  );
  const totalTrackLength = Math.max(
    1,
    lastSample.cumulativeDistance + closingStep
  );

  // Automatically flare road width around SPLIT_MEDIAN masks and carve outer wall boundaries around BOOST_SHORTCUT, PAVED_SHORTCUT & SHALLOW_WATER zones
  const corridorMasks = (trackMasks ?? []).filter(
    (m) =>
      m.type === "SPLIT_MEDIAN" ||
      m.type === "BOOST_SHORTCUT" ||
      m.type === "PAVED_SHORTCUT" ||
      m.type === "SHALLOW_WATER"
  );
  if (corridorMasks.length > 0) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      for (const mask of corridorMasks) {
        const maskCenterDist =
          (((mask.normT % 1) + 1) % 1) * totalTrackLength;
        const rawDiff = Math.abs(s.cumulativeDistance - maskCenterDist);
        const longDist = Math.min(rawDiff, totalTrackLength - rawDiff);
        const halfLen = Math.max(8, mask.length * 0.5);
        const rampLen = mask.type === "SPLIT_MEDIAN" ? 18.0 : 24.0;
        if (longDist <= halfLen + rampLen) {
          const flareFactor =
            longDist <= halfLen
              ? 1.0
              : 0.5 *
                (1 + Math.cos((Math.PI * (longDist - halfLen)) / rampLen));
          if (mask.type === "SPLIT_MEDIAN") {
            const extraScale = Math.max(
              0.36,
              (mask.width * 0.5 + 3.2) / Math.max(8, baseRoadHalfWidth)
            );
            s.widthScale = Math.max(
              s.widthScale,
              1.0 + flareFactor * extraScale
            );
            s.localRoadHalfWidth = baseRoadHalfWidth * s.widthScale;
            s.localCurbWidth = s.localRoadHalfWidth + 1.5;
            s.localWallHalfWidth = Math.max(
              s.localWallHalfWidth,
              s.localRoadHalfWidth + 12.5
            );
          } else {
            // Carve out the perimeter wall collider so karts can drive freely through BOOST_SHORTCUT & PAVED_SHORTCUT corridors
            const shortcutOuterReach =
              Math.abs(mask.lateral) + mask.width * 0.5 + 11.5;
            const targetWallHalf =
              s.localWallHalfWidth +
              Math.max(0, shortcutOuterReach - s.localWallHalfWidth) *
                flareFactor;
            s.localWallHalfWidth = Math.max(
              s.localWallHalfWidth,
              targetWallHalf
            );
          }
        }
      }
    }
  }

  const queryClosestTrackPoint = (
    worldPos: Vector3,
    hintSampleIndex?: number
  ): ClosestTrackQuery => {
    const numSamples = samples.length;
    let bestIdx = 0;
    let bestDistSq = Number.POSITIVE_INFINITY;

    // When a kart provides its previous sampleIndex, search a local continuity window first
    // so karts never jump across nearby/parallel segments or hairpin legs on custom user-edited maps.
    if (
      hintSampleIndex !== undefined &&
      hintSampleIndex >= 0 &&
      hintSampleIndex < numSamples
    ) {
      const windowRadius = Math.max(12, Math.round(numSamples * 0.035));
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const i = ((hintSampleIndex + offset) % numSamples + numSamples) % numSamples;
        const p = samples[i].position;
        const dx = worldPos.x - p.x;
        const dz = worldPos.z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    // Fall back to global search if no hint was provided or if the kart is far outside the local corridor
    if (hintSampleIndex === undefined || bestDistSq > 42 * 42) {
      bestDistSq = Number.POSITIVE_INFINITY;
      for (let i = 0; i < numSamples; i++) {
        const p = samples[i].position;
        const dx = worldPos.x - p.x;
        const dz = worldPos.z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    // Walk at most 2 samples forward or backward so worldPos is bracketed between cross-sections idxA and idxB
    let idxA = bestIdx;
    for (let step = 0; step < 2; step++) {
      const sCurr = samples[idxA];
      const tLen = Math.hypot(sCurr.tangent.x, sCurr.tangent.z) || 1;
      const projCurr =
        ((worldPos.x - sCurr.position.x) * sCurr.tangent.x +
          (worldPos.z - sCurr.position.z) * sCurr.tangent.z) /
        tLen;
      if (projCurr < 0) {
        idxA = (idxA - 1 + numSamples) % numSamples;
      } else {
        const idxNext = (idxA + 1) % numSamples;
        const sNext = samples[idxNext];
        const tNextLen = Math.hypot(sNext.tangent.x, sNext.tangent.z) || 1;
        const projNext =
          ((worldPos.x - sNext.position.x) * sNext.tangent.x +
            (worldPos.z - sNext.position.z) * sNext.tangent.z) /
          tNextLen;
        if (projNext > 0) {
          idxA = idxNext;
        } else {
          break;
        }
      }
    }

    const idxB = (idxA + 1) % numSamples;
    const chosenA = samples[idxA];
    const chosenB = samples[idxB];

    // Smooth cross-section tangent projection (dA / (dA + dB)):
    // Eliminates outer-corner vertex clamping plateaus and inner-corner bisector jumps on curved hills!
    const tALen = Math.hypot(chosenA.tangent.x, chosenA.tangent.z) || 1;
    const tBLen = Math.hypot(chosenB.tangent.x, chosenB.tangent.z) || 1;
    const dA =
      ((worldPos.x - chosenA.position.x) * chosenA.tangent.x +
        (worldPos.z - chosenA.position.z) * chosenA.tangent.z) /
      tALen;
    const dB =
      ((chosenB.position.x - worldPos.x) * chosenB.tangent.x +
        (chosenB.position.z - worldPos.z) * chosenB.tangent.z) /
      tBLen;

    let tSeg: number;
    if (dA >= 0 && dB >= 0 && dA + dB > 1e-4) {
      tSeg = dA / (dA + dB);
    } else {
      const segProj = projectHorizontalSegment(
        worldPos,
        chosenA.position,
        chosenB.position
      );
      tSeg = segProj.t;
    }
    tSeg = Math.max(0, Math.min(1, tSeg));

    // C1-continuous Catmull-Rom cubic Hermite elevation interpolation across (s0, chosenA, chosenB, s3)
    const s0 = samples[(idxA - 1 + numSamples) % numSamples];
    const s3 = samples[(idxB + 1) % numSamples];
    const y0 = s0.position.y;
    const y1 = chosenA.position.y;
    const y2 = chosenB.position.y;
    const y3 = s3.position.y;
    const u2 = tSeg * tSeg;
    const u3 = u2 * tSeg;
    const smoothRoadY =
      y1 +
      0.5 * (y2 - y0) * tSeg +
      (y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3) * u2 +
      (-0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3) * u3;

    const closestPt = Vector3.Lerp(chosenA.position, chosenB.position, tSeg);
    closestPt.y = smoothRoadY;

    const interpTangent = Vector3.Lerp(
      chosenA.tangent,
      chosenB.tangent,
      tSeg
    ).normalize();
    const interpNormal = Vector3.Lerp(
      chosenA.normal,
      chosenB.normal,
      tSeg
    ).normalize();
    const interpBinormal = Vector3.Lerp(
      chosenA.binormal,
      chosenB.binormal,
      tSeg
    ).normalize();
    const interpWidthScale =
      chosenA.widthScale + (chosenB.widthScale - chosenA.widthScale) * tSeg;
    const localRoadHalfWidth = baseRoadHalfWidth * interpWidthScale;
    const localCurbWidth = localRoadHalfWidth + 1.5;
    const localWallHalfWidth =
      chosenA.localWallHalfWidth +
      (chosenB.localWallHalfWidth - chosenA.localWallHalfWidth) * tSeg;

    const dx = worldPos.x - closestPt.x;
    const dz = worldPos.z - closestPt.z;
    const offsetVec = new Vector3(dx, 0, dz);
    const horizontalDistance = Math.hypot(dx, dz);
    const signedLateralOffset = Vector3.Dot(offsetVec, interpBinormal);

    const segLen = Vector3.Distance(chosenA.position, chosenB.position);
    const distanceAlongTrack =
      (chosenA.cumulativeDistance + tSeg * segLen) % totalTrackLength;
    const normalizedSplineT = distanceAlongTrack / totalTrackLength;

    return {
      sampleIndex: idxA,
      closestPoint: closestPt,
      tangent: interpTangent,
      normal: interpNormal,
      binormal: interpBinormal,
      horizontalDistance,
      signedLateralOffset,
      roadY: smoothRoadY,
      normalizedSplineT,
      distanceAlongTrack,
      widthScale: interpWidthScale,
      localRoadHalfWidth,
      localCurbWidth,
      localWallHalfWidth,
    };
  };

  // True arc-length lookup: matches `normalizedSplineT = distanceAlongTrack / totalTrackLength`
  // so stretched or compressed spline segments in the Track Editor never desync AI look-ahead!
  const getPointAtNormalizedT = (t: number, lateralOffset = 0) => {
    const wrappedT = ((t % 1) + 1) % 1;
    const targetDist = wrappedT * totalTrackLength;
    const numSamples = samples.length;

    let low = 0;
    let high = numSamples - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (samples[mid].cumulativeDistance <= targetDist) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    const idxA = low;
    const idxB = (idxA + 1) % numSamples;
    const sA = samples[idxA];
    const sB = samples[idxB];

    const distA = sA.cumulativeDistance;
    const distB = idxB === 0 ? totalTrackLength : sB.cumulativeDistance;
    const segSpan = Math.max(1e-5, distB - distA);
    const frac = Math.max(0, Math.min(1, (targetDist - distA) / segSpan));

    const centerPos = Vector3.Lerp(sA.position, sB.position, frac);
    const tangent = Vector3.Lerp(sA.tangent, sB.tangent, frac).normalize();
    const normal = Vector3.Lerp(sA.normal, sB.normal, frac).normalize();
    const binormal = Vector3.Lerp(sA.binormal, sB.binormal, frac).normalize();

    return {
      position: centerPos.add(binormal.scale(lateralOffset)),
      tangent,
      normal,
      binormal,
      sampleIndex: idxA,
    };
  };

  return {
    controlPoints,
    splinePoints,
    path3d,
    samples,
    totalTrackLength,
    queryClosestTrackPoint,
    getPointAtNormalizedT,
  };
}

/**
 * One-click & live-spline-following procedural forest & suburban scenery generator that automatically fills
 * the exterior of any custom track spline without ever encroaching on the road or runoff!
 */
export function generateProceduralForestOutsideTrack(
  controlPoints: Array<{ x: number; y: number; z: number }>,
  roadHalfWidth = ROAD_HALF_WIDTH,
  seedOffset = 0,
  density = 1.0,
  biome: TrackBiome = "ALPINE_SUBURBS"
): PlacedSceneryProp[] {
  const { samples, queryClosestTrackPoint } = computeTrackSplineSamples(
    controlPoints,
    24
  );
  const wallHalf = roadHalfWidth + 12.5;
  const minClearance = wallHalf + 3.0;
  const props: PlacedSceneryProp[] = [];
  let idCounter = 1;

  // 1. Place two main straightaway Grandstands near start/finish
  const standSample = samples[Math.min(8, samples.length - 1)];
  for (const side of [-1, 1]) {
    const pos = standSample.position.add(
      standSample.binormal.scale(side * (wallHalf + 6.5))
    );
    const q = queryClosestTrackPoint(pos);
    if (q.horizontalDistance >= wallHalf + 2.0) {
      const yaw = Math.atan2(standSample.tangent.x, standSample.tangent.z);
      props.push({
        id: `prop_stand_${idCounter++}`,
        type: "GRANDSTAND",
        x: Number(pos.x.toFixed(1)),
        z: Number(pos.z.toFixed(1)),
        rotationY: Number(
          (yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2)).toFixed(2)
        ),
        scale: 1.0,
        isManual: false,
      });
    }
  }

  // 2. Trackside Lamp Posts lining the outer curb/runoff corridor
  const lampStep = Math.max(8, Math.round(18 / Math.max(0.4, density)));
  for (let i = 4; i < samples.length; i += lampStep) {
    const s = samples[i];
    for (const side of [-1, 1]) {
      const pos = s.position.add(s.binormal.scale(side * (wallHalf + 1.8)));
      const q = queryClosestTrackPoint(pos);
      if (q.horizontalDistance < wallHalf + 0.8) continue;
      props.push({
        id: `prop_lamp_${idCounter++}`,
        type: "LAMP_POST",
        x: Number(pos.x.toFixed(1)),
        z: Number(pos.z.toFixed(1)),
        rotationY: 0,
        scale: 1.0,
        isManual: false,
      });
    }
  }

  // 3. Inner & Mid Ring of Biome-Specific Trees, Structures & Boulders following the circuit exterior
  const sampleStep = Math.max(2, Math.round(5 / Math.max(0.35, density)));
  for (let i = 0; i < samples.length; i += sampleStep) {
    const s = samples[i];
    for (const side of [-1, 1]) {
      const hash = Math.abs(
        Math.sin((i * 19 + side * 7 + seedOffset * 13) * 12.9898) * 43758.5453
      );
      const frac = hash - Math.floor(hash);
      if (frac < 0.14) continue;

      const dist = wallHalf + 4.5 + frac * 34.0;
      const candidate = s.position.add(s.binormal.scale(side * dist));
      const q = queryClosestTrackPoint(candidate);
      if (q.horizontalDistance < minClearance) continue;

      let type: SceneryPrefabType = "PINE_TREE";
      if (biome === "TROPICAL_ATOLL") {
        if (frac > 0.85) {
          type = "BEACH_CABANA";
        } else if (frac > 0.72) {
          type = "BOULDER";
        } else if (frac > 0.25) {
          type = "PALM_TREE";
        } else {
          type = "OAK_TREE";
        }
      } else if (biome === "SUNSET_CANYON") {
        if (frac > 0.88) {
          type = "SUBURBAN_HOUSE";
        } else if (frac > 0.48) {
          type = "BOULDER";
        } else if (frac > 0.26) {
          type = "PALM_TREE";
        } else {
          type = "OAK_TREE";
        }
      } else {
        if (frac > 0.88) {
          type = "SUBURBAN_HOUSE";
        } else if (frac > 0.72) {
          type = "BOULDER";
        } else if (frac > 0.44) {
          type = "OAK_TREE";
        }
      }

      const isFacingStructure =
        type === "SUBURBAN_HOUSE" || type === "BEACH_CABANA";
      const scale = isFacingStructure
        ? 1.0
        : Number((0.85 + ((frac * 10) % 1) * 0.55).toFixed(2));
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);

      props.push({
        id: `prop_auto_${idCounter++}`,
        type,
        x: Number(candidate.x.toFixed(1)),
        z: Number(candidate.z.toFixed(1)),
        rotationY: Number(
          (isFacingStructure
            ? yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2)
            : frac * Math.PI * 2
          ).toFixed(2)
        ),
        scale,
        isManual: false,
      });
    }
  }

  // 4. Outer Biome Scatter (fills the broader surrounding terrain/coastline outside the track)
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const s of samples) {
    if (s.position.x < minX) minX = s.position.x;
    if (s.position.x > maxX) maxX = s.position.x;
    if (s.position.z < minZ) minZ = s.position.z;
    if (s.position.z > maxZ) maxZ = s.position.z;
  }

  const outerCount = Math.round(75 * density);
  for (let k = 0; k < outerCount; k++) {
    const h1 = Math.abs(Math.sin((k + 1 + seedOffset * 17) * 78.233) * 43758.5453);
    const h2 = Math.abs(Math.cos((k + 1 + seedOffset * 17) * 45.164) * 23421.631);
    const rx = h1 - Math.floor(h1);
    const rz = h2 - Math.floor(h2);

    const wx = minX - 80 + rx * (maxX - minX + 160);
    const wz = minZ - 80 + rz * (maxZ - minZ + 160);
    const q = queryClosestTrackPoint(new Vector3(wx, 0, wz));
    const maxScatterDist = biome === "TROPICAL_ATOLL" ? 64 : 110;
    if (
      q.horizontalDistance < minClearance + 5.0 ||
      q.horizontalDistance > maxScatterDist
    ) {
      continue;
    }

    let type: SceneryPrefabType;
    if (biome === "TROPICAL_ATOLL") {
      type = k % 4 === 0 ? "BOULDER" : "PALM_TREE";
    } else if (biome === "SUNSET_CANYON") {
      type = k % 3 === 0 ? "PALM_TREE" : "BOULDER";
    } else {
      type = k % 5 === 0 ? "BOULDER" : k % 2 === 0 ? "PINE_TREE" : "OAK_TREE";
    }
    props.push({
      id: `prop_woods_${idCounter++}`,
      type,
      x: Number(wx.toFixed(1)),
      z: Number(wz.toFixed(1)),
      rotationY: Number((rx * 6.28).toFixed(2)),
      scale: Number((0.9 + rz * 0.65).toFixed(2)),
      isManual: false,
    });
  }

  return props;
}

/**
 * Automatically updates trackside scenery when spline nodes move AND clears any trees/objects
 * that overlap the newly reshaped road corridor!
 */
export function syncTracksideSceneryAndClearRoad(
  def: CustomTrackDefinition
): CustomTrackDefinition {
  const roadHalfWidth = def.roadHalfWidth || ROAD_HALF_WIDTH;
  const minSafePropDist = roadHalfWidth + 13.5;
  const { queryClosestTrackPoint } = computeTrackSplineSamples(
    def.controlPoints,
    24,
    def.terrainMods ?? []
  );

  // Keep only manual scenery props that do NOT overlap the new road + runoff corridor
  const survivingManualProps = (def.sceneryProps ?? []).filter((prop) => {
    if (!prop.isManual) {
      return def.autoTracksideScenery === false;
    }
    const q = queryClosestTrackPoint(new Vector3(prop.x, 0, prop.z));
    return q.horizontalDistance >= minSafePropDist;
  });

  // Also clear any non-manual props that overlap the road if autoTracksideScenery is off
  const safeSurvivingProps = survivingManualProps.filter((prop) => {
    const q = queryClosestTrackPoint(new Vector3(prop.x, 0, prop.z));
    return q.horizontalDistance >= minSafePropDist;
  });

  // Keep obstacles that are still within the playable road/runoff zone
  const survivingObstacles = (def.obstacles ?? []).filter((obs) => {
    const q = queryClosestTrackPoint(new Vector3(obs.x, 0, obs.z));
    return q.horizontalDistance <= roadHalfWidth + 8.0;
  });

  const autoProps =
    def.autoTracksideScenery !== false
      ? generateProceduralForestOutsideTrack(
          def.controlPoints,
          roadHalfWidth,
          def.scenerySeed ?? 0,
          def.sceneryDensity ?? 1.0,
          def.biome ?? "ALPINE_SUBURBS"
        )
      : [];

  return {
    ...def,
    obstacles: survivingObstacles,
    sceneryProps: [...autoProps, ...safeSurvivingProps],
  };
}

export function evaluateTerrainHeightAt(
  wx: number,
  wz: number,
  queryClosestTrackPoint: (worldPos: Vector3) => ClosestTrackQuery,
  curbOuterWidth: number,
  wallHalfWidth: number,
  terrainHillScale = 1.0,
  terrainMods: TerrainSculptMod[] = [],
  biome: TrackBiome = "ALPINE_SUBURBS"
): { y: number; dist: number; roadY: number } {
  const query = queryClosestTrackPoint(new Vector3(wx, 0, wz));
  const dist = query.horizontalDistance;
  const roadY = query.roadY;
  const effectiveCurbWidth = query.localCurbWidth || curbOuterWidth;
  const effectiveWallHalf =
    query.localWallHalfWidth || effectiveCurbWidth + 11.0 || wallHalfWidth;
  const hasShortcutExpansion = effectiveWallHalf > effectiveCurbWidth + 13.5;

  // Deeply recess the coarse ground grid under the asphalt road & curbs (by 4.4u out to effectiveCurbWidth + 1.2)
  // so its ~6.5u square triangles can NEVER poke through the smooth road ribbon on steep hills or curves!
  if (dist <= effectiveCurbWidth + 1.2) {
    return { y: roadY - 4.4, dist, roadY };
  }
  if (dist <= effectiveCurbWidth + 4.8) {
    const shoulderT = Math.max(
      0,
      Math.min(1, (dist - (effectiveCurbWidth + 1.2)) / 3.6)
    );
    const smoothShoulder = shoulderT * shoulderT * (3 - 2 * shoulderT);
    return {
      y: roadY - 4.4 + smoothShoulder * 4.15,
      dist,
      roadY,
    };
  }

  // Keep the off-road shortcut corridor level with roadY - 0.22 out to effectiveWallHalf - 5.0
  // so BOOST_SHORTCUT, PAVED_SHORTCUT, and SHALLOW_WATER lanes never get buried by hillside terrain waves!
  if (hasShortcutExpansion && dist <= effectiveWallHalf - 5.0) {
    return { y: roadY - 0.22, dist, roadY };
  }

  const flatOuterEdge = hasShortcutExpansion
    ? effectiveWallHalf - 5.0
    : effectiveCurbWidth + 4.8;
  const offDist = Math.max(0, dist - flatOuterEdge);
  const blendLinear = Math.min(1, offDist / 16);
  const blend = blendLinear * blendLinear * (3 - 2 * blendLinear);
  const hillWave =
    (Math.sin(wx * 0.045) * Math.cos(wz * 0.045) * 2.6 +
      Math.sin((wx + wz) * 0.025) * 2.0) *
    terrainHillScale;

  let outerBowl = 0;
  let hillMult = 0.4;
  if (biome === "TROPICAL_ATOLL") {
    // Gentle sandy island coastline sloping downward into the turquoise lagoon/ocean water table
    hillMult = 0.22;
    outerBowl =
      dist > effectiveWallHalf
        ? -Math.min(4.6, (dist - effectiveWallHalf) * 0.095)
        : 0;
  } else if (biome === "SUNSET_CANYON") {
    hillMult = 0.48;
    outerBowl =
      dist > effectiveWallHalf
        ? Math.min(22, (dist - effectiveWallHalf) * 0.26 * terrainHillScale)
        : 0;
  } else {
    outerBowl =
      dist > effectiveWallHalf
        ? Math.min(18, (dist - effectiveWallHalf) * 0.22 * terrainHillScale)
        : 0;
  }

  // Since roadY already incorporates terrainMods along the road centerline, apply only the
  // differential customDeltaY outside the shoulder so road hills and terrain hills match seamlessly!
  const modAtPoint = evaluateTerrainModsAt(wx, wz, terrainMods);
  const modAtRoad = evaluateTerrainModsAt(
    query.closestPoint.x,
    query.closestPoint.z,
    terrainMods
  );
  const relativeDeltaY = modAtPoint - modAtRoad;

  const y =
    roadY -
    0.25 +
    blend * (hillWave * hillMult + outerBowl + relativeDeltaY);
  return { y, dist, roadY };
}

/**
 * Automatically synthesizes signature inside-corner BOOST_SHORTCUT, PAVED_SHORTCUT, and parallel SPLIT_MEDIAN
 * zones on tracks that do not already define shortcut masks, based on spline curvature analysis.
 */
export function synthesizeDefaultShortcutMasks(
  controlPoints: Array<{ x: number; y: number; z: number; widthScale?: number }>,
  roadHalfWidth = ROAD_HALF_WIDTH,
  trackId = "track",
  existingMasks?: PlacedTrackMask[]
): PlacedTrackMask[] {
  const baseMasks = Array.isArray(existingMasks)
    ? existingMasks.map((m) => ({ ...m }))
    : [];
  const hasShortcutAlready = baseMasks.some(
    (m) => m.type === "BOOST_SHORTCUT" || m.type === "PAVED_SHORTCUT"
  );
  if (hasShortcutAlready || controlPoints.length < 4) {
    return baseMasks;
  }

  const spline = computeTrackSplineSamples(
    controlPoints,
    16,
    [],
    roadHalfWidth,
    baseMasks
  );
  const samples = spline.samples;
  const n = samples.length;
  if (n < 24) return baseMasks;

  const totalLen = Math.max(100, spline.totalTrackLength);
  const span = Math.max(4, Math.round(n * 0.035));

  const candidates: Array<{
    normT: number;
    absCurv: number;
    turnSign: -1 | 1;
  }> = [];

  for (let i = 0; i < n; i++) {
    const normT = samples[i].cumulativeDistance / totalLen;
    if (normT < 0.11 || normT > 0.89) continue;
    // Skip if too close to any existing mask
    const nearExisting = baseMasks.some((m) => {
      const d = Math.abs(normT - m.normT);
      return Math.min(d, 1 - d) < 0.12;
    });
    if (nearExisting) continue;

    const prevT = samples[(i - span + n) % n].tangent;
    const nextT = samples[(i + span) % n].tangent;
    const crossY = prevT.x * nextT.z - prevT.z * nextT.x;
    const absCurv = Math.abs(crossY);
    const turnSign: -1 | 1 = crossY >= 0 ? 1 : -1;
    candidates.push({ normT, absCurv, turnSign });
  }

  if (candidates.length === 0) return baseMasks;

  // 1. Sharpest corner apex -> Inside Off-Road BOOST_SHORTCUT (requires Nitro/Overclock/Overdrive/Mini-Turbo)
  const sortedByCurv = [...candidates].sort((a, b) => b.absCurv - a.absCurv);
  const primaryCorner = sortedByCurv[0];
  if (primaryCorner && primaryCorner.absCurv > 0.16) {
    baseMasks.push({
      id: `${trackId}_boost_cut_1`,
      type: "BOOST_SHORTCUT",
      normT: Number(primaryCorner.normT.toFixed(3)),
      lateral: Number(
        (primaryCorner.turnSign * (roadHalfWidth + 5.2)).toFixed(1)
      ),
      width: 10.5,
      length: 56.0,
    });
  }

  // 2. Second sharpest distinct corner -> Technical Narrow PAVED_SHORTCUT (100% pavement speed if threaded cleanly)
  const secondaryCorner = sortedByCurv.find((c) => {
    if (!primaryCorner) return true;
    const d = Math.abs(c.normT - primaryCorner.normT);
    return Math.min(d, 1 - d) >= 0.22 && c.absCurv > 0.14;
  });
  if (secondaryCorner) {
    baseMasks.push({
      id: `${trackId}_paved_cut_1`,
      type: "PAVED_SHORTCUT",
      normT: Number(secondaryCorner.normT.toFixed(3)),
      lateral: Number(
        (secondaryCorner.turnSign * (roadHalfWidth + 4.0)).toFixed(1)
      ),
      width: 6.8,
      length: 52.0,
    });
  }

  // 3. If no SPLIT_MEDIAN exists yet, add a parallel dual-lane split on a gentle straightaway/sweeper
  const hasSplitMedian = baseMasks.some((m) => m.type === "SPLIT_MEDIAN");
  if (!hasSplitMedian) {
    const straightCandidates = [...candidates]
      .filter((c) => {
        return baseMasks.every((m) => {
          const d = Math.abs(c.normT - m.normT);
          return Math.min(d, 1 - d) >= 0.18;
        });
      })
      .sort((a, b) => a.absCurv - b.absCurv);
    const bestStraight = straightCandidates[0];
    if (bestStraight) {
      baseMasks.push({
        id: `${trackId}_split_1`,
        type: "SPLIT_MEDIAN",
        normT: Number(bestStraight.normT.toFixed(3)),
        lateral: 0,
        width: 6.2,
        length: 60.0,
      });
    }
  }

  return baseMasks;
}

export function createDefaultTrackDefinition(): CustomTrackDefinition {
  const controlPoints = DEFAULT_CONTROL_POINTS.map((p) => ({ ...p }));
  const roadHalfWidth = ROAD_HALF_WIDTH;

  const boostPads: PlacedBoostPad[] = [
    { id: "boost_1", normT: 0.032, lateral: -4.5 },
    { id: "boost_2", normT: 0.068, lateral: 4.5 },
    { id: "boost_3", normT: 0.18, lateral: -3.8 },
    { id: "boost_4", normT: 0.28, lateral: 3.8 },
    { id: "boost_5", normT: 0.41, lateral: 0.0 },
    { id: "boost_6", normT: 0.52, lateral: -4.2 },
    { id: "boost_7", normT: 0.66, lateral: 4.2 },
    { id: "boost_8", normT: 0.77, lateral: -3.5 },
    { id: "boost_9", normT: 0.89, lateral: 4.0 },
    { id: "boost_10", normT: 0.95, lateral: 0.0 },
  ];

  const itemBoxRows = [
    { id: "item_row_1", normT: 0.12 },
    { id: "item_row_2", normT: 0.36 },
    { id: "item_row_3", normT: 0.62 },
    { id: "item_row_4", normT: 0.84 },
  ];

  const trackMasks = synthesizeDefaultShortcutMasks(
    controlPoints,
    roadHalfWidth,
    "gutsy_avenue"
  );

  return {
    id: "gutsy_avenue",
    cupId: "cul_de_sac_cup",
    name: "Gutsy Avenue Grand Circuit",
    description: "Classic neighborhood sweeper with high overlook summit and suburban cul-de-sac bends.",
    roadHalfWidth,
    controlPoints,
    boostPads,
    itemBoxRows,
    obstacles: [],
    trackMasks,
    sceneryProps: generateProceduralForestOutsideTrack(
      controlPoints,
      roadHalfWidth,
      0,
      1.0
    ),
    autoTracksideScenery: true,
    sceneryDensity: 1.0,
    scenerySeed: 0,
    terrainHillScale: 1.0,
    terrainMods: [],
  };
}

const CUPS_CATALOG_STORAGE_KEY = "gutsy_karts_cups_catalog_v1";

function buildTrackPreset(params: {
  id: string;
  cupId: string;
  name: string;
  description: string;
  roadHalfWidth: number;
  controlPoints: Array<{ x: number; y: number; z: number }>;
  boostPads: PlacedBoostPad[];
  itemBoxRows: Array<{ id: string; normT: number }>;
  scenerySeed: number;
  sceneryDensity?: number;
  terrainHillScale?: number;
  terrainMods?: TerrainSculptMod[];
  obstacleSpecs?: Array<{
    type: ObstaclePrefabType;
    normT: number;
    lateral: number;
    scale?: number;
  }>;
}): CustomTrackDefinition {
  const spline = computeTrackSplineSamples(params.controlPoints, 24);
  const obstacles: PlacedObstacle[] = (params.obstacleSpecs ?? []).map(
    (spec, idx) => {
      const sample = spline.getPointAtNormalizedT(spec.normT, spec.lateral);
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      return {
        id: `${params.id}_obs_${idx + 1}`,
        type: spec.type,
        x: Number(sample.position.x.toFixed(1)),
        z: Number(sample.position.z.toFixed(1)),
        rotationY: Number(yaw.toFixed(2)),
        scale: spec.scale ?? 1.0,
      };
    }
  );

  const trackMasks = synthesizeDefaultShortcutMasks(
    params.controlPoints,
    params.roadHalfWidth,
    params.id
  );

  return {
    id: params.id,
    cupId: params.cupId,
    name: params.name,
    description: params.description,
    roadHalfWidth: params.roadHalfWidth,
    controlPoints: params.controlPoints.map((p) => ({ ...p })),
    boostPads: params.boostPads,
    itemBoxRows: params.itemBoxRows,
    obstacles,
    trackMasks,
    sceneryProps: generateProceduralForestOutsideTrack(
      params.controlPoints,
      params.roadHalfWidth,
      params.scenerySeed,
      params.sceneryDensity ?? 1.0
    ),
    autoTracksideScenery: true,
    sceneryDensity: params.sceneryDensity ?? 1.0,
    scenerySeed: params.scenerySeed,
    terrainHillScale: params.terrainHillScale ?? 1.0,
    terrainMods: params.terrainMods ?? [],
  };
}

export const OFFICIAL_BUILTIN_CUP_IDS = [
  "cul_de_sac_cup",
  "neon_creek_cup",
  "overdrive_crown_cup",
] as const;

export function isBuiltinCupId(cupId: string): boolean {
  return (OFFICIAL_BUILTIN_CUP_IDS as readonly string[]).includes(cupId);
}

export function hydrateTrackDefinition(
  rawTrack: CustomTrackDefinition
): CustomTrackDefinition {
  const controlPoints = (rawTrack.controlPoints ?? []).map((p) => {
    const pt: { x: number; y: number; z: number; widthScale?: number } = {
      x: Number(p.x),
      y: Number(p.y),
      z: Number(p.z),
    };
    if (
      typeof p.widthScale === "number" &&
      Number.isFinite(p.widthScale) &&
      Math.abs(p.widthScale - 1.0) > 1e-3
    ) {
      pt.widthScale = Math.max(0.5, Math.min(2.2, Number(p.widthScale)));
    }
    return pt;
  });
  const roadHalfWidth = rawTrack.roadHalfWidth || ROAD_HALF_WIDTH;
  const biome: TrackBiome =
    rawTrack.biome === "TROPICAL_ATOLL" ||
    rawTrack.biome === "SUNSET_CANYON" ||
    rawTrack.biome === "ALPINE_SUBURBS"
      ? rawTrack.biome
      : "ALPINE_SUBURBS";
  const autoTracksideScenery = rawTrack.autoTracksideScenery !== false;
  const scenerySeed = rawTrack.scenerySeed ?? 0;
  const sceneryDensity = rawTrack.sceneryDensity ?? 1.0;

  let sceneryProps = Array.isArray(rawTrack.sceneryProps)
    ? rawTrack.sceneryProps.map((p) => ({ ...p }))
    : [];

  const hasAutoProps = sceneryProps.some((p) => !p.isManual);
  if (autoTracksideScenery && !hasAutoProps && controlPoints.length >= 4) {
    const generated = generateProceduralForestOutsideTrack(
      controlPoints,
      roadHalfWidth,
      scenerySeed,
      sceneryDensity,
      biome
    );
    const manualProps = sceneryProps.filter((p) => p.isManual);
    sceneryProps = [...generated, ...manualProps];
  }

  const rawMasks = Array.isArray(rawTrack.trackMasks)
    ? rawTrack.trackMasks.map((m) => ({ ...m }))
    : undefined;
  const trackMasks = !rawTrack.isUserModified
    ? synthesizeDefaultShortcutMasks(
        controlPoints,
        roadHalfWidth,
        rawTrack.id || "track",
        rawMasks
      )
    : rawMasks;

  return {
    ...rawTrack,
    biome,
    roadHalfWidth,
    controlPoints,
    boostPads: (rawTrack.boostPads ?? []).map((b) => ({ ...b })),
    itemBoxRows: (rawTrack.itemBoxRows ?? []).map((r) => ({ ...r })),
    obstacles: (rawTrack.obstacles ?? []).map((o) => ({ ...o })),
    trackMasks,
    sceneryProps,
    autoTracksideScenery,
    sceneryDensity,
    scenerySeed,
    terrainHillScale: rawTrack.terrainHillScale ?? 1.0,
    terrainMods: (rawTrack.terrainMods ?? []).map((m) => ({ ...m })),
  };
}

export function createCodePresetCupsCatalog(): GrandPrixCupDefinition[] {
  // CUP 1: CUL-DE-SAC CUP (Suburban Neighborhood Series)
  const track1A = createDefaultTrackDefinition();

  const track1B = buildTrackPreset({
    id: "maple_leaf_parkway",
    cupId: "cul_de_sac_cup",
    name: "Maple Leaf Parkway",
    description: "Wide, fast tree-lined boulevard with gentle rolling hills and double turbo lanes.",
    roadHalfWidth: 15.0,
    scenerySeed: 2,
    sceneryDensity: 1.05,
    terrainHillScale: 0.85,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 0.8, z: 95 },
      { x: 48, y: 3.5, z: 185 },
      { x: 140, y: 5.5, z: 215 },
      { x: 235, y: 4.0, z: 175 },
      { x: 280, y: 1.8, z: 80 },
      { x: 275, y: 1.2, z: -35 },
      { x: 230, y: 3.6, z: -135 },
      { x: 145, y: 5.0, z: -195 },
      { x: 52, y: 2.4, z: -185 },
      { x: -12, y: 0.6, z: -115 },
      { x: -4, y: 0.0, z: -55 },
    ],
    boostPads: [
      { id: "mlp_b1", normT: 0.04, lateral: -5.0 },
      { id: "mlp_b2", normT: 0.04, lateral: 5.0 },
      { id: "mlp_b3", normT: 0.21, lateral: -4.2 },
      { id: "mlp_b4", normT: 0.36, lateral: 4.2 },
      { id: "mlp_b5", normT: 0.51, lateral: -4.5 },
      { id: "mlp_b6", normT: 0.51, lateral: 4.5 },
      { id: "mlp_b7", normT: 0.69, lateral: -3.8 },
      { id: "mlp_b8", normT: 0.84, lateral: 3.8 },
      { id: "mlp_b9", normT: 0.94, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "mlp_i1", normT: 0.14 },
      { id: "mlp_i2", normT: 0.42 },
      { id: "mlp_i3", normT: 0.64 },
      { id: "mlp_i4", normT: 0.88 },
    ],
  });

  const track1C = buildTrackPreset({
    id: "pinewood_switchback",
    cupId: "cul_de_sac_cup",
    name: "Pinewood Switchback Park",
    description: "Woodland parkway featuring stunt jump ramps, elevated timber crests, and forest chicanes.",
    roadHalfWidth: 13.5,
    scenerySeed: 5,
    sceneryDensity: 1.2,
    terrainHillScale: 1.25,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 1.2, z: 86 },
      { x: 38, y: 6.0, z: 168 },
      { x: 118, y: 11.0, z: 204 },
      { x: 196, y: 8.5, z: 158 },
      { x: 168, y: 4.5, z: 76 },
      { x: 224, y: 6.8, z: 8 },
      { x: 268, y: 9.2, z: -78 },
      { x: 222, y: 5.5, z: -168 },
      { x: 132, y: 2.2, z: -206 },
      { x: 42, y: 1.0, z: -182 },
      { x: -16, y: 0.2, z: -118 },
      { x: -5, y: 0.0, z: -56 },
    ],
    boostPads: [
      { id: "pwp_b1", normT: 0.05, lateral: 3.8 },
      { id: "pwp_b2", normT: 0.19, lateral: -3.6 },
      { id: "pwp_b3", normT: 0.33, lateral: 0.0 },
      { id: "pwp_b4", normT: 0.48, lateral: -4.0 },
      { id: "pwp_b5", normT: 0.63, lateral: 4.0 },
      { id: "pwp_b6", normT: 0.78, lateral: -3.5 },
      { id: "pwp_b7", normT: 0.92, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "pwp_i1", normT: 0.12 },
      { id: "pwp_i2", normT: 0.39 },
      { id: "pwp_i3", normT: 0.68 },
      { id: "pwp_i4", normT: 0.86 },
    ],
    obstacleSpecs: [
      { type: "JUMP_RAMP", normT: 0.26, lateral: 0, scale: 1.1 },
      { type: "JUMP_RAMP", normT: 0.72, lateral: 0, scale: 1.1 },
    ],
  });

  // CUP 2: NEON CREEK CUP (Valley & Mall Technical Series)
  const track2A = buildTrackPreset({
    id: "creekbed_canyon",
    cupId: "neon_creek_cup",
    name: "Creekbed Canyon Run",
    description: "Deep sculpted canyon run with steep downhill S-curves and high-banked valley walls.",
    roadHalfWidth: 13.0,
    scenerySeed: 9,
    sceneryDensity: 1.0,
    terrainHillScale: 1.45,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 1.5, z: 88 },
      { x: 46, y: 7.5, z: 172 },
      { x: 134, y: 13.5, z: 218 },
      { x: 228, y: 11.0, z: 186 },
      { x: 274, y: 5.2, z: 98 },
      { x: 214, y: 2.0, z: 22 },
      { x: 256, y: 4.8, z: -64 },
      { x: 238, y: 8.5, z: -158 },
      { x: 156, y: 4.2, z: -224 },
      { x: 64, y: 1.4, z: -208 },
      { x: -14, y: 0.4, z: -136 },
      { x: -5, y: 0.0, z: -62 },
    ],
    boostPads: [
      { id: "ccr_b1", normT: 0.04, lateral: -4.0 },
      { id: "ccr_b2", normT: 0.16, lateral: 3.8 },
      { id: "ccr_b3", normT: 0.29, lateral: -3.5 },
      { id: "ccr_b4", normT: 0.44, lateral: 4.0 },
      { id: "ccr_b5", normT: 0.58, lateral: -3.8 },
      { id: "ccr_b6", normT: 0.74, lateral: 3.5 },
      { id: "ccr_b7", normT: 0.88, lateral: -3.5 },
      { id: "ccr_b8", normT: 0.95, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "ccr_i1", normT: 0.11 },
      { id: "ccr_i2", normT: 0.36 },
      { id: "ccr_i3", normT: 0.63 },
      { id: "ccr_i4", normT: 0.83 },
    ],
    obstacleSpecs: [
      { type: "JUMP_RAMP", normT: 0.32, lateral: 0, scale: 1.1 },
      { type: "PYLON_CONE", normT: 0.52, lateral: -4.2, scale: 1.0 },
      { type: "PYLON_CONE", normT: 0.54, lateral: 4.2, scale: 1.0 },
    ],
    terrainMods: [
      { id: "canyon_m1", x: 120, z: 95, radius: 75, deltaY: 14 },
      { id: "canyon_m2", x: 140, z: -90, radius: 80, deltaY: 15 },
    ],
  });

  const track2B = buildTrackPreset({
    id: "mall_perimeter",
    cupId: "neon_creek_cup",
    name: "Arcade Plaza Perimeter",
    description: "Crisp 90-degree plaza corners, construction pylon slaloms, and long turbo straightaways.",
    roadHalfWidth: 13.5,
    scenerySeed: 14,
    sceneryDensity: 0.95,
    terrainHillScale: 0.75,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 0.4, z: 96 },
      { x: 24, y: 2.2, z: 184 },
      { x: 112, y: 3.6, z: 204 },
      { x: 216, y: 3.6, z: 200 },
      { x: 268, y: 2.0, z: 132 },
      { x: 264, y: 1.0, z: 28 },
      { x: 184, y: 2.5, z: -18 },
      { x: 182, y: 4.0, z: -108 },
      { x: 242, y: 3.0, z: -178 },
      { x: 172, y: 1.4, z: -244 },
      { x: 68, y: 0.8, z: -236 },
      { x: -12, y: 0.2, z: -158 },
      { x: -6, y: 0.0, z: -72 },
    ],
    boostPads: [
      { id: "app_b1", normT: 0.035, lateral: -4.2 },
      { id: "app_b2", normT: 0.07, lateral: 4.2 },
      { id: "app_b3", normT: 0.22, lateral: 0.0 },
      { id: "app_b4", normT: 0.38, lateral: -4.0 },
      { id: "app_b5", normT: 0.53, lateral: 4.0 },
      { id: "app_b6", normT: 0.68, lateral: -3.6 },
      { id: "app_b7", normT: 0.82, lateral: 3.6 },
      { id: "app_b8", normT: 0.94, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "app_i1", normT: 0.13 },
      { id: "app_i2", normT: 0.34 },
      { id: "app_i3", normT: 0.6 },
      { id: "app_i4", normT: 0.86 },
    ],
    obstacleSpecs: [
      { type: "PYLON_CONE", normT: 0.25, lateral: -3.5, scale: 1.1 },
      { type: "PYLON_CONE", normT: 0.27, lateral: 3.5, scale: 1.1 },
      { type: "OIL_SLICK", normT: 0.56, lateral: 2.5, scale: 1.1 },
      { type: "JUMP_RAMP", normT: 0.76, lateral: 0.0, scale: 1.0 },
    ],
  });

  const track2C = buildTrackPreset({
    id: "twin_peaks_ridge",
    cupId: "neon_creek_cup",
    name: "Twin Peaks Ridgeway",
    description: "Double-summit mountain ridgeway with soaring stunt ramps and sweeping cliffside hairpins.",
    roadHalfWidth: 13.0,
    scenerySeed: 21,
    sceneryDensity: 1.15,
    terrainHillScale: 1.6,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 2.0, z: 88 },
      { x: 42, y: 9.5, z: 176 },
      { x: 132, y: 15.5, z: 216 },
      { x: 224, y: 9.0, z: 168 },
      { x: 262, y: 3.2, z: 72 },
      { x: 258, y: 9.5, z: -32 },
      { x: 226, y: 14.8, z: -136 },
      { x: 142, y: 8.5, z: -212 },
      { x: 48, y: 3.0, z: -196 },
      { x: -16, y: 0.6, z: -128 },
      { x: -5, y: 0.0, z: -60 },
    ],
    boostPads: [
      { id: "tpr_b1", normT: 0.04, lateral: 0.0 },
      { id: "tpr_b2", normT: 0.18, lateral: -3.8 },
      { id: "tpr_b3", normT: 0.31, lateral: 3.8 },
      { id: "tpr_b4", normT: 0.46, lateral: 0.0 },
      { id: "tpr_b5", normT: 0.61, lateral: -3.8 },
      { id: "tpr_b6", normT: 0.75, lateral: 3.8 },
      { id: "tpr_b7", normT: 0.91, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "tpr_i1", normT: 0.12 },
      { id: "tpr_i2", normT: 0.38 },
      { id: "tpr_i3", normT: 0.66 },
      { id: "tpr_i4", normT: 0.85 },
    ],
    obstacleSpecs: [
      { type: "JUMP_RAMP", normT: 0.24, lateral: 0.0, scale: 1.15 },
      { type: "JUMP_RAMP", normT: 0.69, lateral: 0.0, scale: 1.15 },
    ],
    terrainMods: [
      { id: "tpr_m1", x: 135, z: 110, radius: 85, deltaY: 18 },
      { id: "tpr_m2", x: 135, z: -95, radius: 85, deltaY: 18 },
    ],
  });

  // CUP 3: OVERDRIVE CROWN CUP (Pro Championship Series)
  const track3A = buildTrackPreset({
    id: "industrial_hairpins",
    cupId: "overdrive_crown_cup",
    name: "Foundry Switchback Yard",
    description: "High-intensity switchbacks with oil slick puddles, hazard crates, and tight drift apexes.",
    roadHalfWidth: 12.5,
    scenerySeed: 31,
    sceneryDensity: 0.9,
    terrainHillScale: 1.1,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 0.8, z: 86 },
      { x: 44, y: 4.5, z: 168 },
      { x: 136, y: 7.2, z: 196 },
      { x: 218, y: 5.0, z: 142 },
      { x: 164, y: 2.5, z: 58 },
      { x: 242, y: 4.0, z: -8 },
      { x: 278, y: 6.5, z: -96 },
      { x: 204, y: 4.2, z: -176 },
      { x: 124, y: 2.0, z: -132 },
      { x: 62, y: 1.2, z: -204 },
      { x: -16, y: 0.4, z: -144 },
      { x: -6, y: 0.0, z: -66 },
    ],
    boostPads: [
      { id: "fsy_b1", normT: 0.035, lateral: -3.8 },
      { id: "fsy_b2", normT: 0.16, lateral: 3.8 },
      { id: "fsy_b3", normT: 0.29, lateral: -3.6 },
      { id: "fsy_b4", normT: 0.43, lateral: 3.6 },
      { id: "fsy_b5", normT: 0.57, lateral: -3.6 },
      { id: "fsy_b6", normT: 0.72, lateral: 3.6 },
      { id: "fsy_b7", normT: 0.86, lateral: -3.5 },
      { id: "fsy_b8", normT: 0.94, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "fsy_i1", normT: 0.11 },
      { id: "fsy_i2", normT: 0.35 },
      { id: "fsy_i3", normT: 0.62 },
      { id: "fsy_i4", normT: 0.82 },
    ],
    obstacleSpecs: [
      { type: "OIL_SLICK", normT: 0.21, lateral: 2.8, scale: 1.1 },
      { type: "BARRIER_CRATE", normT: 0.48, lateral: -3.2, scale: 1.0 },
      { type: "OIL_SLICK", normT: 0.66, lateral: -2.8, scale: 1.1 },
      { type: "JUMP_RAMP", normT: 0.89, lateral: 0.0, scale: 1.05 },
    ],
  });

  const track3B = buildTrackPreset({
    id: "skyline_summit",
    cupId: "overdrive_crown_cup",
    name: "Skyline Overlook Speedway",
    description: "High-altitude speedway with an 18-meter summit crest, stunt launches, and fast sweepers.",
    roadHalfWidth: 13.5,
    scenerySeed: 42,
    sceneryDensity: 1.1,
    terrainHillScale: 1.5,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 2.2, z: 96 },
      { x: 48, y: 10.0, z: 192 },
      { x: 148, y: 17.5, z: 244 },
      { x: 256, y: 16.0, z: 204 },
      { x: 308, y: 10.0, z: 102 },
      { x: 296, y: 4.5, z: -18 },
      { x: 244, y: 2.0, z: -124 },
      { x: 164, y: 5.5, z: -214 },
      { x: 64, y: 2.5, z: -218 },
      { x: -16, y: 0.5, z: -142 },
      { x: -5, y: 0.0, z: -64 },
    ],
    boostPads: [
      { id: "sos_b1", normT: 0.03, lateral: -4.2 },
      { id: "sos_b2", normT: 0.065, lateral: 4.2 },
      { id: "sos_b3", normT: 0.19, lateral: -4.0 },
      { id: "sos_b4", normT: 0.32, lateral: 0.0 },
      { id: "sos_b5", normT: 0.45, lateral: 4.0 },
      { id: "sos_b6", normT: 0.59, lateral: -4.0 },
      { id: "sos_b7", normT: 0.73, lateral: 4.0 },
      { id: "sos_b8", normT: 0.86, lateral: -3.5 },
      { id: "sos_b9", normT: 0.94, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "sos_i1", normT: 0.12 },
      { id: "sos_i2", normT: 0.38 },
      { id: "sos_i3", normT: 0.64 },
      { id: "sos_i4", normT: 0.84 },
    ],
    obstacleSpecs: [
      { type: "JUMP_RAMP", normT: 0.34, lateral: 0.0, scale: 1.2 },
      { type: "PYLON_CONE", normT: 0.54, lateral: -4.0, scale: 1.1 },
      { type: "PYLON_CONE", normT: 0.56, lateral: 4.0, scale: 1.1 },
      { type: "JUMP_RAMP", normT: 0.78, lateral: 0.0, scale: 1.15 },
    ],
  });

  const track3C = buildTrackPreset({
    id: "championship_gauntlet",
    cupId: "overdrive_crown_cup",
    name: "Gutsy Crown Finale Gauntlet",
    description: "The ultimate Grand Prix finale! Massive multi-sector circuit with elevation drops, hazards, and turbo chicanes.",
    roadHalfWidth: 13.0,
    scenerySeed: 55,
    sceneryDensity: 1.15,
    terrainHillScale: 1.4,
    controlPoints: [
      { x: 0, y: 0.0, z: 0 },
      { x: 0, y: 1.6, z: 92 },
      { x: 42, y: 8.0, z: 184 },
      { x: 132, y: 14.5, z: 232 },
      { x: 236, y: 12.0, z: 204 },
      { x: 292, y: 6.5, z: 118 },
      { x: 234, y: 3.0, z: 36 },
      { x: 288, y: 5.5, z: -48 },
      { x: 272, y: 9.5, z: -154 },
      { x: 188, y: 6.0, z: -238 },
      { x: 96, y: 2.8, z: -252 },
      { x: 18, y: 1.0, z: -204 },
      { x: -24, y: 0.4, z: -132 },
      { x: -6, y: 0.0, z: -62 },
    ],
    boostPads: [
      { id: "gcf_b1", normT: 0.03, lateral: -4.0 },
      { id: "gcf_b2", normT: 0.06, lateral: 4.0 },
      { id: "gcf_b3", normT: 0.17, lateral: -3.8 },
      { id: "gcf_b4", normT: 0.28, lateral: 3.8 },
      { id: "gcf_b5", normT: 0.39, lateral: 0.0 },
      { id: "gcf_b6", normT: 0.51, lateral: -4.0 },
      { id: "gcf_b7", normT: 0.64, lateral: 4.0 },
      { id: "gcf_b8", normT: 0.77, lateral: -3.6 },
      { id: "gcf_b9", normT: 0.88, lateral: 3.6 },
      { id: "gcf_b10", normT: 0.95, lateral: 0.0 },
    ],
    itemBoxRows: [
      { id: "gcf_i1", normT: 0.11 },
      { id: "gcf_i2", normT: 0.33 },
      { id: "gcf_i3", normT: 0.58 },
      { id: "gcf_i4", normT: 0.82 },
    ],
    obstacleSpecs: [
      { type: "JUMP_RAMP", normT: 0.23, lateral: 0.0, scale: 1.15 },
      { type: "OIL_SLICK", normT: 0.45, lateral: -2.8, scale: 1.1 },
      { type: "BARRIER_CRATE", normT: 0.69, lateral: 3.2, scale: 1.0 },
      { type: "JUMP_RAMP", normT: 0.91, lateral: 0.0, scale: 1.15 },
    ],
  });

  return [
    {
      id: "cul_de_sac_cup",
      name: "Cul-de-Sac Cup",
      subtitle: "Neighborhood Series • 3 Suburban Circuits",
      badgeColor: "#f59e0b",
      tracks: [track1A, track1B, track1C],
    },
    {
      id: "neon_creek_cup",
      name: "Neon Creek Cup",
      subtitle: "Canyon & Plaza Series • 3 Technical Circuits",
      badgeColor: "#06b6d4",
      tracks: [track2A, track2B, track2C],
    },
    {
      id: "overdrive_crown_cup",
      name: "Overdrive Crown Cup",
      subtitle: "Pro Championship Series • 3 High-Stakes Circuits",
      badgeColor: "#f43f5e",
      tracks: [track3A, track3B, track3C],
    },
  ];
}

export function createDefaultCupsCatalog(): GrandPrixCupDefinition[] {
  const jsonCups = (
    defaultCupsJson as unknown as { cups?: GrandPrixCupDefinition[] }
  )?.cups;
  if (Array.isArray(jsonCups) && jsonCups.length > 0) {
    return jsonCups.map((cup) => ({
      ...cup,
      tracks: (cup.tracks ?? []).map((t) => hydrateTrackDefinition(t)),
    }));
  }
  return createCodePresetCupsCatalog();
}

export function getOfficialDefaultTrack(
  cupId: string,
  trackIdx: number,
  trackId?: string
): CustomTrackDefinition | null {
  const officialCups = createDefaultCupsCatalog();
  const cup = officialCups.find((c) => c.id === cupId);
  if (!cup) return null;
  if (trackId) {
    const byId = cup.tracks.find((t) => t.id === trackId);
    if (byId) return byId;
  }
  return cup.tracks[trackIdx] ?? null;
}

export function createNewTrackForCup(
  cupId: string,
  trackNumber: number
): CustomTrackDefinition {
  const base = createDefaultTrackDefinition();
  return {
    ...base,
    id: `${cupId}_custom_${Date.now()}`,
    cupId,
    name: `Custom Circuit #${trackNumber}`,
    description: "Custom player-designed circuit in the 3D Terrain & Circuit Studio.",
    isUserModified: true,
    updatedAt: Date.now(),
  };
}

export function createNewCustomCup(
  cupNumber: number,
  authorName?: string
): GrandPrixCupDefinition {
  const cupId = `custom_cup_${Date.now()}`;
  const badgeColors = ["#10b981", "#a855f7", "#3b82f6", "#ec4899", "#eab308"];
  const badgeColor = badgeColors[(cupNumber - 1) % badgeColors.length];
  const presetCups = createDefaultCupsCatalog();
  const baseTracks = [
    presetCups[0]?.tracks[0] ?? createDefaultTrackDefinition(),
    presetCups[0]?.tracks[1] ?? createDefaultTrackDefinition(),
    presetCups[0]?.tracks[2] ?? createDefaultTrackDefinition(),
  ];

  const tracks: CustomTrackDefinition[] = baseTracks.map((tmpl, idx) => ({
    ...hydrateTrackDefinition(tmpl),
    id: `${cupId}_race_${idx + 1}`,
    cupId,
    name: `Custom Cup #${cupNumber} • Race ${idx + 1}`,
    description: `Player-created circuit ${idx + 1} of 3 in Custom Cup #${cupNumber}.`,
    isUserModified: true,
    authorName: authorName || undefined,
    updatedAt: Date.now(),
  }));

  return {
    id: cupId,
    name: `Custom Cup #${cupNumber}`,
    subtitle: `${authorName ? `${authorName}'s ` : ""}Custom Series • 3 Circuits`,
    badgeColor,
    tracks,
    isCustomCup: true,
    authorName: authorName || undefined,
    updatedAt: Date.now(),
  };
}

export function sanitizeCustomTrackDefinition(
  raw: unknown
): CustomTrackDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return null;
  if (!Array.isArray(obj.controlPoints) || obj.controlPoints.length < 4) {
    return null;
  }

  const controlPoints: Array<{
    x: number;
    y: number;
    z: number;
    widthScale?: number;
  }> = [];
  for (const pt of obj.controlPoints) {
    if (!pt || typeof pt !== "object") return null;
    const p = pt as Record<string, unknown>;
    const x = Number(p.x);
    const y = Number(p.y ?? 0);
    const z = Number(p.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    const cleanPt: { x: number; y: number; z: number; widthScale?: number } = {
      x,
      y,
      z,
    };
    if (
      typeof p.widthScale === "number" &&
      Number.isFinite(p.widthScale) &&
      Math.abs(p.widthScale - 1.0) > 1e-3
    ) {
      cleanPt.widthScale = Math.max(0.5, Math.min(2.2, Number(p.widthScale)));
    }
    controlPoints.push(cleanPt);
  }

  const roadHalfWidth = Math.max(
    8,
    Math.min(24, Number(obj.roadHalfWidth) || ROAD_HALF_WIDTH)
  );

  const validObstacles: ObstaclePrefabType[] = [
    "PYLON_CONE",
    "OIL_SLICK",
    "WATER_PUDDLE",
    "BARRIER_CRATE",
    "JUMP_RAMP",
  ];
  const validTrackMasks: TrackMaskType[] = [
    "ROAD_HOLE",
    "SPLIT_MEDIAN",
    "BOOST_SHORTCUT",
    "PAVED_SHORTCUT",
    "SHALLOW_WATER",
  ];
  const validScenery: SceneryPrefabType[] = [
    "PINE_TREE",
    "OAK_TREE",
    "PALM_TREE",
    "BEACH_CABANA",
    "BOULDER",
    "GRANDSTAND",
    "SUBURBAN_HOUSE",
    "LAMP_POST",
  ];

  const boostPads: PlacedBoostPad[] = Array.isArray(obj.boostPads)
    ? obj.boostPads
        .filter((b) => b && typeof b === "object")
        .map((b, i) => {
          const rec = b as Record<string, unknown>;
          return {
            id: typeof rec.id === "string" ? rec.id : `boost_${i + 1}`,
            normT: Math.max(0, Math.min(1, Number(rec.normT) || 0)),
            lateral: Number(rec.lateral) || 0,
          };
        })
    : [];

  const itemBoxRows = Array.isArray(obj.itemBoxRows)
    ? obj.itemBoxRows
        .filter((r) => r && typeof r === "object")
        .map((r, i) => {
          const rec = r as Record<string, unknown>;
          return {
            id: typeof rec.id === "string" ? rec.id : `item_row_${i + 1}`,
            normT: Math.max(0, Math.min(1, Number(rec.normT) || 0)),
          };
        })
    : [];

  const obstacles: PlacedObstacle[] = Array.isArray(obj.obstacles)
    ? obj.obstacles
        .filter((o) => o && typeof o === "object")
        .flatMap((o, i) => {
          const rec = o as Record<string, unknown>;
          const type = rec.type as ObstaclePrefabType;
          if (!validObstacles.includes(type)) return [];
          return [
            {
              id: typeof rec.id === "string" ? rec.id : `obs_${i + 1}`,
              type,
              x: Number(rec.x) || 0,
              z: Number(rec.z) || 0,
              rotationY: Number(rec.rotationY) || 0,
              scale: Math.max(0.3, Math.min(3.5, Number(rec.scale) || 1.0)),
            },
          ];
        })
    : [];

  const trackMasks: PlacedTrackMask[] | undefined = Array.isArray(
    obj.trackMasks
  )
    ? obj.trackMasks
        .filter((m) => m && typeof m === "object")
        .flatMap((m, i) => {
          const rec = m as Record<string, unknown>;
          const type = rec.type as TrackMaskType;
          if (!validTrackMasks.includes(type)) return [];
          return [
            {
              id: typeof rec.id === "string" ? rec.id : `mask_${i + 1}`,
              type,
              normT: Math.max(0, Math.min(1, Number(rec.normT) || 0)),
              lateral: Number(rec.lateral) || 0,
              length: Math.max(4, Math.min(180, Number(rec.length) || 16)),
              width: Math.max(2.5, Math.min(20, Number(rec.width) || 6)),
            },
          ];
        })
    : undefined;

  const sceneryProps: PlacedSceneryProp[] = Array.isArray(obj.sceneryProps)
    ? obj.sceneryProps
        .filter((s) => s && typeof s === "object")
        .flatMap((s, i) => {
          const rec = s as Record<string, unknown>;
          const type = rec.type as SceneryPrefabType;
          if (!validScenery.includes(type)) return [];
          return [
            {
              id: typeof rec.id === "string" ? rec.id : `prop_${i + 1}`,
              type,
              x: Number(rec.x) || 0,
              z: Number(rec.z) || 0,
              rotationY: Number(rec.rotationY) || 0,
              scale: Math.max(0.3, Math.min(3.5, Number(rec.scale) || 1.0)),
              isManual: Boolean(rec.isManual),
            },
          ];
        })
    : [];

  const terrainMods: TerrainSculptMod[] = Array.isArray(obj.terrainMods)
    ? obj.terrainMods
        .filter((m) => m && typeof m === "object")
        .map((m, i) => {
          const rec = m as Record<string, unknown>;
          return {
            id: typeof rec.id === "string" ? rec.id : `mod_${i + 1}`,
            x: Number(rec.x) || 0,
            z: Number(rec.z) || 0,
            radius: Math.max(10, Math.min(250, Number(rec.radius) || 50)),
            deltaY: Math.max(-40, Math.min(40, Number(rec.deltaY) || 0)),
          };
        })
    : [];

  const biome: TrackBiome =
    obj.biome === "TROPICAL_ATOLL" ||
    obj.biome === "SUNSET_CANYON" ||
    obj.biome === "ALPINE_SUBURBS"
      ? obj.biome
      : "ALPINE_SUBURBS";

  return hydrateTrackDefinition({
    id: typeof obj.id === "string" ? obj.id : `track_${Date.now()}`,
    cupId: typeof obj.cupId === "string" ? obj.cupId : undefined,
    name: obj.name.trim().slice(0, 64),
    description:
      typeof obj.description === "string"
        ? obj.description.slice(0, 240)
        : "Imported custom circuit.",
    biome,
    roadHalfWidth,
    controlPoints,
    boostPads,
    itemBoxRows,
    obstacles,
    trackMasks,
    sceneryProps,
    autoTracksideScenery: obj.autoTracksideScenery !== false,
    sceneryDensity: Math.max(
      0.2,
      Math.min(2.5, Number(obj.sceneryDensity) || 1.0)
    ),
    scenerySeed: Number(obj.scenerySeed) || 0,
    terrainHillScale: Math.max(
      0,
      Math.min(3.0, Number(obj.terrainHillScale ?? 1.0))
    ),
    terrainMods,
    isUserModified: Boolean(obj.isUserModified),
    authorName:
      typeof obj.authorName === "string"
        ? obj.authorName.slice(0, 32)
        : undefined,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
  });
}

export function sanitizeCupDefinition(
  raw: unknown
): GrandPrixCupDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return null;
  if (!Array.isArray(obj.tracks) || obj.tracks.length === 0) return null;

  const tracks: CustomTrackDefinition[] = [];
  for (const t of obj.tracks.slice(0, 12)) {
    const clean = sanitizeCustomTrackDefinition(t);
    if (clean) tracks.push(clean);
  }
  if (tracks.length === 0) return null;

  const cupId =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim()
      : `custom_cup_${Date.now()}`;

  return {
    id: cupId,
    name: obj.name.trim().slice(0, 48),
    subtitle:
      typeof obj.subtitle === "string" && obj.subtitle.trim()
        ? obj.subtitle.trim().slice(0, 80)
        : `Custom Series • ${tracks.length} Circuits`,
    badgeColor:
      typeof obj.badgeColor === "string" && obj.badgeColor.startsWith("#")
        ? obj.badgeColor
        : "#10b981",
    tracks: tracks.map((t) => ({ ...t, cupId })),
    isCustomCup: Boolean(obj.isCustomCup ?? !isBuiltinCupId(cupId)),
    authorName:
      typeof obj.authorName === "string"
        ? obj.authorName.slice(0, 32)
        : undefined,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
  };
}

export function parseImportedTrackOrCupJson(
  jsonText: string
):
  | { kind: "TRACK"; track: CustomTrackDefinition }
  | { kind: "CUP"; cup: GrandPrixCupDefinition }
  | { kind: "CATALOG"; cups: GrandPrixCupDefinition[] }
  | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    // 1. Array of Cups or { cups: [...] } catalog wrapper
    const maybeCupsArray = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { cups?: unknown }).cups)
      ? (parsed as { cups: unknown[] }).cups
      : null;
    if (maybeCupsArray) {
      const cups = maybeCupsArray
        .map((c) => sanitizeCupDefinition(c))
        .filter((c): c is GrandPrixCupDefinition => c !== null);
      if (cups.length > 0) {
        return { kind: "CATALOG", cups };
      }
    }

    // 2. Single Cup object (or { cup: {...} } wrapper)
    const maybeCup =
      (parsed as { cup?: unknown }).cup !== undefined
        ? (parsed as { cup: unknown }).cup
        : parsed;
    const cup = sanitizeCupDefinition(maybeCup);
    if (cup) {
      return { kind: "CUP", cup };
    }

    // 3. Single Track object (or { track: {...} } wrapper)
    const maybeTrack =
      (parsed as { track?: unknown }).track !== undefined
        ? (parsed as { track: unknown }).track
        : parsed;
    const track = sanitizeCustomTrackDefinition(maybeTrack);
    if (track) {
      return { kind: "TRACK", track };
    }

    return null;
  } catch {
    return null;
  }
}

export function prepareCupsCatalogForRepoCommit(
  cups: GrandPrixCupDefinition[]
): GrandPrixCupDefinition[] {
  return cups.map((cup) => ({
    ...cup,
    tracks: cup.tracks.map((track) => {
      const copy: CustomTrackDefinition = {
        ...track,
      };
      delete copy.isUserModified;
      return copy;
    }),
  }));
}

export function loadSavedCupsCatalog(): GrandPrixCupDefinition[] {
  const officialCups = createDefaultCupsCatalog();
  if (typeof window === "undefined") {
    return officialCups;
  }
  try {
    const raw = window.localStorage.getItem(CUPS_CATALOG_STORAGE_KEY);
    if (!raw) return officialCups;
    const parsed = JSON.parse(raw) as GrandPrixCupDefinition[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return officialCups;
    }

    const catalogUpdatedAt =
      Number(
        (defaultCupsJson as unknown as { updatedAt?: number })?.updatedAt
      ) || 0;

    // Merge official cups with explicitly user-modified tracks & custom cups from localStorage
    const mergedCups: GrandPrixCupDefinition[] = officialCups.map(
      (officialCup) => {
        const savedCup = parsed.find((c) => c.id === officialCup.id);
        if (!savedCup || !Array.isArray(savedCup.tracks)) {
          return officialCup;
        }

        const mergedTracks: CustomTrackDefinition[] = officialCup.tracks.map(
          (officialTrack, idx) => {
            const savedTrack =
              (officialTrack.id
                ? savedCup.tracks.find((t) => t.id === officialTrack.id)
                : undefined) ?? savedCup.tracks[idx];
            const officialTimestamp = Math.max(
              officialTrack.updatedAt ?? 0,
              catalogUpdatedAt
            );
            if (
              savedTrack &&
              savedTrack.isUserModified &&
              (savedTrack.updatedAt ?? 0) > officialTimestamp
            ) {
              return hydrateTrackDefinition(savedTrack);
            }
            return officialTrack;
          }
        );

        // Preserve any extra user-added tracks in this official cup
        savedCup.tracks.forEach((savedTrack, idx) => {
          const matchesOfficial = officialCup.tracks.some(
            (ot, oIdx) =>
              (ot.id && ot.id === savedTrack.id) || oIdx === idx
          );
          if (!matchesOfficial) {
            mergedTracks.push(
              hydrateTrackDefinition({
                ...savedTrack,
                isUserModified: true,
              })
            );
          }
        });

        return {
          ...officialCup,
          tracks: mergedTracks,
        };
      }
    );

    // Append any custom player-created Cups stored in localStorage
    for (const savedCup of parsed) {
      const isAlreadyInOfficial = officialCups.some(
        (oc) => oc.id === savedCup.id
      );
      if (!isAlreadyInOfficial && Array.isArray(savedCup.tracks)) {
        const cleanCup = sanitizeCupDefinition({
          ...savedCup,
          isCustomCup: true,
        });
        if (cleanCup) {
          mergedCups.push(cleanCup);
        }
      }
    }

    return mergedCups;
  } catch {
    return officialCups;
  }
}

export function saveCupsCatalog(cups: GrandPrixCupDefinition[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUPS_CATALOG_STORAGE_KEY, JSON.stringify(cups));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedTrackDefinition(): CustomTrackDefinition {
  if (typeof window === "undefined") {
    return createDefaultTrackDefinition();
  }
  try {
    const raw = window.localStorage.getItem(TRACK_STORAGE_KEY);
    if (!raw) return createDefaultTrackDefinition();
    const parsed = JSON.parse(raw) as CustomTrackDefinition;
    if (
      !parsed ||
      !Array.isArray(parsed.controlPoints) ||
      parsed.controlPoints.length < 4
    ) {
      return createDefaultTrackDefinition();
    }
    return hydrateTrackDefinition(parsed);
  } catch {
    return createDefaultTrackDefinition();
  }
}

export function saveTrackDefinition(def: CustomTrackDefinition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRACK_STORAGE_KEY, JSON.stringify(def));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildProceduralTrack(
  scene: Scene,
  customDef?: CustomTrackDefinition
): BuiltTrack {
  const trackDef = customDef ?? createDefaultTrackDefinition();
  const biome: TrackBiome = trackDef.biome ?? "ALPINE_SUBURBS";
  const roadHalfWidth = trackDef.roadHalfWidth || ROAD_HALF_WIDTH;
  const curbOuterWidth = roadHalfWidth + 1.5;
  const wallHalfWidth = roadHalfWidth + 12.5;
  const trackMasks = trackDef.trackMasks ?? [];

  const root = new TransformNode("trackRoot", scene);

  // Biome-aware sky & ambient lighting + directional sunlight with shadows
  const hemiLight = new HemisphericLight(
    "hemiLight",
    new Vector3(0.15, 1.0, 0.1),
    scene
  );
  if (biome === "TROPICAL_ATOLL") {
    scene.clearColor = new Color4(0.32, 0.78, 0.96, 1.0);
    hemiLight.intensity = 0.85;
    hemiLight.diffuse = new Color3(0.96, 0.99, 1.0);
    hemiLight.groundColor = new Color3(0.28, 0.56, 0.54);
  } else if (biome === "SUNSET_CANYON") {
    scene.clearColor = new Color4(0.94, 0.52, 0.34, 1.0);
    hemiLight.intensity = 0.76;
    hemiLight.diffuse = new Color3(1.0, 0.88, 0.74);
    hemiLight.groundColor = new Color3(0.46, 0.26, 0.18);
  } else {
    scene.clearColor = new Color4(0.52, 0.76, 0.96, 1.0);
    hemiLight.intensity = 0.78;
    hemiLight.diffuse = new Color3(0.98, 0.98, 1.0);
    hemiLight.groundColor = new Color3(0.32, 0.42, 0.34);
  }

  const sunLight = new DirectionalLight(
    "sunLight",
    new Vector3(-0.55, -0.85, 0.45).normalize(),
    scene
  );
  sunLight.position = new Vector3(200, 220, -160);
  sunLight.intensity = biome === "TROPICAL_ATOLL" ? 1.05 : 0.95;
  sunLight.diffuse =
    biome === "SUNSET_CANYON"
      ? new Color3(1.0, 0.84, 0.66)
      : new Color3(1.0, 0.96, 0.88);

  const shadowGenerator = new ShadowGenerator(1024, sunLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 12;

  const {
    controlPoints,
    splinePoints,
    path3d,
    samples,
    totalTrackLength,
    queryClosestTrackPoint,
    getPointAtNormalizedT,
  } = computeTrackSplineSamples(
    trackDef.controlPoints,
    35,
    trackDef.terrainMods ?? [],
    roadHalfWidth,
    trackMasks
  );

  const leftEdge: Vector3[] = [];
  const centerLine: Vector3[] = [];
  const rightEdge: Vector3[] = [];

  const leftShoulderSkirt: Vector3[] = [];
  const leftCurbInner: Vector3[] = [];
  const leftCurbPeak: Vector3[] = [];
  const leftCurbOuter: Vector3[] = [];

  const rightCurbInner: Vector3[] = [];
  const rightCurbPeak: Vector3[] = [];
  const rightCurbOuter: Vector3[] = [];
  const rightShoulderSkirt: Vector3[] = [];

  const curbColorsLeft: Color4[] = [];
  const curbColorsRight: Color4[] = [];
  const shoulderColors: Color4[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const center = s.position;
    const binormal = s.binormal;
    const normal = s.normal;
    const localRoadHalf = roadHalfWidth * s.widthScale;
    const localCurbOuter = localRoadHalf + 1.5;

    const lRoad = center.subtract(binormal.scale(localRoadHalf));
    const rRoad = center.add(binormal.scale(localRoadHalf));

    leftEdge.push(lRoad);
    centerLine.push(center.clone().add(normal.scale(0.03)));
    rightEdge.push(rRoad);

    const curbMid = (localRoadHalf + localCurbOuter) * 0.5;
    leftCurbInner.push(lRoad.add(normal.scale(0.02)));
    leftCurbPeak.push(
      center.subtract(binormal.scale(curbMid)).add(normal.scale(0.18))
    );
    leftCurbOuter.push(
      center.subtract(binormal.scale(localCurbOuter)).subtract(normal.scale(0.08))
    );
    leftShoulderSkirt.push(
      center
        .subtract(binormal.scale(localCurbOuter + 4.4))
        .subtract(normal.scale(0.42))
    );

    rightCurbInner.push(rRoad.add(normal.scale(0.02)));
    rightCurbPeak.push(
      center.add(binormal.scale(curbMid)).add(normal.scale(0.18))
    );
    rightCurbOuter.push(
      center.add(binormal.scale(localCurbOuter)).subtract(normal.scale(0.08))
    );
    rightShoulderSkirt.push(
      center
        .add(binormal.scale(localCurbOuter + 4.4))
        .subtract(normal.scale(0.42))
    );

    const isPrimaryStripe = Math.floor(i / 2) % 2 === 0;
    const stripeColor = isPrimaryStripe
      ? biome === "TROPICAL_ATOLL"
        ? new Color4(0.06, 0.72, 0.85, 1.0)
        : biome === "SUNSET_CANYON"
        ? new Color4(0.95, 0.48, 0.12, 1.0)
        : new Color4(0.92, 0.18, 0.18, 1.0)
      : new Color4(0.96, 0.96, 0.98, 1.0);
    curbColorsLeft.push(stripeColor);
    curbColorsRight.push(stripeColor);
    shoulderColors.push(
      biome === "TROPICAL_ATOLL"
        ? new Color4(0.92, 0.82, 0.56, 1.0)
        : biome === "SUNSET_CANYON"
        ? new Color4(0.68, 0.36, 0.22, 1.0)
        : new Color4(0.44, 0.35, 0.24, 1.0)
    );
  }

  const allLeftCurbColors = [
    ...shoulderColors,
    ...curbColorsLeft,
    ...curbColorsLeft,
    ...curbColorsLeft,
  ];
  const allRightCurbColors = [
    ...curbColorsRight,
    ...curbColorsRight,
    ...curbColorsRight,
    ...shoulderColors,
  ];

  const pavementMesh = MeshBuilder.CreateRibbon(
    "pavement_ribbon",
    {
      pathArray: [leftEdge, centerLine, rightEdge],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene
  );
  pavementMesh.parent = root;
  pavementMesh.receiveShadows = true;
  pavementMesh.isPickable = true;
  pavementMesh.material = createAsphaltMaterial(scene);

  const leftCurbMesh = MeshBuilder.CreateRibbon(
    "curb_left",
    {
      pathArray: [leftShoulderSkirt, leftCurbOuter, leftCurbPeak, leftCurbInner],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
      colors: allLeftCurbColors,
    },
    scene
  );
  leftCurbMesh.parent = root;
  leftCurbMesh.isPickable = true;
  leftCurbMesh.receiveShadows = true;

  const rightCurbMesh = MeshBuilder.CreateRibbon(
    "curb_right",
    {
      pathArray: [rightCurbInner, rightCurbPeak, rightCurbOuter, rightShoulderSkirt],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
      colors: allRightCurbColors,
    },
    scene
  );
  rightCurbMesh.parent = root;
  rightCurbMesh.isPickable = true;
  rightCurbMesh.receiveShadows = true;

  const curbMat = new StandardMaterial("curbMat", scene);
  curbMat.diffuseColor = new Color3(1, 1, 1);
  curbMat.specularColor = new Color3(0.15, 0.15, 0.15);
  leftCurbMesh.material = curbMat;
  rightCurbMesh.material = curbMat;

  createStartFinishOverlayAndGantry(
    scene,
    root,
    samples[0],
    roadHalfWidth * samples[0].widthScale,
    shadowGenerator
  );

  const terrainHillScale = trackDef.terrainHillScale ?? 1.0;
  const terrainMods = trackDef.terrainMods ?? [];

  const groundMesh = createSculptedOffRoadTerrain(
    scene,
    root,
    samples,
    curbOuterWidth,
    wallHalfWidth,
    terrainHillScale,
    terrainMods,
    queryClosestTrackPoint,
    biome
  );

  // Build perimeter bollards + all placed Scenery Prefabs from trackDef
  populateEnvironmentProps(
    scene,
    root,
    samples,
    curbOuterWidth,
    wallHalfWidth,
    terrainHillScale,
    terrainMods,
    trackDef.sceneryProps,
    queryClosestTrackPoint,
    shadowGenerator,
    biome
  );

  // Item Box Row indices from trackDef (mapped via true arc-length normT)
  const itemBoxRowIndices = trackDef.itemBoxRows.map(
    (row) => getPointAtNormalizedT(row.normT, 0).sampleIndex
  );

  // Yellow & Orange Chevron Arrow Speed Booster Pads from trackDef
  const boostPads = createSpeedBoosterPads(
    scene,
    root,
    getPointAtNormalizedT,
    trackDef.boostPads
  );

  // Custom Track Obstacles (Pylons, Oil Slicks, Water Puddles, Barrier Crates, Jump Ramps)
  const obstacles = createTrackObstacles(
    scene,
    root,
    trackDef.obstacles,
    queryClosestTrackPoint,
    shadowGenerator
  );

  // Track Masks (Road Holes / Pit Cutouts, Parallel Split-Lane Medians, Shortcuts & Shallow Water)
  createTrackMasks(
    scene,
    root,
    totalTrackLength,
    getPointAtNormalizedT,
    trackMasks,
    shadowGenerator
  );

  const { svgPath, viewBox } = computeMiniMapSvg(samples);

  return {
    biome,
    controlPoints,
    splinePoints,
    path3d,
    samples,
    totalTrackLength,
    roadHalfWidth,
    curbWidth: curbOuterWidth,
    wallHalfWidth,
    pavementMesh,
    leftCurbMesh,
    rightCurbMesh,
    groundMesh,
    shadowGenerator,
    itemBoxRowIndices,
    boostPads,
    obstacles,
    trackMasks,
    queryClosestTrackPoint,
    getPointAtNormalizedT,
    miniMapSvgPath: svgPath,
    miniMapViewBox: viewBox,
  };
}

function createSpeedBoosterPads(
  scene: Scene,
  parent: TransformNode,
  getPointAtNormalizedT: (t: number, lateralOffset?: number) => {
    position: Vector3;
    tangent: Vector3;
    normal: Vector3;
    binormal: Vector3;
    sampleIndex: number;
  },
  placements: PlacedBoostPad[]
): BoostPadZone[] {
  const padTex = new DynamicTexture(
    "boostPadChevronTex",
    { width: 256, height: 512 },
    scene,
    true
  );
  const ctx = padTex.getContext() as unknown as CanvasRenderingContext2D;

  ctx.fillStyle = "#18181b";
  ctx.fillRect(0, 0, 256, 512);

  ctx.fillStyle = "#facc15";
  ctx.fillRect(8, 0, 14, 512);
  ctx.fillRect(234, 0, 14, 512);

  const drawChevron = (yOffset: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(36, yOffset + 115);
    ctx.lineTo(128, yOffset + 25);
    ctx.lineTo(220, yOffset + 115);
    ctx.lineTo(220, yOffset + 65);
    ctx.lineTo(128, yOffset - 25);
    ctx.lineTo(36, yOffset + 65);
    ctx.closePath();
    ctx.fill();
  };

  drawChevron(60, "#fde047");
  drawChevron(205, "#facc15");
  drawChevron(350, "#f97316");
  padTex.update();

  const padMat = new StandardMaterial("boostPadMat", scene);
  padMat.diffuseTexture = padTex;
  padMat.emissiveColor = new Color3(0.85, 0.65, 0.1);
  padMat.specularColor = new Color3(0.4, 0.4, 0.2);

  const zones: BoostPadZone[] = [];

  placements.forEach((cfg, idx) => {
    const sample = getPointAtNormalizedT(cfg.normT, cfg.lateral);
    const padPos = sample.position.add(new Vector3(0, 0.09, 0));

    const padNode = new TransformNode(`boostPadNode_${idx}`, scene);
    padNode.parent = parent;
    padNode.position.copyFrom(padPos);

    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    const pitch = -Math.asin(
      Math.max(-0.45, Math.min(0.45, sample.tangent.y))
    );
    padNode.rotation = new Vector3(pitch, yaw, 0);

    const padTop = MeshBuilder.CreatePlane(
      `boostPad_${idx}`,
      { width: 4.6, height: 6.8, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    padTop.parent = padNode;
    padTop.rotation.x = Math.PI / 2;
    padTop.material = padMat;
    padTop.isPickable = false;

    zones.push({
      id: cfg.id || `boost_pad_${idx}`,
      position: padPos,
      tangent: sample.tangent.clone(),
      radius: 4.2,
    });
  });

  return zones;
}

function createTrackObstacles(
  scene: Scene,
  parent: TransformNode,
  placedObstacles: PlacedObstacle[],
  queryClosestTrackPoint: (worldPos: Vector3) => ClosestTrackQuery,
  shadowGenerator: ShadowGenerator
): TrackObstacleZone[] {
  const coneOrangeMat = new StandardMaterial("coneOrangeMat", scene);
  coneOrangeMat.diffuseColor = new Color3(0.98, 0.38, 0.08);
  coneOrangeMat.emissiveColor = new Color3(0.25, 0.08, 0.02);

  const coneWhiteMat = new StandardMaterial("coneWhiteMat", scene);
  coneWhiteMat.diffuseColor = new Color3(0.95, 0.96, 0.98);

  const oilTex = new DynamicTexture(
    "oilSheenTex",
    { width: 256, height: 256 },
    scene,
    true
  );
  const oCtx = oilTex.getContext() as unknown as CanvasRenderingContext2D;
  oCtx.fillStyle = "#090a0f";
  oCtx.fillRect(0, 0, 256, 256);
  const oilGrad = oCtx.createRadialGradient(128, 128, 16, 128, 128, 118);
  oilGrad.addColorStop(0.0, "#11131d");
  oilGrad.addColorStop(0.38, "#4c1d95");
  oilGrad.addColorStop(0.62, "#0e7490");
  oilGrad.addColorStop(0.82, "#a21caf");
  oilGrad.addColorStop(1.0, "#090a0f");
  oCtx.fillStyle = oilGrad;
  oCtx.beginPath();
  oCtx.arc(128, 128, 122, 0, Math.PI * 2);
  oCtx.fill();
  oilTex.update();

  const oilMat = new StandardMaterial("oilSlickMat", scene);
  oilMat.diffuseTexture = oilTex;
  oilMat.emissiveColor = new Color3(0.16, 0.07, 0.24);
  oilMat.specularColor = new Color3(0.95, 0.55, 1.0);
  oilMat.specularPower = 96;

  const waterTex = new DynamicTexture(
    "waterPuddleTex",
    { width: 256, height: 256 },
    scene,
    true
  );
  const wCtx = waterTex.getContext() as unknown as CanvasRenderingContext2D;
  const wGrad = wCtx.createRadialGradient(128, 128, 10, 128, 128, 124);
  wGrad.addColorStop(0.0, "#0284c7");
  wGrad.addColorStop(0.55, "#0ea5e9");
  wGrad.addColorStop(0.84, "#38bdf8");
  wGrad.addColorStop(1.0, "#7dd3fc");
  wCtx.fillStyle = wGrad;
  wCtx.fillRect(0, 0, 256, 256);
  wCtx.strokeStyle = "rgba(255,255,255,0.38)";
  wCtx.lineWidth = 3;
  for (const r of [34, 68, 98]) {
    wCtx.beginPath();
    wCtx.arc(128, 128, r, 0, Math.PI * 2);
    wCtx.stroke();
  }
  waterTex.update();

  const waterMat = new StandardMaterial("waterPuddleMat", scene);
  waterMat.diffuseTexture = waterTex;
  waterMat.emissiveColor = new Color3(0.06, 0.28, 0.44);
  waterMat.specularColor = new Color3(0.95, 0.98, 1.0);
  waterMat.specularPower = 128;
  waterMat.alpha = 0.88;

  const crateMat = new StandardMaterial("barrierCrateMat", scene);
  crateMat.diffuseColor = new Color3(0.92, 0.68, 0.14);

  const rampMat = new StandardMaterial("jumpRampMat", scene);
  rampMat.diffuseColor = new Color3(0.08, 0.78, 0.95);
  rampMat.emissiveColor = new Color3(0.05, 0.35, 0.45);

  const zones: TrackObstacleZone[] = [];

  placedObstacles.forEach((obs, idx) => {
    const q = queryClosestTrackPoint(new Vector3(obs.x, 0, obs.z));
    const groundY = q.roadY;
    const scale = obs.scale || 1.0;
    const node = new TransformNode(`obstacle_${idx}`, scene);
    node.parent = parent;
    node.position = new Vector3(obs.x, groundY, obs.z);
    node.rotation.y = obs.rotationY || Math.atan2(q.tangent.x, q.tangent.z);

    if (obs.type === "PYLON_CONE") {
      const base = MeshBuilder.CreateBox(
        `coneBase_${idx}`,
        { width: 1.3 * scale, height: 0.18 * scale, depth: 1.3 * scale },
        scene
      );
      base.parent = node;
      base.position.y = 0.09 * scale;
      base.material = coneOrangeMat;
      base.isPickable = false;

      const cone = MeshBuilder.CreateCylinder(
        `coneBody_${idx}`,
        {
          height: 1.8 * scale,
          diameterTop: 0.18 * scale,
          diameterBottom: 1.05 * scale,
          tessellation: 16,
        },
        scene
      );
      cone.parent = node;
      cone.position.y = 0.98 * scale;
      cone.material = coneOrangeMat;
      cone.isPickable = false;

      const stripe = MeshBuilder.CreateCylinder(
        `coneStripe_${idx}`,
        {
          height: 0.42 * scale,
          diameterTop: 0.48 * scale,
          diameterBottom: 0.72 * scale,
          tessellation: 16,
        },
        scene
      );
      stripe.parent = node;
      stripe.position.y = 1.05 * scale;
      stripe.material = coneWhiteMat;
      stripe.isPickable = false;
      shadowGenerator.addShadowCaster(cone);

      zones.push({
        id: obs.id,
        type: obs.type,
        position: node.position.clone(),
        radius: 1.25 * scale,
        rotationY: node.rotation.y,
        scale,
      });
    } else if (obs.type === "OIL_SLICK") {
      const slick = MeshBuilder.CreateCylinder(
        `oilSlick_${idx}`,
        { height: 0.06, diameter: 5.4 * scale, tessellation: 24 },
        scene
      );
      slick.parent = node;
      slick.position.y = 0.06;
      slick.material = oilMat;
      slick.isPickable = false;

      zones.push({
        id: obs.id,
        type: obs.type,
        position: node.position.clone(),
        radius: 2.7 * scale,
        rotationY: node.rotation.y,
        scale,
      });
    } else if (obs.type === "WATER_PUDDLE") {
      const puddle = MeshBuilder.CreateCylinder(
        `waterPuddle_${idx}`,
        { height: 0.05, diameter: 6.4 * scale, tessellation: 24 },
        scene
      );
      puddle.parent = node;
      puddle.position.y = 0.055;
      puddle.material = waterMat;
      puddle.isPickable = false;

      zones.push({
        id: obs.id,
        type: obs.type,
        position: node.position.clone(),
        radius: 3.2 * scale,
        rotationY: node.rotation.y,
        scale,
      });
    } else if (obs.type === "BARRIER_CRATE") {
      const crate = MeshBuilder.CreateBox(
        `barrierCrate_${idx}`,
        { width: 2.6 * scale, height: 1.5 * scale, depth: 1.6 * scale },
        scene
      );
      crate.parent = node;
      crate.position.y = 0.75 * scale;
      crate.material = crateMat;
      crate.isPickable = false;
      shadowGenerator.addShadowCaster(crate);

      zones.push({
        id: obs.id,
        type: obs.type,
        position: node.position.clone(),
        radius: 1.75 * scale,
        rotationY: node.rotation.y,
        scale,
      });
    } else if (obs.type === "JUMP_RAMP") {
      const ramp = MeshBuilder.CreateBox(
        `jumpRamp_${idx}`,
        { width: 5.0 * scale, height: 0.28 * scale, depth: 5.4 * scale },
        scene
      );
      ramp.parent = node;
      ramp.position.y = 0.78 * scale;
      ramp.rotation.x = -0.34;
      ramp.material = rampMat;
      ramp.isPickable = false;

      zones.push({
        id: obs.id,
        type: obs.type,
        position: node.position.clone(),
        radius: 3.1 * scale,
        rotationY: node.rotation.y,
        scale,
      });
    }
  });

  return zones;
}

function createTrackMasks(
  scene: Scene,
  parent: TransformNode,
  totalTrackLength: number,
  getPointAtNormalizedT: (t: number, lateralOffset?: number) => {
    position: Vector3;
    tangent: Vector3;
    normal: Vector3;
    binormal: Vector3;
    sampleIndex: number;
  },
  trackMasks: PlacedTrackMask[],
  shadowGenerator: ShadowGenerator
): void {
  if (!trackMasks || trackMasks.length === 0) return;

  const voidMat = new StandardMaterial("roadHoleVoidMat", scene);
  voidMat.diffuseColor = new Color3(0.02, 0.02, 0.04);
  voidMat.emissiveColor = new Color3(0.03, 0.01, 0.08);
  voidMat.specularColor = Color3.Black();

  const cautionRimMat = new StandardMaterial("roadHoleRimMat", scene);
  cautionRimMat.diffuseColor = new Color3(0.96, 0.72, 0.08);
  cautionRimMat.emissiveColor = new Color3(0.32, 0.2, 0.02);

  const medianGrassMat = new StandardMaterial("splitMedianGrassMat", scene);
  medianGrassMat.diffuseColor = new Color3(0.18, 0.56, 0.24);
  medianGrassMat.specularColor = new Color3(0.05, 0.08, 0.05);

  const medianCurbMat = new StandardMaterial("splitMedianCurbMat", scene);
  medianCurbMat.diffuseColor = new Color3(0.92, 0.26, 0.22);
  medianCurbMat.emissiveColor = new Color3(0.18, 0.05, 0.04);

  trackMasks.forEach((mask, idx) => {
    if (mask.type === "ROAD_HOLE") {
      const sample = getPointAtNormalizedT(mask.normT, mask.lateral);
      const holeNode = new TransformNode(`roadHole_${idx}`, scene);
      holeNode.parent = parent;
      holeNode.position = sample.position.add(new Vector3(0, 0.075, 0));
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      const pitch = -Math.asin(
        Math.max(-0.45, Math.min(0.45, sample.tangent.y))
      );
      holeNode.rotation = new Vector3(pitch, yaw, 0);

      const rim = MeshBuilder.CreateBox(
        `roadHoleRim_${idx}`,
        {
          width: mask.width + 0.9,
          height: 0.14,
          depth: mask.length + 0.9,
        },
        scene
      );
      rim.parent = holeNode;
      rim.material = cautionRimMat;
      rim.isPickable = false;

      const pitVoid = MeshBuilder.CreateBox(
        `roadHoleVoid_${idx}`,
        {
          width: mask.width,
          height: 0.18,
          depth: mask.length,
        },
        scene
      );
      pitVoid.parent = holeNode;
      pitVoid.position.y = 0.03;
      pitVoid.material = voidMat;
      pitVoid.isPickable = false;
    } else if (mask.type === "SPLIT_MEDIAN") {
      const steps = 16;
      const halfSpanT =
        Math.max(8, mask.length * 0.5) / Math.max(100, totalTrackLength);
      const halfW = Math.max(1.5, mask.width * 0.5);

      const leftBase: Vector3[] = [];
      const leftTop: Vector3[] = [];
      const rightTop: Vector3[] = [];
      const rightBase: Vector3[] = [];

      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const t = mask.normT - halfSpanT + u * (halfSpanT * 2);
        const taper =
          u < 0.15
            ? u / 0.15
            : u > 0.85
            ? (1 - u) / 0.15
            : 1.0;
        const w = Math.max(0.4, halfW * taper);
        const pt = getPointAtNormalizedT(t, mask.lateral);
        const c = pt.position;
        const b = pt.binormal;
        const n = pt.normal;

        leftBase.push(c.subtract(b.scale(w + 0.45)).add(n.scale(0.03)));
        leftTop.push(c.subtract(b.scale(w)).add(n.scale(0.55)));
        rightTop.push(c.add(b.scale(w)).add(n.scale(0.55)));
        rightBase.push(c.add(b.scale(w + 0.45)).add(n.scale(0.03)));
      }

      const medianCurb = MeshBuilder.CreateRibbon(
        `splitMedianCurb_${idx}`,
        {
          pathArray: [leftBase, leftTop, rightTop, rightBase],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      medianCurb.parent = parent;
      medianCurb.material = medianCurbMat;
      medianCurb.isPickable = false;
      shadowGenerator.addShadowCaster(medianCurb);

      const medianGrass = MeshBuilder.CreateRibbon(
        `splitMedianGrass_${idx}`,
        {
          pathArray: [leftTop, rightTop],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      medianGrass.parent = parent;
      medianGrass.position.y += 0.02;
      medianGrass.material = medianGrassMat;
      medianGrass.isPickable = false;
    } else if (
      mask.type === "BOOST_SHORTCUT" ||
      mask.type === "PAVED_SHORTCUT"
    ) {
      const isPaved = mask.type === "PAVED_SHORTCUT";
      const steps = 18;
      const halfSpanT =
        Math.max(10, mask.length * 0.5) / Math.max(100, totalTrackLength);
      const halfW = Math.max(2.5, mask.width * 0.5);

      const leftRail: Vector3[] = [];
      const leftLane: Vector3[] = [];
      const rightLane: Vector3[] = [];
      const rightRail: Vector3[] = [];

      const sideSign = mask.lateral >= 0 ? 1 : -1;

      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const t = mask.normT - halfSpanT + u * (halfSpanT * 2);
        // Smooth arch curve that peels off the main road edge, reaches mask.lateral at u=0.5, and rejoins cleanly!
        const archBell = Math.sin(u * Math.PI);
        const latCenter =
          sideSign * 8.0 + (mask.lateral - sideSign * 8.0) * archBell;
        const pt = getPointAtNormalizedT(t, latCenter);
        const c = pt.position;
        const b = pt.binormal;
        const n = pt.normal;

        leftRail.push(c.subtract(b.scale(halfW + 0.55)).add(n.scale(0.14)));
        leftLane.push(c.subtract(b.scale(halfW)).add(n.scale(0.055)));
        rightLane.push(c.add(b.scale(halfW)).add(n.scale(0.055)));
        rightRail.push(c.add(b.scale(halfW + 0.55)).add(n.scale(0.14)));
      }

      const laneMat = new StandardMaterial(
        `shortcutLaneMat_${idx}`,
        scene
      );
      if (isPaved) {
        laneMat.diffuseColor = new Color3(0.14, 0.24, 0.36);
        laneMat.emissiveColor = new Color3(0.03, 0.1, 0.18);
        laneMat.specularColor = new Color3(0.2, 0.3, 0.4);
      } else {
        laneMat.diffuseColor = new Color3(0.62, 0.44, 0.22);
        laneMat.emissiveColor = new Color3(0.12, 0.07, 0.02);
        laneMat.specularColor = new Color3(0.08, 0.06, 0.04);
      }

      const railMat = new StandardMaterial(
        `shortcutRailMat_${idx}`,
        scene
      );
      if (isPaved) {
        railMat.diffuseColor = new Color3(0.06, 0.78, 0.96);
        railMat.emissiveColor = new Color3(0.04, 0.45, 0.62);
      } else {
        railMat.diffuseColor = new Color3(0.98, 0.52, 0.08);
        railMat.emissiveColor = new Color3(0.38, 0.16, 0.02);
      }

      const shortcutSurface = MeshBuilder.CreateRibbon(
        `shortcutLane_${idx}`,
        {
          pathArray: [leftLane, rightLane],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      shortcutSurface.parent = parent;
      shortcutSurface.material = laneMat;
      shortcutSurface.isPickable = false;

      const leftBorder = MeshBuilder.CreateRibbon(
        `shortcutLeftRail_${idx}`,
        {
          pathArray: [leftRail, leftLane],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      leftBorder.parent = parent;
      leftBorder.material = railMat;
      leftBorder.isPickable = false;

      const rightBorder = MeshBuilder.CreateRibbon(
        `shortcutRightRail_${idx}`,
        {
          pathArray: [rightLane, rightRail],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      rightBorder.parent = parent;
      rightBorder.material = railMat;
      rightBorder.isPickable = false;

      // Entry & Exit Beacon Gate Posts so players can spot the shortcut from far away
      for (const gateIdx of [2, steps - 2]) {
        for (const railArr of [leftRail, rightRail]) {
          const gatePt = railArr[gateIdx];
          if (!gatePt) continue;
          const post = MeshBuilder.CreateCylinder(
            `shortcutGate_${idx}_${gateIdx}`,
            {
              height: 2.2,
              diameterTop: 0.36,
              diameterBottom: 0.52,
              tessellation: 10,
            },
            scene
          );
          post.parent = parent;
          post.position = gatePt.add(new Vector3(0, 1.05, 0));
          post.material = railMat;
          post.isPickable = false;
        }
      }
    } else if (mask.type === "SHALLOW_WATER") {
      const steps = 18;
      const halfSpanT =
        Math.max(8, mask.length * 0.5) / Math.max(100, totalTrackLength);
      const halfW = Math.max(3.5, mask.width * 0.5);

      const leftFoam: Vector3[] = [];
      const leftWater: Vector3[] = [];
      const rightWater: Vector3[] = [];
      const rightFoam: Vector3[] = [];

      const isOffCenter = Math.abs(mask.lateral) > 4.0;
      const sideSign = mask.lateral >= 0 ? 1 : -1;

      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const t = mask.normT - halfSpanT + u * (halfSpanT * 2);
        const archBell = Math.sin(u * Math.PI);
        const latCenter = isOffCenter
          ? sideSign * 6.0 + (mask.lateral - sideSign * 6.0) * archBell
          : mask.lateral;
        const taper =
          u < 0.14
            ? 0.55 + 0.45 * (u / 0.14)
            : u > 0.86
            ? 0.55 + 0.45 * ((1 - u) / 0.14)
            : 1.0;
        const w = halfW * taper;
        const pt = getPointAtNormalizedT(t, latCenter);
        const c = pt.position;
        const b = pt.binormal;
        const n = pt.normal;

        leftFoam.push(c.subtract(b.scale(w + 0.75)).add(n.scale(0.055)));
        leftWater.push(c.subtract(b.scale(w)).add(n.scale(0.075)));
        rightWater.push(c.add(b.scale(w)).add(n.scale(0.075)));
        rightFoam.push(c.add(b.scale(w + 0.75)).add(n.scale(0.055)));
      }

      const lagoonWaterMat = new StandardMaterial(
        `shallowWaterLagoonMat_${idx}`,
        scene
      );
      lagoonWaterMat.diffuseColor = new Color3(0.05, 0.72, 0.88);
      lagoonWaterMat.emissiveColor = new Color3(0.04, 0.34, 0.46);
      lagoonWaterMat.specularColor = new Color3(0.92, 0.98, 1.0);
      lagoonWaterMat.specularPower = 96;
      lagoonWaterMat.alpha = 0.82;

      const foamMat = new StandardMaterial(
        `shallowWaterFoamMat_${idx}`,
        scene
      );
      foamMat.diffuseColor = new Color3(0.88, 0.96, 1.0);
      foamMat.emissiveColor = new Color3(0.22, 0.42, 0.48);
      foamMat.alpha = 0.75;

      const waterRibbon = MeshBuilder.CreateRibbon(
        `shallowWaterRibbon_${idx}`,
        {
          pathArray: [leftWater, rightWater],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      waterRibbon.parent = parent;
      waterRibbon.material = lagoonWaterMat;
      waterRibbon.isPickable = false;

      const leftFoamRibbon = MeshBuilder.CreateRibbon(
        `shallowWaterLeftFoam_${idx}`,
        {
          pathArray: [leftFoam, leftWater],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      leftFoamRibbon.parent = parent;
      leftFoamRibbon.material = foamMat;
      leftFoamRibbon.isPickable = false;

      const rightFoamRibbon = MeshBuilder.CreateRibbon(
        `shallowWaterRightFoam_${idx}`,
        {
          pathArray: [rightWater, rightFoam],
          closePath: false,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene
      );
      rightFoamRibbon.parent = parent;
      rightFoamRibbon.material = foamMat;
      rightFoamRibbon.isPickable = false;
    }
  });
}

function projectHorizontalSegment(
  pos: Vector3,
  a: Vector3,
  b: Vector3
): { t: number; point: Vector3; distSq: number } {
  const abX = b.x - a.x;
  const abZ = b.z - a.z;
  const lenSq = abX * abX + abZ * abZ;
  if (lenSq < 1e-6) {
    const dx = pos.x - a.x;
    const dz = pos.z - a.z;
    return { t: 0, point: a.clone(), distSq: dx * dx + dz * dz };
  }
  const apX = pos.x - a.x;
  const apZ = pos.z - a.z;
  const t = Math.max(0, Math.min(1, (apX * abX + apZ * abZ) / lenSq));
  const point = Vector3.Lerp(a, b, t);
  const dx = pos.x - point.x;
  const dz = pos.z - point.z;
  return { t, point, distSq: dx * dx + dz * dz };
}

function createAsphaltMaterial(scene: Scene): StandardMaterial {
  const tex = new DynamicTexture(
    "asphaltTex",
    { width: 512, height: 1024 },
    scene,
    true
  );
  const ctx = tex.getContext();

  ctx.fillStyle = "#1e2430";
  ctx.fillRect(0, 0, 512, 1024);

  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 1024;
    ctx.fillStyle = i % 2 === 0 ? "#283040" : "#151922";
    ctx.fillRect(x, y, 3, 3);
  }

  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(22, 0, 10, 1024);
  ctx.fillRect(480, 0, 10, 1024);

  ctx.fillStyle = "#facc15";
  for (let y = 16; y < 1024; y += 32) {
    ctx.fillRect(251, y, 10, 18);
  }

  tex.update();

  const mat = new StandardMaterial("asphaltMat", scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0.12, 0.12, 0.15);
  return mat;
}

function createStartFinishOverlayAndGantry(
  scene: Scene,
  parent: TransformNode,
  startSample: TrackSample,
  roadHalfWidth: number,
  shadowGenerator: ShadowGenerator
): void {
  const checkerTex = new DynamicTexture(
    "checkerTex",
    { width: 512, height: 128 },
    scene,
    true
  );
  const ctx = checkerTex.getContext();
  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#f8fafc" : "#0f172a";
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  checkerTex.update();

  const checkerMat = new StandardMaterial("checkerMat", scene);
  checkerMat.diffuseTexture = checkerTex;
  checkerMat.emissiveColor = new Color3(0.15, 0.15, 0.15);

  const finishStrip = MeshBuilder.CreatePlane(
    "pavement_start_line",
    { width: roadHalfWidth * 1.96, height: 3.4 },
    scene
  );
  finishStrip.parent = parent;
  finishStrip.position = startSample.position.add(new Vector3(0, 0.09, 0));
  const yaw = Math.atan2(startSample.tangent.x, startSample.tangent.z);
  finishStrip.rotation = new Vector3(Math.PI / 2, yaw, 0);
  finishStrip.material = checkerMat;
  finishStrip.isPickable = false;

  const pillarMat = new StandardMaterial("gantryPillarMat", scene);
  pillarMat.diffuseColor = new Color3(0.95, 0.25, 0.18);

  const bannerTex = new DynamicTexture(
    "gantryBannerTex",
    { width: 512, height: 128 },
    scene,
    true
  );
  const bCtx = bannerTex.getContext() as unknown as CanvasRenderingContext2D;
  bCtx.fillStyle = "#0f172a";
  bCtx.fillRect(0, 0, 512, 128);
  bCtx.fillStyle = "#facc15";
  bCtx.fillRect(0, 0, 512, 14);
  bCtx.fillRect(0, 114, 512, 14);
  bCtx.font = "bold 46px sans-serif";
  bCtx.fillStyle = "#f8fafc";
  bCtx.textAlign = "center";
  bCtx.fillText("GUTSY KARTS GP", 256, 78);
  bannerTex.update();

  const bannerMat = new StandardMaterial("gantryBannerMat", scene);
  bannerMat.diffuseTexture = bannerTex;
  bannerMat.emissiveColor = new Color3(0.25, 0.25, 0.25);

  const gantryNode = new TransformNode("startGantry", scene);
  gantryNode.parent = parent;
  gantryNode.position = startSample.position.clone();
  gantryNode.rotation.y = yaw;

  const leftPillar = MeshBuilder.CreateCylinder(
    "gantryLeft",
    { height: 8.5, diameter: 0.9, tessellation: 12 },
    scene
  );
  leftPillar.parent = gantryNode;
  leftPillar.position = new Vector3(-(roadHalfWidth + 1.4), 4.25, 0);
  leftPillar.material = pillarMat;

  const rightPillar = MeshBuilder.CreateCylinder(
    "gantryRight",
    { height: 8.5, diameter: 0.9, tessellation: 12 },
    scene
  );
  rightPillar.parent = gantryNode;
  rightPillar.position = new Vector3(roadHalfWidth + 1.4, 4.25, 0);
  rightPillar.material = pillarMat;

  const topBanner = MeshBuilder.CreateBox(
    "gantryBanner",
    { width: (roadHalfWidth + 1.6) * 2, height: 2.1, depth: 0.8 },
    scene
  );
  topBanner.parent = gantryNode;
  topBanner.position = new Vector3(0, 7.8, 0);
  topBanner.material = bannerMat;

  shadowGenerator.addShadowCaster(leftPillar);
  shadowGenerator.addShadowCaster(rightPillar);
  shadowGenerator.addShadowCaster(topBanner);
}

function createSculptedOffRoadTerrain(
  scene: Scene,
  parent: TransformNode,
  samples: TrackSample[],
  curbOuterWidth: number,
  wallHalfWidth: number,
  terrainHillScale: number,
  terrainMods: TerrainSculptMod[],
  queryClosestTrackPoint: (worldPos: Vector3) => ClosestTrackQuery,
  biome: TrackBiome = "ALPINE_SUBURBS"
): Mesh {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let minRoadY = Number.POSITIVE_INFINITY;
  for (const s of samples) {
    if (s.position.x < minX) minX = s.position.x;
    if (s.position.x > maxX) maxX = s.position.x;
    if (s.position.z < minZ) minZ = s.position.z;
    if (s.position.z > maxZ) maxZ = s.position.z;
    if (s.position.y < minRoadY) minRoadY = s.position.y;
  }
  if (!Number.isFinite(minRoadY)) minRoadY = 0;

  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const span = Math.max(920, Math.max(maxX - minX, maxZ - minZ) + 340);

  const ground = MeshBuilder.CreateGround(
    "offroad_terrain",
    {
      width: span,
      height: span,
      subdivisions: 140,
      updatable: true,
    },
    scene
  );
  ground.parent = parent;
  ground.position = new Vector3(centerX, 0, centerZ);
  ground.receiveShadows = true;
  ground.isPickable = true;

  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    const colors: number[] = [];
    const worldCenter = ground.position;

    for (let i = 0; i < positions.length; i += 3) {
      const wx = positions[i] + worldCenter.x;
      const wz = positions[i + 2] + worldCenter.z;
      const { y, dist, roadY } = evaluateTerrainHeightAt(
        wx,
        wz,
        queryClosestTrackPoint,
        curbOuterWidth,
        wallHalfWidth,
        terrainHillScale,
        terrainMods,
        biome
      );

      positions[i + 1] = y;
      const relHeight = y - roadY;
      const isChecker =
        (Math.floor(wx / 14) + Math.floor(wz / 14)) % 2 === 0;

      if (biome === "TROPICAL_ATOLL") {
        if (relHeight < -1.8) {
          // Deep turquoise coral lagoon seabed
          colors.push(0.05, 0.52, 0.68, 1.0);
        } else if (relHeight < -0.75 || dist > wallHalfWidth + 6.0) {
          // Wet golden shoreline sand & coastal beach slope
          colors.push(0.88, 0.76, 0.48, 1.0);
        } else if (dist < curbOuterWidth + 5.5) {
          // Warm sun-bleached coral sand shoulder
          colors.push(0.96, 0.87, 0.6, 1.0);
        } else if (relHeight > 7.5) {
          // Tropical volcanic / limestone ridge
          colors.push(0.45, 0.42, 0.38, 1.0);
        } else if (isChecker) {
          // Lush island palm turf
          colors.push(0.28, 0.66, 0.34, 1.0);
        } else {
          // Golden sandy dune patch
          colors.push(0.92, 0.82, 0.54, 1.0);
        }
      } else if (biome === "SUNSET_CANYON") {
        if (dist < curbOuterWidth + 3.6) {
          colors.push(0.68, 0.36, 0.22, 1.0); // Red clay runoff shoulder
        } else if (relHeight > 12.5) {
          colors.push(0.92, 0.64, 0.38, 1.0); // Sunlit sandstone mesa cap
        } else if (relHeight > 6.5) {
          colors.push(0.76, 0.34, 0.2, 1.0); // Terracotta canyon cliff wall
        } else if (relHeight < -2.2) {
          colors.push(0.44, 0.24, 0.16, 1.0); // Deep arroyo floor
        } else if (isChecker) {
          colors.push(0.84, 0.52, 0.28, 1.0);
        } else {
          colors.push(0.76, 0.45, 0.24, 1.0);
        }
      } else {
        if (dist < curbOuterWidth + 3.2) {
          colors.push(0.46, 0.36, 0.24, 1.0); // Dirt runoff shoulder
        } else if (relHeight > 15.0) {
          colors.push(0.88, 0.91, 0.95, 1.0); // Snow-dusted high peak
        } else if (relHeight > 8.5) {
          colors.push(0.46, 0.49, 0.54, 1.0); // Rocky mountain slope
        } else if (relHeight < -2.5) {
          colors.push(0.36, 0.3, 0.2, 1.0); // Deep canyon / valley floor
        } else if (isChecker) {
          colors.push(0.24, 0.56, 0.26, 1.0);
        } else {
          colors.push(0.2, 0.49, 0.23, 1.0);
        }
      }
    }

    ground.updateVerticesData(VertexBuffer.PositionKind, positions);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals);
    ground.setVerticesData(VertexBuffer.ColorKind, colors);
  }

  const grassTex = new DynamicTexture(
    "grassTex",
    { width: 256, height: 256 },
    scene,
    true
  );
  const ctx = grassTex.getContext();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const hx = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453);
    const hy = Math.abs(Math.cos((i + 1) * 78.233) * 23421.631);
    const x = Math.floor((hx - Math.floor(hx)) * 252);
    const y = Math.floor((hy - Math.floor(hy)) * 252);
    ctx.fillStyle = i % 2 === 0 ? "#fafafa" : "#f3f4f6";
    ctx.fillRect(x, y, 4, 4);
  }
  grassTex.update();
  grassTex.uScale = 32;
  grassTex.vScale = 32;

  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseTexture = grassTex;
  groundMat.specularColor = new Color3(0.05, 0.06, 0.05);
  ground.material = groundMat;

  // Tropical Atoll Biome: Surround the island with a translucent turquoise ocean water plane & shoreline ripples
  if (biome === "TROPICAL_ATOLL") {
    const oceanTex = new DynamicTexture(
      "tropicalOceanTex",
      { width: 256, height: 256 },
      scene,
      true
    );
    const oCtx = oceanTex.getContext() as unknown as CanvasRenderingContext2D;
    oCtx.fillStyle = "#0891b2";
    oCtx.fillRect(0, 0, 256, 256);
    for (let w = 0; w < 140; w++) {
      const hx = Math.abs(Math.sin((w + 3) * 19.17) * 43758.5453);
      const hy = Math.abs(Math.cos((w + 3) * 47.83) * 23421.631);
      const x = Math.floor((hx - Math.floor(hx)) * 230);
      const y = Math.floor((hy - Math.floor(hy)) * 248);
      oCtx.fillStyle =
        w % 3 === 0 ? "rgba(165, 243, 252, 0.42)" : "rgba(34, 211, 238, 0.35)";
      oCtx.fillRect(x, y, 22, 3);
    }
    oceanTex.update();
    oceanTex.uScale = 28;
    oceanTex.vScale = 28;

    const oceanMat = new StandardMaterial("tropicalOceanMat", scene);
    oceanMat.diffuseTexture = oceanTex;
    oceanMat.emissiveColor = new Color3(0.04, 0.36, 0.48);
    oceanMat.specularColor = new Color3(0.9, 0.96, 1.0);
    oceanMat.specularPower = 96;
    oceanMat.alpha = 0.84;

    const oceanPlane = MeshBuilder.CreateGround(
      "tropical_ocean_water",
      {
        width: span * 1.25,
        height: span * 1.25,
        subdivisions: 2,
      },
      scene
    );
    oceanPlane.parent = parent;
    oceanPlane.position = new Vector3(centerX, minRoadY - 1.15, centerZ);
    oceanPlane.material = oceanMat;
    oceanPlane.isPickable = false;
  }

  return ground;
}

function populateEnvironmentProps(
  scene: Scene,
  parent: TransformNode,
  samples: TrackSample[],
  curbOuterWidth: number,
  wallHalfWidth: number,
  terrainHillScale: number,
  terrainMods: TerrainSculptMod[],
  sceneryProps: PlacedSceneryProp[],
  queryClosestTrackPoint: (worldPos: Vector3) => ClosestTrackQuery,
  shadowGenerator: ShadowGenerator,
  biome: TrackBiome = "ALPINE_SUBURBS"
): void {
  const trunkMat = new StandardMaterial("treeTrunkMat", scene);
  trunkMat.diffuseColor = new Color3(0.42, 0.26, 0.14);
  trunkMat.specularColor = Color3.Black();

  const palmTrunkMat = new StandardMaterial("palmTrunkMat", scene);
  palmTrunkMat.diffuseColor = new Color3(0.56, 0.4, 0.24);
  palmTrunkMat.specularColor = Color3.Black();

  const palmFrondMat = new StandardMaterial("palmFrondMat", scene);
  palmFrondMat.diffuseColor = new Color3(0.18, 0.68, 0.28);
  palmFrondMat.specularColor = new Color3(0.08, 0.12, 0.08);

  const coconutMat = new StandardMaterial("coconutMat", scene);
  coconutMat.diffuseColor = new Color3(0.34, 0.2, 0.1);
  coconutMat.specularColor = Color3.Black();

  const cabanaThatchMat = new StandardMaterial("cabanaThatchMat", scene);
  cabanaThatchMat.diffuseColor = new Color3(0.92, 0.76, 0.38);

  const cabanaCoralMat = new StandardMaterial("cabanaCoralMat", scene);
  cabanaCoralMat.diffuseColor = new Color3(0.06, 0.74, 0.86);

  const pineDarkMat = new StandardMaterial("pineDarkMat", scene);
  pineDarkMat.diffuseColor = new Color3(0.14, 0.45, 0.22);
  pineDarkMat.specularColor = Color3.Black();

  const pineLightMat = new StandardMaterial("pineLightMat", scene);
  pineLightMat.diffuseColor = new Color3(0.22, 0.58, 0.26);
  pineLightMat.specularColor = Color3.Black();

  const oakLeafMat = new StandardMaterial("oakLeafMat", scene);
  oakLeafMat.diffuseColor = new Color3(0.28, 0.64, 0.24);
  oakLeafMat.specularColor = Color3.Black();

  const boulderMat = new StandardMaterial("boulderMat", scene);
  boulderMat.diffuseColor =
    biome === "SUNSET_CANYON"
      ? new Color3(0.78, 0.38, 0.22)
      : biome === "TROPICAL_ATOLL"
      ? new Color3(0.62, 0.58, 0.52)
      : new Color3(0.52, 0.55, 0.6);
  boulderMat.specularColor = new Color3(0.1, 0.1, 0.1);

  const wallPostMat = new StandardMaterial("wallPostMat", scene);
  wallPostMat.diffuseColor =
    biome === "TROPICAL_ATOLL"
      ? new Color3(0.06, 0.78, 0.9)
      : new Color3(0.95, 0.52, 0.12);
  wallPostMat.specularColor = new Color3(0.1, 0.1, 0.1);

  const houseWallMat = new StandardMaterial("houseWallMat", scene);
  houseWallMat.diffuseColor = new Color3(0.94, 0.9, 0.78);

  const houseRoofMat = new StandardMaterial("houseRoofMat", scene);
  houseRoofMat.diffuseColor = new Color3(0.75, 0.24, 0.2);

  const windowGlowMat = new StandardMaterial("windowGlowMat", scene);
  windowGlowMat.diffuseColor = new Color3(1.0, 0.9, 0.5);
  windowGlowMat.emissiveColor = new Color3(0.85, 0.7, 0.25);

  const standColors = [
    new Color3(0.2, 0.45, 0.85),
    new Color3(0.9, 0.25, 0.25),
    new Color3(0.95, 0.75, 0.15),
  ];
  const standBaseMat = new StandardMaterial("grandstandBaseMat", scene);
  standBaseMat.diffuseColor = new Color3(0.28, 0.32, 0.38);

  const tierMats = standColors.map((c, idx) => {
    const m = new StandardMaterial(`tierMat_${idx}`, scene);
    m.diffuseColor = c;
    return m;
  });

  // Perimeter guide bollards at localWallHalfWidth (automatically carved outward around shortcuts & split medians)
  for (let i = 0; i < samples.length; i += 8) {
    const s = samples[i];
    const localWall = s.localWallHalfWidth || wallHalfWidth;
    for (const side of [-1, 1]) {
      const pos = s.position.add(s.binormal.scale(side * localWall));
      const post = MeshBuilder.CreateCylinder(
        `wallPost_${i}_${side}`,
        { height: 1.3, diameterTop: 0.45, diameterBottom: 0.6, tessellation: 8 },
        scene
      );
      post.parent = parent;
      post.position = new Vector3(pos.x, s.position.y + 0.55, pos.z);
      post.material = wallPostMat;
      post.isPickable = false;
    }
  }

  // Instantiate all Scenery Prefabs from trackDef.sceneryProps sitting on the exact 3D sculpted terrain surface
  sceneryProps.forEach((prop, idx) => {
    const q = queryClosestTrackPoint(new Vector3(prop.x, 0, prop.z));
    const { y: terrainY, dist } = evaluateTerrainHeightAt(
      prop.x,
      prop.z,
      queryClosestTrackPoint,
      curbOuterWidth,
      wallHalfWidth,
      terrainHillScale,
      terrainMods,
      biome
    );
    // Safety guard: never spawn scenery on the asphalt road, rumble curb, or inside carved shortcut/split corridors!
    const minSafePropDist = Math.max(
      (q.localCurbWidth || curbOuterWidth) + 2.5,
      (q.localWallHalfWidth || wallHalfWidth) - 8.5
    );
    if (dist < minSafePropDist) return;

    const scale = prop.scale || 1.0;
    const baseY = terrainY - 0.08;
    const rootNode = new TransformNode(`scenery_${idx}`, scene);
    rootNode.parent = parent;
    rootNode.position = new Vector3(prop.x, baseY, prop.z);
    rootNode.rotation.y = prop.rotationY || 0;

    if (prop.type === "PINE_TREE") {
      const trunk = MeshBuilder.CreateCylinder(
        `pineTrunk_${idx}`,
        { height: 2.2 * scale, diameter: 0.7 * scale, tessellation: 8 },
        scene
      );
      trunk.parent = rootNode;
      trunk.position.y = 1.1 * scale;
      trunk.material = trunkMat;
      trunk.isPickable = false;

      const cone1 = MeshBuilder.CreateCylinder(
        `pineCone1_${idx}`,
        {
          height: 3.5 * scale,
          diameterTop: 0,
          diameterBottom: 3.4 * scale,
          tessellation: 9,
        },
        scene
      );
      cone1.parent = rootNode;
      cone1.position.y = 3.1 * scale;
      cone1.material = pineDarkMat;
      cone1.isPickable = false;

      const cone2 = MeshBuilder.CreateCylinder(
        `pineCone2_${idx}`,
        {
          height: 2.9 * scale,
          diameterTop: 0,
          diameterBottom: 2.5 * scale,
          tessellation: 9,
        },
        scene
      );
      cone2.parent = rootNode;
      cone2.position.y = 4.9 * scale;
      cone2.material = pineLightMat;
      cone2.isPickable = false;

      if (idx % 10 === 0) {
        shadowGenerator.addShadowCaster(cone1);
      }
    } else if (prop.type === "OAK_TREE") {
      const trunk = MeshBuilder.CreateCylinder(
        `oakTrunk_${idx}`,
        { height: 2.6 * scale, diameter: 0.85 * scale, tessellation: 10 },
        scene
      );
      trunk.parent = rootNode;
      trunk.position.y = 1.3 * scale;
      trunk.material = trunkMat;
      trunk.isPickable = false;

      const crownMain = MeshBuilder.CreateSphere(
        `oakCrown_${idx}`,
        { diameter: 4.2 * scale, segments: 10 },
        scene
      );
      crownMain.parent = rootNode;
      crownMain.position.y = 3.8 * scale;
      crownMain.material = oakLeafMat;
      crownMain.isPickable = false;

      const crownSide = MeshBuilder.CreateSphere(
        `oakCrownSide_${idx}`,
        { diameter: 3.0 * scale, segments: 8 },
        scene
      );
      crownSide.parent = rootNode;
      crownSide.position = new Vector3(1.1 * scale, 3.3 * scale, 0.6 * scale);
      crownSide.material = pineLightMat;
      crownSide.isPickable = false;
    } else if (prop.type === "PALM_TREE") {
      // Curved segmented coconut palm trunk + radial arching palm fronds + coconuts
      const segments = 4;
      let curX = 0;
      let curY = 0;
      for (let seg = 0; seg < segments; seg++) {
        const segH = 1.45 * scale;
        const lean = (seg + 0.5) * 0.11;
        const dBottom = (0.78 - seg * 0.1) * scale;
        const dTop = (0.68 - seg * 0.1) * scale;
        const segMesh = MeshBuilder.CreateCylinder(
          `palmSeg_${idx}_${seg}`,
          {
            height: segH,
            diameterBottom: dBottom,
            diameterTop: dTop,
            tessellation: 8,
          },
          scene
        );
        segMesh.parent = rootNode;
        segMesh.position = new Vector3(
          curX + Math.sin(lean) * segH * 0.5,
          curY + Math.cos(lean) * segH * 0.5,
          0
        );
        segMesh.rotation.z = -lean;
        segMesh.material = palmTrunkMat;
        segMesh.isPickable = false;
        curX += Math.sin(lean) * segH;
        curY += Math.cos(lean) * segH;
      }

      const crownNode = new TransformNode(`palmCrown_${idx}`, scene);
      crownNode.parent = rootNode;
      crownNode.position = new Vector3(curX, curY, 0);

      for (let f = 0; f < 6; f++) {
        const angle = (f * Math.PI * 2) / 6;
        const frond = MeshBuilder.CreateBox(
          `palmFrond_${idx}_${f}`,
          {
            width: 0.72 * scale,
            height: 0.14 * scale,
            depth: 3.4 * scale,
          },
          scene
        );
        frond.parent = crownNode;
        frond.position = new Vector3(
          Math.sin(angle) * 1.45 * scale,
          -0.18 * scale,
          Math.cos(angle) * 1.45 * scale
        );
        frond.rotation = new Vector3(0.32, angle, 0);
        frond.material = palmFrondMat;
        frond.isPickable = false;
        if (idx % 10 === 0 && f === 0) {
          shadowGenerator.addShadowCaster(frond);
        }
      }

      for (let c = 0; c < 3; c++) {
        const ca = (c * Math.PI * 2) / 3;
        const nut = MeshBuilder.CreateSphere(
          `coconut_${idx}_${c}`,
          { diameter: 0.52 * scale, segments: 6 },
          scene
        );
        nut.parent = crownNode;
        nut.position = new Vector3(
          Math.sin(ca) * 0.38 * scale,
          -0.25 * scale,
          Math.cos(ca) * 0.38 * scale
        );
        nut.material = coconutMat;
        nut.isPickable = false;
      }
    } else if (prop.type === "BEACH_CABANA") {
      // Coastal beach cabana hut with bamboo corner posts, striped tiki thatch roof & surfboard deck
      const deck = MeshBuilder.CreateBox(
        `cabanaDeck_${idx}`,
        { width: 6.4 * scale, height: 0.35 * scale, depth: 5.4 * scale },
        scene
      );
      deck.parent = rootNode;
      deck.position.y = 0.18 * scale;
      deck.material = palmTrunkMat;
      deck.isPickable = false;

      for (const px of [-2.6, 2.6]) {
        for (const pz of [-2.1, 2.1]) {
          const post = MeshBuilder.CreateCylinder(
            `cabanaPost_${idx}_${px}_${pz}`,
            { height: 3.4 * scale, diameter: 0.32 * scale, tessellation: 8 },
            scene
          );
          post.parent = rootNode;
          post.position = new Vector3(px * scale, 1.85 * scale, pz * scale);
          post.material = palmTrunkMat;
          post.isPickable = false;
        }
      }

      const counter = MeshBuilder.CreateBox(
        `cabanaCounter_${idx}`,
        { width: 4.6 * scale, height: 1.15 * scale, depth: 1.1 * scale },
        scene
      );
      counter.parent = rootNode;
      counter.position = new Vector3(0, 0.9 * scale, -1.4 * scale);
      counter.material = cabanaCoralMat;
      counter.isPickable = false;

      const thatchRoof = MeshBuilder.CreateCylinder(
        `cabanaRoof_${idx}`,
        {
          height: 2.4 * scale,
          diameterTop: 0.4 * scale,
          diameterBottom: 8.2 * scale,
          tessellation: 6,
        },
        scene
      );
      thatchRoof.parent = rootNode;
      thatchRoof.position.y = 4.5 * scale;
      thatchRoof.material = cabanaThatchMat;
      thatchRoof.convertToFlatShadedMesh();
      thatchRoof.isPickable = false;
    } else if (prop.type === "BOULDER") {
      const boulder = MeshBuilder.CreatePolyhedron(
        `boulder_${idx}`,
        { type: 2, size: 1.5 * scale },
        scene
      );
      boulder.parent = rootNode;
      boulder.position.y = 0.8 * scale;
      boulder.material = boulderMat;
      boulder.convertToFlatShadedMesh();
      boulder.isPickable = false;
    } else if (prop.type === "GRANDSTAND") {
      for (let tier = 0; tier < 3; tier++) {
        const bench = MeshBuilder.CreateBox(
          `bench_${idx}_${tier}`,
          {
            width: 22 * scale,
            height: (1.4 + tier * 1.2) * scale,
            depth: 2.2 * scale,
          },
          scene
        );
        bench.parent = rootNode;
        bench.position = new Vector3(
          0,
          ((1.4 + tier * 1.2) * 0.5) * scale,
          tier * 2.3 * scale
        );
        bench.material = tierMats[tier % tierMats.length];
        bench.isPickable = false;
      }
      const canopy = MeshBuilder.CreateBox(
        `canopy_${idx}`,
        { width: 23 * scale, height: 0.6 * scale, depth: 7.5 * scale },
        scene
      );
      canopy.parent = rootNode;
      canopy.position = new Vector3(0, 6.6 * scale, 2.2 * scale);
      canopy.rotation.x = -0.15;
      canopy.material = standBaseMat;
      canopy.isPickable = false;
    } else if (prop.type === "SUBURBAN_HOUSE") {
      const body = MeshBuilder.CreateBox(
        `houseBody_${idx}`,
        { width: 8.5 * scale, height: 5.2 * scale, depth: 7.0 * scale },
        scene
      );
      body.parent = rootNode;
      body.position.y = 2.6 * scale;
      body.material = houseWallMat;
      body.isPickable = false;

      const roof = MeshBuilder.CreateCylinder(
        `houseRoof_${idx}`,
        {
          height: 9.2 * scale,
          diameter: 8.4 * scale,
          tessellation: 3,
        },
        scene
      );
      roof.parent = rootNode;
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 6.4 * scale;
      roof.material = houseRoofMat;
      roof.convertToFlatShadedMesh();
      roof.isPickable = false;

      for (const wx of [-2.2, 2.2]) {
        const win = MeshBuilder.CreateBox(
          `houseWin_${idx}_${wx}`,
          { width: 1.5 * scale, height: 1.4 * scale, depth: 0.2 },
          scene
        );
        win.parent = rootNode;
        win.position = new Vector3(wx * scale, 3.0 * scale, -3.52 * scale);
        win.material = windowGlowMat;
        win.isPickable = false;
      }
    } else if (prop.type === "LAMP_POST") {
      const pole = MeshBuilder.CreateCylinder(
        `lampPole_${idx}`,
        { height: 6.5 * scale, diameter: 0.28 * scale, tessellation: 10 },
        scene
      );
      pole.parent = rootNode;
      pole.position.y = 3.25 * scale;
      pole.material = standBaseMat;
      pole.isPickable = false;

      const bulb = MeshBuilder.CreateSphere(
        `lampBulb_${idx}`,
        { diameter: 0.9 * scale, segments: 10 },
        scene
      );
      bulb.parent = rootNode;
      bulb.position = new Vector3(0, 6.6 * scale, 0);
      bulb.material = windowGlowMat;
      bulb.isPickable = false;
    }
  });
}

function computeMiniMapSvg(samples: TrackSample[]): {
  svgPath: string;
  viewBox: string;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const s of samples) {
    if (s.position.x < minX) minX = s.position.x;
    if (s.position.x > maxX) maxX = s.position.x;
    if (s.position.z < minZ) minZ = s.position.z;
    if (s.position.z > maxZ) maxZ = s.position.z;
  }

  const pad = 28;
  const vbX = Math.floor(minX - pad);
  const vbY = Math.floor(-maxZ - pad);
  const vbW = Math.ceil(maxX - minX + pad * 2);
  const vbH = Math.ceil(maxZ - minZ + pad * 2);

  const coords: string[] = [];
  for (let i = 0; i < samples.length; i += 2) {
    const p = samples[i].position;
    const x = p.x.toFixed(1);
    const y = (-p.z).toFixed(1);
    coords.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
  }
  coords.push("Z");

  return {
    svgPath: coords.join(" "),
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
  };
}
