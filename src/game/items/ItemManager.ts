import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { PowerUpType } from "@/src/types/game";
import { BuiltTrack } from "@/src/game/world/TrackBuilder";
import { KartController } from "@/src/game/physics/KartController";
import { POWER_UP_CATALOG } from "@/src/game/data/roster";
import { globalAiBrain } from "@/src/game/ai/AiBrainTrainer";

interface ItemBoxInstance {
  id: string;
  mesh: Mesh;
  ringMesh: Mesh;
  basePosition: Vector3;
  respawnTimer: number;
  phaseOffset: number;
}

interface ActiveProjectile {
  id: string;
  type: "PULSE_SEEKER" | "RICOCHET_DISC" | "LIL_SAUCER";
  ownerId: string;
  targetRacerId: string | null;
  root: TransformNode;
  coreMesh: Mesh;
  ringMesh: Mesh;
  position: Vector3;
  velocity: Vector3;
  splineT: number;
  bouncesRemaining: number;
  lifeTimer: number;
}

interface DeployedCryoMine {
  id: string;
  ownerId: string;
  root: TransformNode;
  position: Vector3;
  armTimer: number;
  lifeTimer: number;
}

interface DeployedGlitchPrism {
  id: string;
  ownerId: string;
  root: TransformNode;
  prismMesh: Mesh;
  ringMesh: Mesh;
  basePosition: Vector3;
  armTimer: number;
  lifeTimer: number;
  phaseOffset: number;
}

interface ActiveEmpWaveRing {
  mesh: Mesh;
  lifeTimer: number;
  maxRadius: number;
}

interface OrbitalShieldRig {
  root: TransformNode;
  droneMeshes: Mesh[];
  orbitAngle: number;
}

interface TripleNitroRig {
  root: TransformNode;
  canisterMeshes: Mesh[];
  orbitAngle: number;
}

interface TripleCryoMineRig {
  root: TransformNode;
  mineNodes: TransformNode[];
  bobPhase: number;
}

export class ItemManager {
  private readonly scene: Scene;
  private readonly track: BuiltTrack;
  private readonly root: TransformNode;

  private readonly itemBoxes: ItemBoxInstance[] = [];
  private readonly projectiles: ActiveProjectile[] = [];
  private readonly mines: DeployedCryoMine[] = [];
  private readonly glitchPrisms: DeployedGlitchPrism[] = [];
  private readonly empWaves: ActiveEmpWaveRing[] = [];
  private readonly novaOverdriveCores = new Map<string, Mesh>();
  private readonly warpAutopilotCanopies = new Map<string, Mesh>();
  private readonly orbitalShieldRigs = new Map<string, OrbitalShieldRig>();
  private readonly tripleSeekerRigs = new Map<string, OrbitalShieldRig>();
  private readonly tripleNitroRigs = new Map<string, TripleNitroRig>();
  private readonly tripleCryoMineRigs = new Map<string, TripleCryoMineRig>();
  private readonly phaseCloakShells = new Map<string, Mesh>();

  private elapsedSec = 0;
  private nextEntityId = 1;

  // Shared procedural materials
  private readonly itemBoxMat: StandardMaterial;
  private readonly itemRingMat: StandardMaterial;
  private readonly seekerMat: StandardMaterial;
  private readonly discMat: StandardMaterial;
  private readonly mineYellowMat: StandardMaterial;
  private readonly mineBlackMat: StandardMaterial;
  private readonly novaGoldMat: StandardMaterial;
  private readonly warpShuttleMat: StandardMaterial;
  private readonly oilSquallRingMat: StandardMaterial;
  private readonly saucerChromeMat: StandardMaterial;
  private readonly saucerDomeFaceMat: StandardMaterial;
  private readonly saucerBeamMat: StandardMaterial;
  private readonly glitchPrismMat: StandardMaterial;
  private readonly glitchRingMat: StandardMaterial;
  private readonly shieldDroneMat: StandardMaterial;
  private readonly phaseCloakMat: StandardMaterial;
  private readonly empRingMat: StandardMaterial;
  private readonly nitroCanisterMat: StandardMaterial;

  constructor(scene: Scene, track: BuiltTrack) {
    this.scene = scene;
    this.track = track;
    this.root = new TransformNode("itemManagerRoot", scene);

    this.itemBoxMat = new StandardMaterial("itemBoxMat", scene);
    this.itemBoxMat.diffuseColor = new Color3(0.35, 0.85, 1.0);
    this.itemBoxMat.emissiveColor = new Color3(0.28, 0.55, 0.95);
    this.itemBoxMat.specularColor = new Color3(1, 1, 1);
    this.itemBoxMat.alpha = 0.78;

    this.itemRingMat = new StandardMaterial("itemRingMat", scene);
    this.itemRingMat.diffuseColor = new Color3(1.0, 0.85, 0.25);
    this.itemRingMat.emissiveColor = new Color3(0.85, 0.55, 0.15);

    this.seekerMat = new StandardMaterial("seekerMat", scene);
    this.seekerMat.diffuseColor = new Color3(0.95, 0.15, 0.2);
    this.seekerMat.emissiveColor = new Color3(0.65, 0.08, 0.12);

    this.discMat = new StandardMaterial("discMat", scene);
    this.discMat.diffuseColor = new Color3(0.08, 0.88, 0.55);
    this.discMat.emissiveColor = new Color3(0.05, 0.58, 0.35);

    this.mineYellowMat = new StandardMaterial("mineYellowMat", scene);
    this.mineYellowMat.diffuseColor = new Color3(0.98, 0.82, 0.08);
    this.mineYellowMat.emissiveColor = new Color3(0.45, 0.35, 0.02);

    this.mineBlackMat = new StandardMaterial("mineBlackMat", scene);
    this.mineBlackMat.diffuseColor = new Color3(0.12, 0.12, 0.14);

    this.novaGoldMat = new StandardMaterial("novaGoldMat", scene);
    this.novaGoldMat.diffuseColor = new Color3(1.0, 0.88, 0.2);
    this.novaGoldMat.emissiveColor = new Color3(0.85, 0.68, 0.1);

    this.warpShuttleMat = new StandardMaterial("warpShuttleMat", scene);
    this.warpShuttleMat.diffuseColor = new Color3(0.15, 0.88, 1.0);
    this.warpShuttleMat.emissiveColor = new Color3(0.1, 0.65, 0.92);
    this.warpShuttleMat.specularColor = new Color3(1.0, 1.0, 1.0);
    this.warpShuttleMat.alpha = 0.52;
    this.warpShuttleMat.backFaceCulling = false;

    this.oilSquallRingMat = new StandardMaterial("oilSquallRingMat", scene);
    this.oilSquallRingMat.diffuseColor = new Color3(0.55, 0.22, 0.85);
    this.oilSquallRingMat.emissiveColor = new Color3(0.38, 0.12, 0.65);
    this.oilSquallRingMat.alpha = 0.78;

    // Quirky retro UFO saucer materials + procedural face texture
    this.saucerChromeMat = new StandardMaterial("saucerChromeMat", scene);
    this.saucerChromeMat.diffuseColor = new Color3(0.82, 0.78, 0.96);
    this.saucerChromeMat.emissiveColor = new Color3(0.28, 0.22, 0.45);
    this.saucerChromeMat.specularColor = new Color3(1.0, 1.0, 1.0);
    this.saucerChromeMat.specularPower = 64;

    this.saucerDomeFaceMat = this.createSaucerFaceMaterial(scene);

    this.saucerBeamMat = new StandardMaterial("saucerBeamMat", scene);
    this.saucerBeamMat.diffuseColor = new Color3(0.22, 0.92, 1.0);
    this.saucerBeamMat.emissiveColor = new Color3(0.18, 0.75, 0.95);

    // Counterfeit Prank Glitch Prism materials
    this.glitchPrismMat = new StandardMaterial("glitchPrismMat", scene);
    this.glitchPrismMat.diffuseColor = new Color3(0.98, 0.25, 0.55);
    this.glitchPrismMat.emissiveColor = new Color3(0.75, 0.15, 0.45);
    this.glitchPrismMat.specularColor = new Color3(1, 1, 1);
    this.glitchPrismMat.alpha = 0.82;

    this.glitchRingMat = new StandardMaterial("glitchRingMat", scene);
    this.glitchRingMat.diffuseColor = new Color3(0.95, 0.3, 0.85);
    this.glitchRingMat.emissiveColor = new Color3(0.75, 0.12, 0.65);

    // Tri-Drone Orbit Shield, Phantom Phase Cloak, EMP Shockwave & Triple Nitro materials
    this.shieldDroneMat = new StandardMaterial("shieldDroneMat", scene);
    this.shieldDroneMat.diffuseColor = new Color3(0.08, 0.92, 0.78);
    this.shieldDroneMat.emissiveColor = new Color3(0.06, 0.68, 0.58);

    this.phaseCloakMat = new StandardMaterial("phaseCloakMat", scene);
    this.phaseCloakMat.diffuseColor = new Color3(0.55, 0.52, 0.98);
    this.phaseCloakMat.emissiveColor = new Color3(0.38, 0.32, 0.88);
    this.phaseCloakMat.alpha = 0.34;
    this.phaseCloakMat.backFaceCulling = false;

    this.empRingMat = new StandardMaterial("empRingMat", scene);
    this.empRingMat.diffuseColor = new Color3(0.25, 0.88, 1.0);
    this.empRingMat.emissiveColor = new Color3(0.35, 0.55, 1.0);
    this.empRingMat.alpha = 0.72;

    this.nitroCanisterMat = new StandardMaterial("nitroCanisterMat", scene);
    this.nitroCanisterMat.diffuseColor = new Color3(1.0, 0.52, 0.12);
    this.nitroCanisterMat.emissiveColor = new Color3(0.85, 0.32, 0.05);

    this.spawnItemBoxRows();
  }

  private createSaucerFaceMaterial(scene: Scene): StandardMaterial {
    const tex = new DynamicTexture(
      "saucerFaceTex",
      { width: 256, height: 128 },
      scene,
      false
    );
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

    // Retro pastel-lavender dome base
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, "#f5d0fe");
    grad.addColorStop(0.55, "#e9d5ff");
    grad.addColorStop(1.0, "#c084fc");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Draw quirky retro UFO face on both +Z (x=64) and -Z (x=192)
    // so both the chase camera behind the saucer and racers ahead see the funny face!
    const portholeXs = [8, 120, 136, 248];
    for (const px of portholeXs) {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(px, 66, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1e1b4b";
      ctx.stroke();
    }

    const drawSaucerFaceAt = (centerX: number) => {
      // Rosy cartoon cheeks
      ctx.fillStyle = "#fb7185";
      ctx.beginPath();
      ctx.ellipse(centerX - 30, 76, 9.5, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(centerX + 30, 76, 9.5, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Big goofy staring eyes (asymmetrical pupils for quirky "Lil' Saucer" charm)
      const drawQuirkyEye = (
        cx: number,
        cy: number,
        pupilDx: number,
        pupilDy: number
      ) => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 12, 14.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = "#1e1b4b";
        ctx.stroke();

        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx + pupilDx, cy + pupilDy, 5.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx + pupilDx - 2, cy + pupilDy - 2, 2.0, 0, Math.PI * 2);
        ctx.fill();
      };

      drawQuirkyEye(centerX - 18, 56, 2, -1);
      drawQuirkyEye(centerX + 18, 56, -2, 1);

      // Quirky raised eyebrows
      ctx.strokeStyle = "#1e1b4b";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(centerX - 30, 38);
      ctx.quadraticCurveTo(centerX - 18, 31, centerX - 7, 39);
      ctx.moveTo(centerX + 7, 39);
      ctx.quadraticCurveTo(centerX + 18, 30, centerX + 30, 38);
      ctx.stroke();

      // Wobbly cheeky UFO mouth
      ctx.beginPath();
      ctx.moveTo(centerX - 16, 82);
      ctx.bezierCurveTo(centerX - 6, 91, centerX + 2, 76, centerX + 9, 86);
      ctx.quadraticCurveTo(centerX + 15, 91, centerX + 21, 80);
      ctx.stroke();
    };

    drawSaucerFaceAt(64);
    drawSaucerFaceAt(192);

    tex.update();

    const mat = new StandardMaterial("saucerDomeFaceMat", scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.45, 0.38, 0.56);
    mat.specularColor = new Color3(0.85, 0.85, 0.95);
    mat.specularPower = 48;
    return mat;
  }

  private spawnItemBoxRows(): void {
    const lateralOffsets = [-8.4, -2.8, 2.8, 8.4];

    this.track.itemBoxRowIndices.forEach((sampleIdx, rowIdx) => {
      const sample = this.track.samples[sampleIdx % this.track.samples.length];
      lateralOffsets.forEach((lat, colIdx) => {
        const basePos = sample.position
          .add(sample.binormal.scale(lat))
          .add(new Vector3(0, 1.45, 0));

        const prism = MeshBuilder.CreatePolyhedron(
          `itemBox_${rowIdx}_${colIdx}`,
          { type: 1, size: 0.85 },
          this.scene
        );
        prism.parent = this.root;
        prism.position.copyFrom(basePos);
        prism.convertToFlatShadedMesh();
        prism.material = this.itemBoxMat;
        prism.isPickable = false;

        const ring = MeshBuilder.CreateTorus(
          `itemBoxRing_${rowIdx}_${colIdx}`,
          { diameter: 1.95, thickness: 0.1, tessellation: 16 },
          this.scene
        );
        ring.parent = prism;
        ring.rotation.x = Math.PI / 3;
        ring.material = this.itemRingMat;
        ring.isPickable = false;

        this.itemBoxes.push({
          id: `box_${rowIdx}_${colIdx}`,
          mesh: prism,
          ringMesh: ring,
          basePosition: basePos,
          respawnTimer: 0,
          phaseOffset: (rowIdx * 4 + colIdx) * 0.65,
        });
      });
    });
  }

  public getRacersAheadOf(
    caster: KartController,
    allRacers: KartController[]
  ): KartController[] {
    return allRacers.filter(
      (r) =>
        r.racerId !== caster.racerId &&
        (r.rank < caster.rank ||
          r.totalProgressDistance > caster.totalProgressDistance + 0.5)
    );
  }

  public canRacerAcquireLilSaucer(
    racer: KartController,
    allRacers: KartController[]
  ): boolean {
    if (racer.rank <= 1) return false;
    return this.getRacersAheadOf(racer, allRacers).length > 0;
  }

  public rollWeightedPowerUp(
    rank: number,
    racer?: KartController,
    allRacers?: KartController[]
  ): PowerUpType {
    const r = Math.random();
    const canGetSaucer =
      rank > 1 &&
      (racer && allRacers
        ? this.canRacerAcquireLilSaucer(racer, allRacers)
        : true);

    if (rank === 1) {
      if (r < 0.22) return "CRYO_MINE";
      if (r < 0.36) return "TRIPLE_CRYO_MINE";
      if (r < 0.54) return "GLITCH_PRISM";
      if (r < 0.74) return "RICOCHET_DISC";
      if (r < 0.86) return "NITRO_CORE";
      if (r < 0.96) return "ORBITAL_SHIELD";
      return "PULSE_SEEKER";
    }
    if (rank === 2) {
      if (canGetSaucer && r < 0.06) return "LIL_SAUCER";
      if (r < 0.20) return "PULSE_SEEKER";
      if (r < 0.32) return "TRIPLE_SEEKER";
      if (r < 0.44) return "NITRO_CORE";
      if (r < 0.54) return "TRIPLE_NITRO";
      if (r < 0.60) return "GOLDEN_OVERCLOCK";
      if (r < 0.70) return "RICOCHET_DISC";
      if (r < 0.79) return "ORBITAL_SHIELD";
      if (r < 0.86) return "TRIPLE_CRYO_MINE";
      if (r < 0.92) return "OIL_SQUALL";
      if (r < 0.97) return "PHASE_CLOAK";
      return "NOVA_OVERDRIVE";
    }
    if (rank === 3) {
      if (canGetSaucer && r < 0.14) return "LIL_SAUCER";
      if (r < 0.28) return "TRIPLE_SEEKER";
      if (r < 0.40) return "TRIPLE_NITRO";
      if (r < 0.52) return "GOLDEN_OVERCLOCK";
      if (r < 0.60) return "WARP_AUTOPILOT";
      if (r < 0.69) return "OIL_SQUALL";
      if (r < 0.79) return "PULSE_SEEKER";
      if (r < 0.87) return "ORBITAL_SHIELD";
      if (r < 0.92) return "PHASE_CLOAK";
      if (r < 0.97) return "NOVA_OVERDRIVE";
      return "EMP_SHOCKWAVE";
    }
    // Rank 4+ (Underdog comeback arsenal)
    if (canGetSaucer && r < 0.22) return "LIL_SAUCER";
    if (r < 0.38) return "WARP_AUTOPILOT";
    if (r < 0.53) return "GOLDEN_OVERCLOCK";
    if (r < 0.65) return "TRIPLE_SEEKER";
    if (r < 0.75) return "TRIPLE_NITRO";
    if (r < 0.85) return "NOVA_OVERDRIVE";
    if (r < 0.92) return "EMP_SHOCKWAVE";
    if (r < 0.96) return "OIL_SQUALL";
    return "PHASE_CLOAK";
  }

  public activatePowerUp(
    caster: KartController,
    item: PowerUpType,
    allRacers: KartController[],
    onBannerEvent?: (message: string) => void
  ): void {
    const meta = POWER_UP_CATALOG[item];
    const isOffRoadOrShortcut =
      caster.closestTrack.horizontalDistance > this.track.curbWidth - 0.5 ||
      caster.spinOutTimer > 0;

    if (item === "NITRO_CORE") {
      caster.activateNitroCore();
      globalAiBrain.recordItemUsed(caster.racerId, isOffRoadOrShortcut);
      onBannerEvent?.(`${caster.name} ignited ${meta.name} (+45% Boost)!`);
      return;
    }

    if (item === "TRIPLE_NITRO") {
      caster.activateNitroCore();
      globalAiBrain.recordItemUsed(caster.racerId, isOffRoadOrShortcut);
      const rem = caster.heldItemCharges;
      onBannerEvent?.(
        rem > 0
          ? `${caster.name} fired ${meta.name} (${rem}x left)!`
          : `${caster.name} fired final ${meta.name} cylinder!`
      );
      return;
    }

    if (item === "GOLDEN_OVERCLOCK") {
      const wasFirstActivation = caster.goldenOverclockTimer <= 0;
      if (wasFirstActivation) {
        caster.activateGoldenOverclock();
        onBannerEvent?.(
          `⚡ ${caster.name} ignited ${meta.name} (7.5s Unlimited Rapid Boost)!`
        );
      } else {
        caster.activateNitroCore();
      }
      globalAiBrain.recordItemUsed(caster.racerId, isOffRoadOrShortcut);
      return;
    }

    if (item === "WARP_AUTOPILOT") {
      caster.activateWarpAutopilot();
      this.ensureWarpAutopilotCanopy(caster);
      globalAiBrain.recordItemUsed(caster.racerId, true);
      onBannerEvent?.(
        `🚀 ${caster.name} engaged ${meta.name} (95 u/s Hyper-Shuttle)!`
      );
      return;
    }

    if (item === "TRIPLE_CRYO_MINE") {
      const currentCharges =
        caster.tripleCryoMineCharges > 0
          ? caster.tripleCryoMineCharges
          : Math.max(1, caster.heldItemCharges || 3);
      const nextCharges = Math.max(0, currentCharges - 1);
      caster.tripleCryoMineCharges = nextCharges;
      this.deployCryoMine(caster);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      if (caster.incomingThreatCount > 0) {
        globalAiBrain.recordDefensiveBlock(caster.racerId);
      }
      if (nextCharges > 0) {
        caster.heldItem = "TRIPLE_CRYO_MINE";
        caster.heldItemCharges = nextCharges;
        onBannerEvent?.(
          `${caster.name} dropped a Cryo Mine (${nextCharges}x left)!`
        );
      } else {
        caster.heldItem = null;
        caster.heldItemCharges = 0;
        onBannerEvent?.(`${caster.name} dropped final Cryo Mine!`);
      }
      return;
    }

    if (item === "OIL_SQUALL") {
      globalAiBrain.recordItemUsed(caster.racerId, false);
      this.triggerOilSquall(caster, allRacers, onBannerEvent);
      return;
    }

    if (item === "ORBITAL_SHIELD") {
      // Orbiting shield drones auto-deploy on roulette completion; each press of Use Item fires 1 Ricochet Disc forward
      const currentCharges =
        caster.orbitalShieldCharges > 0
          ? caster.orbitalShieldCharges
          : Math.max(1, caster.heldItemCharges || 3);
      const nextCharges = Math.max(0, currentCharges - 1);
      caster.orbitalShieldCharges = nextCharges;
      this.spawnRicochetDisc(caster, allRacers);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      if (nextCharges > 0) {
        caster.heldItem = "ORBITAL_SHIELD";
        caster.heldItemCharges = nextCharges;
        onBannerEvent?.(
          `${caster.name} launched an Orbiting Shield Drone (${nextCharges}x left)!`
        );
      } else {
        caster.heldItem = null;
        caster.heldItemCharges = 0;
        onBannerEvent?.(
          `${caster.name} launched final Orbiting Shield Drone!`
        );
      }
      return;
    }

    if (item === "TRIPLE_SEEKER") {
      // Orbiting homing seekers auto-deploy on roulette completion; each press of Use Item launches 1 homing Pulse Seeker
      const currentCharges =
        caster.tripleSeekerCharges > 0
          ? caster.tripleSeekerCharges
          : Math.max(1, caster.heldItemCharges || 3);
      const nextCharges = Math.max(0, currentCharges - 1);
      caster.tripleSeekerCharges = nextCharges;
      this.spawnPulseSeeker(caster, allRacers);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      if (nextCharges > 0) {
        caster.heldItem = "TRIPLE_SEEKER";
        caster.heldItemCharges = nextCharges;
        onBannerEvent?.(
          `${caster.name} launched a Homing Seeker Drone (${nextCharges}x left)!`
        );
      } else {
        caster.heldItem = null;
        caster.heldItemCharges = 0;
        onBannerEvent?.(
          `${caster.name} launched final Homing Seeker Drone!`
        );
      }
      return;
    }

    if (item === "PHASE_CLOAK") {
      caster.activatePhaseCloak();
      this.ensurePhaseCloakShell(caster);
      globalAiBrain.recordItemUsed(caster.racerId, isOffRoadOrShortcut);
      if (caster.incomingThreatCount > 0) {
        globalAiBrain.recordDefensiveBlock(caster.racerId);
      }

      // Steal a held item from a rival ahead (or any rival holding an item)
      const candidates = allRacers.filter(
        (r) =>
          r.racerId !== caster.racerId &&
          r.heldItem !== null &&
          r.heldItem !== "PHASE_CLOAK"
      );
      if (candidates.length > 0) {
        // Prefer the highest-ranked rival holding an item
        candidates.sort((a, b) => a.rank - b.rank);
        const victim = candidates[0];
        const stolen = victim.heldItem!;
        const stolenCharges = Math.max(1, victim.heldItemCharges || 1);
        victim.equipPowerUpImmediate(null);
        caster.equipPowerUpImmediate(stolen, stolenCharges);
        onBannerEvent?.(
          `${caster.name} phased into Cloak & stole ${victim.name}'s ${POWER_UP_CATALOG[stolen].name}!`
        );
      } else {
        // Fallback: synthesize a Nitro Core when no rival holds an item
        caster.equipPowerUpImmediate("NITRO_CORE", 1);
        onBannerEvent?.(
          `${caster.name} activated ${meta.name} (Ghost Phase + Syphoned Nitro)!`
        );
      }
      return;
    }

    if (item === "EMP_SHOCKWAVE") {
      globalAiBrain.recordItemUsed(caster.racerId, false);
      this.triggerEmpShockwave(caster, allRacers, onBannerEvent);
      return;
    }

    if (item === "NOVA_OVERDRIVE") {
      caster.activateNovaOverdrive();
      this.ensureNovaOverdriveCore(caster);
      globalAiBrain.recordItemUsed(caster.racerId, isOffRoadOrShortcut);
      onBannerEvent?.(
        `${caster.name} unleashed ${meta.name} (9,999 kg Invincibility)!`
      );
      return;
    }

    if (item === "CRYO_MINE") {
      this.deployCryoMine(caster);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      if (caster.incomingThreatCount > 0) {
        globalAiBrain.recordDefensiveBlock(caster.racerId);
      }
      onBannerEvent?.(`${caster.name} dropped a ${meta.name}!`);
      return;
    }

    if (item === "GLITCH_PRISM") {
      this.deployGlitchPrism(caster);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      if (caster.incomingThreatCount > 0) {
        globalAiBrain.recordDefensiveBlock(caster.racerId);
      }
      onBannerEvent?.(`${caster.name} planted a ${meta.name} decoy!`);
      return;
    }

    if (item === "RICOCHET_DISC") {
      this.spawnRicochetDisc(caster, allRacers);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      onBannerEvent?.(`${caster.name} fired a ${meta.name}!`);
      return;
    }

    if (item === "PULSE_SEEKER") {
      this.spawnPulseSeeker(caster, allRacers);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      onBannerEvent?.(`${caster.name} launched a homing ${meta.name}!`);
      return;
    }

    if (item === "LIL_SAUCER") {
      const target = this.spawnLilSaucer(caster, allRacers);
      globalAiBrain.recordItemUsed(caster.racerId, false);
      if (target) {
        onBannerEvent?.(
          `${caster.name}'s ${meta.name} UFO locked onto ${target.name}!`
        );
      } else {
        onBannerEvent?.(`${caster.name} launched a ${meta.name} UFO rocket!`);
      }
    }
  }

  public getActiveItemBoxPositions(): Vector3[] {
    const active: Vector3[] = [];
    for (let i = 0; i < this.itemBoxes.length; i++) {
      const box = this.itemBoxes[i];
      if (box.respawnTimer <= 0) {
        active.push(box.basePosition);
      }
    }
    return active;
  }

  public exportBoxRespawnTimers(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const box of this.itemBoxes) {
      if (box.respawnTimer > 0) {
        map[box.id] = Number(box.respawnTimer.toFixed(2));
      }
    }
    return map;
  }

  public applyBoxRespawnTimers(timers: Record<string, number>): void {
    for (const box of this.itemBoxes) {
      const rem = timers[box.id] ?? 0;
      box.respawnTimer = rem;
      box.mesh.setEnabled(rem <= 0);
    }
  }

  public applyNetworkBoxPickup(
    boxId: string,
    racer: KartController | undefined,
    awardedItem: PowerUpType | null
  ): void {
    const box = this.itemBoxes.find((b) => b.id);
    const matchingBox = this.itemBoxes.find((b) => b.id === boxId) ?? box;
    if (matchingBox) {
      matchingBox.respawnTimer = 6.0;
      matchingBox.mesh.setEnabled(false);
    }
    if (racer && awardedItem && !racer.heldItem && racer.rouletteTimer <= 0) {
      racer.awardItemWithRoulette(awardedItem);
    }
  }

  private ensureNovaOverdriveCore(racer: KartController): void {
    const existing = this.novaOverdriveCores.get(racer.racerId);
    if (
      existing &&
      !existing.isDisposed() &&
      existing.parent === racer.assembly.visualRoot
    ) {
      return;
    }
    if (existing && !existing.isDisposed()) {
      existing.dispose();
    }
    const coreMesh = MeshBuilder.CreatePolyhedron(
      `novaCore_${racer.racerId}`,
      { type: 3, size: 0.52 },
      this.scene
    );
    coreMesh.convertToFlatShadedMesh();
    coreMesh.material = this.novaGoldMat;
    coreMesh.parent = racer.assembly.visualRoot;
    coreMesh.position = new Vector3(0, 2.35, 0);
    coreMesh.isPickable = false;
    this.novaOverdriveCores.set(racer.racerId, coreMesh);
  }

  private ensureWarpAutopilotCanopy(racer: KartController): Mesh {
    const existing = this.warpAutopilotCanopies.get(racer.racerId);
    if (
      existing &&
      !existing.isDisposed() &&
      existing.parent === racer.assembly.visualRoot
    ) {
      return existing;
    }
    if (existing && !existing.isDisposed()) {
      existing.dispose();
    }
    const canopy = MeshBuilder.CreateCylinder(
      `warpCanopy_${racer.racerId}`,
      {
        height: 4.2,
        diameterTop: 0.35,
        diameterBottom: 2.35,
        tessellation: 14,
      },
      this.scene
    );
    canopy.convertToFlatShadedMesh();
    canopy.material = this.warpShuttleMat;
    canopy.parent = racer.assembly.visualRoot;
    canopy.rotation.x = Math.PI * 0.5;
    canopy.position = new Vector3(0, 0.85, 0.25);
    canopy.isPickable = false;
    this.warpAutopilotCanopies.set(racer.racerId, canopy);
    return canopy;
  }

  private ensureTripleCryoMineRig(racer: KartController): TripleCryoMineRig {
    const existing = this.tripleCryoMineRigs.get(racer.racerId);
    if (
      existing &&
      !existing.root.isDisposed() &&
      existing.root.parent === racer.assembly.kartRoot
    ) {
      return existing;
    }
    if (existing && !existing.root.isDisposed()) {
      existing.root.dispose();
    }
    const rigRoot = new TransformNode(
      `tripleCryoMine_${racer.racerId}`,
      this.scene
    );
    rigRoot.parent = racer.assembly.kartRoot;
    rigRoot.position = new Vector3(0, 0.45, 0);

    const mineNodes: TransformNode[] = [];
    for (let i = 0; i < 3; i++) {
      const mNode = new TransformNode(
        `trailMine_${racer.racerId}_${i}`,
        this.scene
      );
      mNode.parent = rigRoot;
      mNode.position = new Vector3(0, 0, -2.15 - i * 1.15);

      const tetra = MeshBuilder.CreatePolyhedron(
        `trailMineTetra_${racer.racerId}_${i}`,
        { type: 0, size: 0.58 },
        this.scene
      );
      tetra.convertToFlatShadedMesh();
      tetra.material = this.mineYellowMat;
      tetra.parent = mNode;
      tetra.isPickable = false;

      const ring = MeshBuilder.CreateTorus(
        `trailMineRing_${racer.racerId}_${i}`,
        { diameter: 1.15, thickness: 0.12, tessellation: 10 },
        this.scene
      );
      ring.material = this.mineBlackMat;
      ring.parent = mNode;
      ring.position.y = -0.15;
      ring.isPickable = false;

      mineNodes.push(mNode);
    }

    const rig: TripleCryoMineRig = {
      root: rigRoot,
      mineNodes,
      bobPhase: 0,
    };
    this.tripleCryoMineRigs.set(racer.racerId, rig);
    return rig;
  }

  private ensureOrbitalShieldRig(racer: KartController): OrbitalShieldRig {
    const existing = this.orbitalShieldRigs.get(racer.racerId);
    if (
      existing &&
      !existing.root.isDisposed() &&
      existing.root.parent === racer.assembly.kartRoot
    ) {
      return existing;
    }
    if (existing && !existing.root.isDisposed()) {
      existing.root.dispose();
    }
    const rigRoot = new TransformNode(`orbitalShield_${racer.racerId}`, this.scene);
    rigRoot.parent = racer.assembly.kartRoot;
    rigRoot.position = new Vector3(0, 0.72, 0);

    const droneMeshes: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const drone = MeshBuilder.CreatePolyhedron(
        `orbitalDrone_${racer.racerId}_${i}`,
        { type: 1, size: 0.42 },
        this.scene
      );
      drone.convertToFlatShadedMesh();
      drone.material = this.shieldDroneMat;
      drone.parent = rigRoot;
      drone.isPickable = false;

      const halo = MeshBuilder.CreateTorus(
        `orbitalDroneHalo_${racer.racerId}_${i}`,
        { diameter: 0.92, thickness: 0.08, tessellation: 12 },
        this.scene
      );
      halo.material = this.itemRingMat;
      halo.parent = drone;
      halo.isPickable = false;

      droneMeshes.push(drone);
    }

    const rig: OrbitalShieldRig = {
      root: rigRoot,
      droneMeshes,
      orbitAngle: 0,
    };
    this.orbitalShieldRigs.set(racer.racerId, rig);
    return rig;
  }

  private ensureTripleSeekerRig(racer: KartController): OrbitalShieldRig {
    const existing = this.tripleSeekerRigs.get(racer.racerId);
    if (
      existing &&
      !existing.root.isDisposed() &&
      existing.root.parent === racer.assembly.kartRoot
    ) {
      return existing;
    }
    if (existing && !existing.root.isDisposed()) {
      existing.root.dispose();
    }
    const rigRoot = new TransformNode(`tripleSeeker_${racer.racerId}`, this.scene);
    rigRoot.parent = racer.assembly.kartRoot;
    rigRoot.position = new Vector3(0, 0.76, 0);

    const droneMeshes: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const drone = MeshBuilder.CreatePolyhedron(
        `tripleSeekerDrone_${racer.racerId}_${i}`,
        { type: 1, size: 0.44 },
        this.scene
      );
      drone.convertToFlatShadedMesh();
      drone.material = this.seekerMat;
      drone.parent = rigRoot;
      drone.isPickable = false;

      const halo = MeshBuilder.CreateTorus(
        `tripleSeekerHalo_${racer.racerId}_${i}`,
        { diameter: 0.96, thickness: 0.09, tessellation: 14 },
        this.scene
      );
      halo.material = this.novaGoldMat;
      halo.parent = drone;
      halo.rotation.x = Math.PI / 4;
      halo.isPickable = false;

      droneMeshes.push(drone);
    }

    const rig: OrbitalShieldRig = {
      root: rigRoot,
      droneMeshes,
      orbitAngle: 0,
    };
    this.tripleSeekerRigs.set(racer.racerId, rig);
    return rig;
  }

  private tryConsumeOrbitingDroneBlock(
    racer: KartController
  ): "ORBITAL_SHIELD" | "TRIPLE_SEEKER" | "TRIPLE_CRYO_MINE" | null {
    if (racer.orbitalShieldCharges > 0) {
      racer.orbitalShieldCharges = Math.max(0, racer.orbitalShieldCharges - 1);
      if (racer.heldItem === "ORBITAL_SHIELD") {
        racer.heldItemCharges = racer.orbitalShieldCharges;
        if (racer.orbitalShieldCharges <= 0) racer.heldItem = null;
      }
      globalAiBrain.recordDefensiveBlock(racer.racerId);
      return "ORBITAL_SHIELD";
    }
    if (racer.tripleSeekerCharges > 0) {
      racer.tripleSeekerCharges = Math.max(0, racer.tripleSeekerCharges - 1);
      if (racer.heldItem === "TRIPLE_SEEKER") {
        racer.heldItemCharges = racer.tripleSeekerCharges;
        if (racer.tripleSeekerCharges <= 0) racer.heldItem = null;
      }
      globalAiBrain.recordDefensiveBlock(racer.racerId);
      return "TRIPLE_SEEKER";
    }
    if (racer.tripleCryoMineCharges > 0) {
      racer.tripleCryoMineCharges = Math.max(
        0,
        racer.tripleCryoMineCharges - 1
      );
      if (racer.heldItem === "TRIPLE_CRYO_MINE") {
        racer.heldItemCharges = racer.tripleCryoMineCharges;
        if (racer.tripleCryoMineCharges <= 0) racer.heldItem = null;
      }
      globalAiBrain.recordDefensiveBlock(racer.racerId);
      return "TRIPLE_CRYO_MINE";
    }
    return null;
  }

  private ensureTripleNitroRig(racer: KartController): TripleNitroRig {
    const existing = this.tripleNitroRigs.get(racer.racerId);
    if (
      existing &&
      !existing.root.isDisposed() &&
      existing.root.parent === racer.assembly.visualRoot
    ) {
      return existing;
    }
    if (existing && !existing.root.isDisposed()) {
      existing.root.dispose();
    }
    const rigRoot = new TransformNode(`tripleNitro_${racer.racerId}`, this.scene);
    rigRoot.parent = racer.assembly.visualRoot;
    rigRoot.position = new Vector3(0, 0.95, -1.55);

    const canisterMeshes: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const canister = MeshBuilder.CreateCylinder(
        `nitroCan_${racer.racerId}_${i}`,
        { height: 0.56, diameterTop: 0.24, diameterBottom: 0.28, tessellation: 8 },
        this.scene
      );
      canister.convertToFlatShadedMesh();
      canister.material = this.nitroCanisterMat;
      canister.parent = rigRoot;
      canister.rotation.x = Math.PI * 0.18;
      canister.isPickable = false;
      canisterMeshes.push(canister);
    }

    const rig: TripleNitroRig = {
      root: rigRoot,
      canisterMeshes,
      orbitAngle: 0,
    };
    this.tripleNitroRigs.set(racer.racerId, rig);
    return rig;
  }

  private ensurePhaseCloakShell(racer: KartController): Mesh {
    const existing = this.phaseCloakShells.get(racer.racerId);
    if (
      existing &&
      !existing.isDisposed() &&
      existing.parent === racer.assembly.visualRoot
    ) {
      return existing;
    }
    if (existing && !existing.isDisposed()) {
      existing.dispose();
    }
    const shell = MeshBuilder.CreatePolyhedron(
      `phaseCloak_${racer.racerId}`,
      { type: 2, size: 1.55 },
      this.scene
    );
    shell.convertToFlatShadedMesh();
    shell.material = this.phaseCloakMat;
    shell.parent = racer.assembly.visualRoot;
    shell.position = new Vector3(0, 0.85, 0);
    shell.scaling = new Vector3(1.1, 0.72, 1.45);
    shell.isPickable = false;
    this.phaseCloakShells.set(racer.racerId, shell);
    return shell;
  }

  private triggerEmpShockwave(
    caster: KartController,
    allRacers: KartController[],
    onBannerEvent?: (message: string) => void
  ): void {
    // Spawn visual expanding EMP torus wave around caster
    const waveMesh = MeshBuilder.CreateTorus(
      `empWave_${this.nextEntityId++}`,
      { diameter: 2.0, thickness: 0.18, tessellation: 24 },
      this.scene
    );
    waveMesh.material = this.empRingMat;
    waveMesh.position = caster.position.add(new Vector3(0, 0.8, 0));
    waveMesh.isPickable = false;
    waveMesh.parent = this.root;
    this.empWaves.push({
      mesh: waveMesh,
      lifeTimer: 0.75,
      maxRadius: 42.0,
    });

    // Zap all racers ahead of the caster (or all rival racers if caster is in 1st)
    let targets = this.getRacersAheadOf(caster, allRacers);
    if (targets.length === 0) {
      targets = allRacers.filter((r) => r.racerId !== caster.racerId);
    }

    let zappedCount = 0;
    for (const target of targets) {
      if (
        target.novaOverdriveTimer > 0 ||
        target.warpAutopilotTimer > 0 ||
        target.phaseCloakTimer > 0
      ) {
        continue;
      }
      target.applyEmpShockwaveDebuff();
      // Spawn a localized lightning ring over each zapped target
      const strikeRing = MeshBuilder.CreateTorus(
        `empStrike_${this.nextEntityId++}`,
        { diameter: 1.4, thickness: 0.22, tessellation: 16 },
        this.scene
      );
      strikeRing.material = this.empRingMat;
      strikeRing.position = target.position.add(new Vector3(0, 1.4, 0));
      strikeRing.isPickable = false;
      strikeRing.parent = this.root;
      this.empWaves.push({
        mesh: strikeRing,
        lifeTimer: 0.55,
        maxRadius: 6.5,
      });

      zappedCount++;
      globalAiBrain.recordItemHitLanded(caster.racerId);
    }

    onBannerEvent?.(
      zappedCount > 0
        ? `⚡ ${caster.name}'s Ion Storm Shockwave zapped & shrunk ${zappedCount} rival${zappedCount > 1 ? "s" : ""}!`
        : `⚡ ${caster.name} discharged an Ion Storm Shockwave!`
    );
  }

  private triggerOilSquall(
    caster: KartController,
    allRacers: KartController[],
    onBannerEvent?: (message: string) => void
  ): void {
    const squallWave = MeshBuilder.CreateTorus(
      `oilSquallWave_${this.nextEntityId++}`,
      { diameter: 1.8, thickness: 0.22, tessellation: 20 },
      this.scene
    );
    squallWave.material = this.oilSquallRingMat;
    squallWave.position = caster.position.add(new Vector3(0, 1.1, 0));
    squallWave.isPickable = false;
    squallWave.parent = this.root;
    this.empWaves.push({
      mesh: squallWave,
      lifeTimer: 0.7,
      maxRadius: 36.0,
    });

    let targets = this.getRacersAheadOf(caster, allRacers);
    if (targets.length === 0) {
      targets = allRacers.filter((r) => r.racerId !== caster.racerId);
    }

    let splatteredCount = 0;
    for (const target of targets) {
      if (
        target.novaOverdriveTimer > 0 ||
        target.warpAutopilotTimer > 0 ||
        target.phaseCloakTimer > 0
      ) {
        continue;
      }
      target.applyOilSquallDebuff();

      const cloudRing = MeshBuilder.CreateTorus(
        `oilSquallHit_${this.nextEntityId++}`,
        { diameter: 1.5, thickness: 0.25, tessellation: 16 },
        this.scene
      );
      cloudRing.material = this.oilSquallRingMat;
      cloudRing.position = target.position.add(new Vector3(0, 1.5, 0));
      cloudRing.isPickable = false;
      cloudRing.parent = this.root;
      this.empWaves.push({
        mesh: cloudRing,
        lifeTimer: 0.6,
        maxRadius: 5.5,
      });

      splatteredCount++;
      globalAiBrain.recordItemHitLanded(caster.racerId);
    }

    onBannerEvent?.(
      splatteredCount > 0
        ? `🛢️ ${caster.name}'s Slick-Cloud Discharger splattered ${splatteredCount} rival${splatteredCount > 1 ? "s" : ""} (-20% Grip)!`
        : `🛢️ ${caster.name} fired a Slick-Cloud Discharger!`
    );
  }

  private deployCryoMine(caster: KartController): void {
    const id = `mine_${this.nextEntityId++}`;
    const dropPos = caster.position
      .subtract(caster.forwardVector.scale(3.1))
      .add(new Vector3(0, 0.45, 0));

    const node = new TransformNode(id, this.scene);
    node.parent = this.root;
    node.position.copyFrom(dropPos);

    const tetra = MeshBuilder.CreatePolyhedron(
      `${id}_tetra`,
      { type: 0, size: 0.78 },
      this.scene
    );
    tetra.convertToFlatShadedMesh();
    tetra.material = this.mineYellowMat;
    tetra.parent = node;
    tetra.isPickable = false;

    const hazardRing = MeshBuilder.CreateTorus(
      `${id}_ring`,
      { diameter: 1.55, thickness: 0.16, tessellation: 12 },
      this.scene
    );
    hazardRing.material = this.mineBlackMat;
    hazardRing.parent = node;
    hazardRing.position.y = -0.2;
    hazardRing.isPickable = false;

    this.mines.push({
      id,
      ownerId: caster.racerId,
      root: node,
      position: dropPos,
      armTimer: 0.25,
      lifeTimer: 28.0,
    });
  }

  private deployGlitchPrism(caster: KartController): void {
    const id = `glitchPrism_${this.nextEntityId++}`;
    const groundQuery = this.track.queryClosestTrackPoint(
      caster.position.subtract(caster.forwardVector.scale(3.2))
    );
    const basePos = caster.position
      .subtract(caster.forwardVector.scale(3.2))
      .clone();
    basePos.y = groundQuery.roadY + 1.45;

    const node = new TransformNode(id, this.scene);
    node.parent = this.root;
    node.position.copyFrom(basePos);

    const prism = MeshBuilder.CreatePolyhedron(
      `${id}_prism`,
      { type: 1, size: 0.86 },
      this.scene
    );
    prism.parent = node;
    prism.convertToFlatShadedMesh();
    prism.material = this.glitchPrismMat;
    prism.isPickable = false;

    const innerWarningCore = MeshBuilder.CreatePolyhedron(
      `${id}_core`,
      { type: 0, size: 0.42 },
      this.scene
    );
    innerWarningCore.parent = prism;
    innerWarningCore.convertToFlatShadedMesh();
    innerWarningCore.material = this.seekerMat;
    innerWarningCore.isPickable = false;

    const ring = MeshBuilder.CreateTorus(
      `${id}_ring`,
      { diameter: 1.96, thickness: 0.11, tessellation: 16 },
      this.scene
    );
    ring.parent = prism;
    ring.rotation.x = -Math.PI / 3; // Inverted ring tilt as a subtle visual tell
    ring.material = this.glitchRingMat;
    ring.isPickable = false;

    this.glitchPrisms.push({
      id,
      ownerId: caster.racerId,
      root: node,
      prismMesh: prism,
      ringMesh: ring,
      basePosition: basePos,
      armTimer: 0.35,
      lifeTimer: 32.0,
      phaseOffset: this.nextEntityId * 0.9,
    });
  }

  private spawnRicochetDisc(
    caster: KartController,
    allRacers: KartController[]
  ): void {
    const id = `disc_${this.nextEntityId++}`;
    const spawnPos = caster.position
      .add(caster.forwardVector.scale(2.8))
      .add(new Vector3(0, 0.65, 0));

    const node = new TransformNode(id, this.scene);
    node.parent = this.root;
    node.position.copyFrom(spawnPos);

    const disc = MeshBuilder.CreateCylinder(
      `${id}_core`,
      { height: 0.24, diameter: 1.45, tessellation: 6 },
      this.scene
    );
    disc.convertToFlatShadedMesh();
    disc.material = this.discMat;
    disc.parent = node;
    disc.isPickable = false;

    const rim = MeshBuilder.CreateTorus(
      `${id}_rim`,
      { diameter: 1.58, thickness: 0.12, tessellation: 14 },
      this.scene
    );
    rim.material = this.itemRingMat;
    rim.parent = node;
    rim.isPickable = false;

    const discSpeed = 72.0;
    let fireDir = caster.forwardVector.clone();

    // AI Aiming Intelligence: Easy shoots loosely, Medium aims directly, Hard uses ballistic target-lead prediction
    if (!caster.isPlayer) {
      const diff = caster.aiDifficulty;
      if (diff === "EASY") {
        const scatterYaw = (Math.random() - 0.5) * 0.34;
        const yaw = caster.headingYaw + scatterYaw;
        fireDir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      } else {
        const maxRange = diff === "HARD" ? 95 : 75;
        const minDotCone = diff === "HARD" ? 0.65 : 0.72;
        let bestTarget: KartController | null = null;
        let bestDist = maxRange;

        for (const r of allRacers) {
          if (r.racerId === caster.racerId) continue;
          const toR = r.position.subtract(spawnPos);
          toR.y = 0;
          const dist = toR.length();
          if (dist < 2 || dist > bestDist) continue;
          const dirToR = toR.scale(1 / dist);
          if (Vector3.Dot(caster.forwardVector, dirToR) >= minDotCone) {
            bestDist = dist;
            bestTarget = r;
          }
        }

        if (bestTarget) {
          // Predictive lead time on HARD (0.85x flight time), moderate lead on MEDIUM (0.58x)
          const leadFactor = diff === "HARD" ? 0.85 : 0.58;
          const flightTime = (bestDist / discSpeed) * leadFactor;
          const predictedPos = bestTarget.position.add(
            bestTarget.velocity.scale(flightTime)
          );
          const aimVec = predictedPos.subtract(spawnPos);
          aimVec.y = 0;
          if (aimVec.lengthSquared() > 1e-4) {
            aimVec.normalize();
            const scatter =
              diff === "HARD"
                ? (Math.random() - 0.5) * 0.03
                : (Math.random() - 0.5) * 0.065;
            const aimYaw = Math.atan2(aimVec.x, aimVec.z) + scatter;
            fireDir = new Vector3(Math.sin(aimYaw), 0, Math.cos(aimYaw));
          }
        }
      }
    }

    const velocity = fireDir.scale(discSpeed);

    this.projectiles.push({
      id,
      type: "RICOCHET_DISC",
      ownerId: caster.racerId,
      targetRacerId: null,
      root: node,
      coreMesh: disc,
      ringMesh: rim,
      position: spawnPos,
      velocity,
      splineT: caster.closestTrack.normalizedSplineT,
      bouncesRemaining: 4,
      lifeTimer: 9.0,
    });
  }

  private spawnPulseSeeker(
    caster: KartController,
    allRacers: KartController[]
  ): void {
    const id = `seeker_${this.nextEntityId++}`;
    const spawnPos = caster.position
      .add(caster.forwardVector.scale(2.8))
      .add(new Vector3(0, 0.75, 0));

    // Lock onto the next racer ahead in standings (or closest ahead on track)
    let target: KartController | null = null;
    const aheadCandidates = allRacers.filter(
      (r) => r.racerId !== caster.racerId && r.rank < caster.rank
    );
    if (aheadCandidates.length > 0) {
      aheadCandidates.sort((a, b) => b.rank - a.rank); // Immediately ahead in rank
      target = aheadCandidates[0];
    } else {
      const others = allRacers.filter((r) => r.racerId !== caster.racerId);
      if (others.length > 0) {
        target = others[0];
      }
    }

    const node = new TransformNode(id, this.scene);
    node.parent = this.root;
    node.position.copyFrom(spawnPos);

    const core = MeshBuilder.CreatePolyhedron(
      `${id}_octa`,
      { type: 1, size: 0.68 },
      this.scene
    );
    core.convertToFlatShadedMesh();
    core.material = this.seekerMat;
    core.parent = node;
    core.isPickable = false;

    const torus = MeshBuilder.CreateTorus(
      `${id}_torus`,
      { diameter: 1.55, thickness: 0.14, tessellation: 16 },
      this.scene
    );
    torus.material = this.itemRingMat;
    torus.parent = node;
    torus.rotation.x = Math.PI / 4;
    torus.isPickable = false;

    this.projectiles.push({
      id,
      type: "PULSE_SEEKER",
      ownerId: caster.racerId,
      targetRacerId: target ? target.racerId : null,
      root: node,
      coreMesh: core,
      ringMesh: torus,
      position: spawnPos,
      velocity: caster.forwardVector.scale(65.0),
      splineT: (caster.closestTrack.normalizedSplineT + 0.01) % 1.0,
      bouncesRemaining: 0,
      lifeTimer: 8.5,
    });
  }

  /**
   * Spawns the quirky "Lil' Saucer" UFO rocket projectile.
   * Randomly locks onto one of the racers ahead of the caster and rockets down the spline at 88 u/s.
   */
  private spawnLilSaucer(
    caster: KartController,
    allRacers: KartController[]
  ): KartController | null {
    const id = `saucer_${this.nextEntityId++}`;
    const spawnPos = caster.position
      .add(caster.forwardVector.scale(3.0))
      .add(new Vector3(0, 1.15, 0));

    // Select a random racer in front of the caster
    const aheadCandidates = this.getRacersAheadOf(caster, allRacers);
    let target: KartController | null = null;
    if (aheadCandidates.length > 0) {
      const randomIdx = Math.floor(Math.random() * aheadCandidates.length);
      target = aheadCandidates[randomIdx];
    } else {
      const others = allRacers.filter((r) => r.racerId !== caster.racerId);
      if (others.length > 0) {
        target = others[Math.floor(Math.random() * others.length)];
      }
    }

    const node = new TransformNode(id, this.scene);
    node.parent = this.root;
    node.position.copyFrom(spawnPos);
    node.rotation.y = caster.headingYaw;

    // 1. Metallic flying-saucer flange rim (spins rapidly around Y)
    const saucerRim = MeshBuilder.CreateCylinder(
      `${id}_rim`,
      {
        height: 0.28,
        diameterTop: 1.52,
        diameterBottom: 2.55,
        tessellation: 20,
      },
      this.scene
    );
    saucerRim.material = this.saucerChromeMat;
    saucerRim.parent = node;
    saucerRim.isPickable = false;

    const lowerBevel = MeshBuilder.CreateCylinder(
      `${id}_bevel`,
      {
        height: 0.2,
        diameterTop: 2.45,
        diameterBottom: 1.05,
        tessellation: 20,
      },
      this.scene
    );
    lowerBevel.position.y = -0.22;
    lowerBevel.material = this.saucerChromeMat;
    lowerBevel.parent = saucerRim;
    lowerBevel.isPickable = false;

    // 2. Quirky retro Face Dome on top of the saucer
    const faceDome = MeshBuilder.CreateSphere(
      `${id}_dome`,
      { diameterX: 1.5, diameterY: 1.12, diameterZ: 1.5, segments: 18 },
      this.scene
    );
    faceDome.position.y = 0.28;
    faceDome.material = this.saucerDomeFaceMat;
    faceDome.parent = node;
    faceDome.isPickable = false;

    // 3. Little antenna stalk & glowing bobble bulb on top of the head
    const antennaStalk = MeshBuilder.CreateCylinder(
      `${id}_stalk`,
      { height: 0.38, diameter: 0.08, tessellation: 10 },
      this.scene
    );
    antennaStalk.position.y = 0.92;
    antennaStalk.material = this.saucerChromeMat;
    antennaStalk.parent = node;
    antennaStalk.isPickable = false;

    const antennaBulb = MeshBuilder.CreateSphere(
      `${id}_bulb`,
      { diameter: 0.26, segments: 12 },
      this.scene
    );
    antennaBulb.position.y = 1.14;
    antennaBulb.material = this.saucerBeamMat;
    antennaBulb.parent = node;
    antennaBulb.isPickable = false;

    // 4. Glowing cyan tractor-beam ring underneath
    const beamRing = MeshBuilder.CreateTorus(
      `${id}_beamRing`,
      { diameter: 2.15, thickness: 0.14, tessellation: 18 },
      this.scene
    );
    beamRing.position.y = -0.14;
    beamRing.material = this.saucerBeamMat;
    beamRing.parent = node;
    beamRing.isPickable = false;

    this.projectiles.push({
      id,
      type: "LIL_SAUCER",
      ownerId: caster.racerId,
      targetRacerId: target ? target.racerId : null,
      root: node,
      coreMesh: saucerRim,
      ringMesh: beamRing,
      position: spawnPos,
      velocity: caster.forwardVector.scale(88.0),
      splineT: (caster.closestTrack.normalizedSplineT + 0.015) % 1.0,
      bouncesRemaining: 0,
      lifeTimer: 11.0,
    });

    return target;
  }

  public update(
    dt: number,
    racers: KartController[],
    onBannerEvent?: (message: string) => void,
    onBoxPickedUp?: (
      boxId: string,
      racer: KartController,
      awardedItem: PowerUpType | null
    ) => void
  ): void {
    this.elapsedSec += dt;

    // Cyclic rainbow tint on Item Boxes
    const hueShift = this.elapsedSec * 2.2;
    this.itemBoxMat.emissiveColor = new Color3(
      0.35 + 0.3 * Math.sin(hueShift),
      0.45 + 0.35 * Math.sin(hueShift + 2.1),
      0.65 + 0.3 * Math.sin(hueShift + 4.2)
    );

    // Subtle glitch pulse on counterfeit Prank Glitch Prisms
    const glitchPulse = Math.sin(this.elapsedSec * 14.0);
    this.glitchPrismMat.emissiveColor = new Color3(
      0.72 + 0.25 * Math.max(0, glitchPulse),
      0.18 + 0.22 * Math.max(0, -glitchPulse),
      0.52 + 0.3 * Math.sin(this.elapsedSec * 7.5)
    );

    // 0. Compute Incoming Projectile Threat Count for each racer (used by AI Tactical Item Brain)
    for (const racer of racers) {
      let threats = 0;
      for (const proj of this.projectiles) {
        if (proj.ownerId === racer.racerId) continue;
        const dx = proj.position.x - racer.position.x;
        const dz = proj.position.z - racer.position.z;
        const distSq = dx * dx + dz * dz;
        if (proj.targetRacerId === racer.racerId && distSq < 42 * 42) {
          threats++;
        } else if (distSq < 26 * 26) {
          const toRacer = racer.position.subtract(proj.position);
          toRacer.y = 0;
          if (toRacer.lengthSquared() > 0.1) {
            toRacer.normalize();
            const projDir = proj.velocity.clone();
            projDir.y = 0;
            if (projDir.lengthSquared() > 0.1) {
              projDir.normalize();
              if (Vector3.Dot(projDir, toRacer) > 0.72) {
                threats++;
              }
            }
          }
        }
      }
      racer.incomingThreatCount = threats;
    }

    // 1. Update Item Boxes & Check Collection
    for (const box of this.itemBoxes) {
      if (box.respawnTimer > 0) {
        box.respawnTimer = Math.max(0, box.respawnTimer - dt);
        if (box.respawnTimer === 0) {
          box.mesh.setEnabled(true);
        }
        continue;
      }

      // Continuous rotation & bobbing
      box.mesh.rotation.y += dt * 2.1;
      box.mesh.rotation.x += dt * 1.2;
      box.mesh.position.y =
        box.basePosition.y +
        Math.sin(this.elapsedSec * 3.2 + box.phaseOffset) * 0.25;

      for (const racer of racers) {
        const dx = racer.position.x - box.basePosition.x;
        const dz = racer.position.z - box.basePosition.z;
        if (dx * dx + dz * dz < 4.4) {
          box.respawnTimer = 6.0; // 6 second respawn per spec
          box.mesh.setEnabled(false);

          let awarded: PowerUpType | null = null;
          if (!racer.heldItem && racer.rouletteTimer <= 0) {
            awarded = this.rollWeightedPowerUp(racer.rank, racer, racers);
            racer.awardItemWithRoulette(awarded);
          }
          onBoxPickedUp?.(box.id, racer, awarded);
          break;
        }
      }
    }

    // 2. Update Nova Overdrive Cores, Warp Autopilot Canopies, Triple Nitro Rigs, Phase Cloak Shells, Orbital Drones & Trailing Mines
    for (const racer of racers) {
      // 2a. Nova Overdrive Core
      const coreMesh = this.novaOverdriveCores.get(racer.racerId);
      if (racer.novaOverdriveTimer > 0) {
        if (
          !coreMesh ||
          coreMesh.isDisposed() ||
          coreMesh.parent !== racer.assembly.visualRoot
        ) {
          this.ensureNovaOverdriveCore(racer);
        } else {
          coreMesh.setEnabled(true);
          coreMesh.rotation.y += dt * 5.5;
          coreMesh.rotation.z += dt * 2.8;
        }
      } else if (coreMesh && !coreMesh.isDisposed()) {
        coreMesh.setEnabled(false);
      }

      // 2a2. Hyper-Shuttle Autopilot Canopy
      const warpCanopy = this.warpAutopilotCanopies.get(racer.racerId);
      if (racer.warpAutopilotTimer > 0) {
        const activeCanopy =
          !warpCanopy ||
          warpCanopy.isDisposed() ||
          warpCanopy.parent !== racer.assembly.visualRoot
            ? this.ensureWarpAutopilotCanopy(racer)
            : warpCanopy;
        activeCanopy.setEnabled(true);
        activeCanopy.rotation.z += dt * 9.0;
      } else if (warpCanopy && !warpCanopy.isDisposed()) {
        warpCanopy.setEnabled(false);
      }

      // 2b. Triple Nitro Orbiting Rear Canisters
      const nitroRig = this.tripleNitroRigs.get(racer.racerId);
      if (racer.heldItem === "TRIPLE_NITRO" && racer.heldItemCharges > 0) {
        const activeRig =
          !nitroRig ||
          nitroRig.root.isDisposed() ||
          nitroRig.root.parent !== racer.assembly.visualRoot
            ? this.ensureTripleNitroRig(racer)
            : nitroRig;
        activeRig.root.setEnabled(true);
        activeRig.orbitAngle += dt * 3.5;
        for (let c = 0; c < 3; c++) {
          const can = activeRig.canisterMeshes[c];
          if (c < racer.heldItemCharges) {
            can.setEnabled(true);
            const spread = (c - (racer.heldItemCharges - 1) * 0.5) * 0.52;
            can.position.set(
              spread,
              Math.sin(activeRig.orbitAngle + c * 1.4) * 0.08,
              0
            );
            can.rotation.y += dt * 4.0;
          } else {
            can.setEnabled(false);
          }
        }
      } else if (nitroRig && !nitroRig.root.isDisposed()) {
        nitroRig.root.setEnabled(false);
      }

      // 2b2. Tri-Cryo Mine Cluster (3x trailing spiked mines behind rear bumper + contact wipeout)
      const trailMineRig = this.tripleCryoMineRigs.get(racer.racerId);
      if (racer.tripleCryoMineCharges > 0) {
        const activeTrailRig =
          !trailMineRig ||
          trailMineRig.root.isDisposed() ||
          trailMineRig.root.parent !== racer.assembly.kartRoot
            ? this.ensureTripleCryoMineRig(racer)
            : trailMineRig;
        activeTrailRig.root.setEnabled(true);
        activeTrailRig.bobPhase += dt * 5.0;
        for (let m = 0; m < 3; m++) {
          const mNode = activeTrailRig.mineNodes[m];
          if (m < racer.tripleCryoMineCharges) {
            mNode.setEnabled(true);
            mNode.position.set(
              Math.sin(activeTrailRig.bobPhase + m * 1.1) * 0.18,
              Math.cos(activeTrailRig.bobPhase * 1.3 + m) * 0.08,
              -2.15 - m * 1.15
            );
            mNode.rotation.y += dt * 4.2;
          } else {
            mNode.setEnabled(false);
          }
        }

        // Check if any rival kart tailgating behind hits one of the trailing Cryo Mines
        const fwd = racer.forwardVector;
        for (const other of racers) {
          if (
            other.racerId === racer.racerId ||
            other.spinOutTimer > 0 ||
            other.phaseCloakTimer > 0
          ) {
            continue;
          }
          let hitTrailMine = false;
          for (let m = 0; m < Math.min(3, racer.tripleCryoMineCharges); m++) {
            const distBack = 2.15 + m * 1.15;
            const mx = racer.position.x - fwd.x * distBack;
            const mz = racer.position.z - fwd.z * distBack;
            const dx = other.position.x - mx;
            const dz = other.position.z - mz;
            if (dx * dx + dz * dz <= 1.95 * 1.95) {
              hitTrailMine = true;
              break;
            }
          }
          if (hitTrailMine) {
            racer.tripleCryoMineCharges = Math.max(
              0,
              racer.tripleCryoMineCharges - 1
            );
            if (racer.heldItem === "TRIPLE_CRYO_MINE") {
              if (racer.tripleCryoMineCharges > 0) {
                racer.heldItemCharges = racer.tripleCryoMineCharges;
              } else {
                racer.heldItem = null;
                racer.heldItemCharges = 0;
              }
            }
            if (
              other.novaOverdriveTimer > 0 ||
              other.warpAutopilotTimer > 0
            ) {
              onBannerEvent?.(
                `${other.name} shattered ${racer.name}'s trailing Cryo Mine!`
              );
            } else {
              other.triggerSpinOut(1.15, 3.2);
              globalAiBrain.recordItemHitLanded(racer.racerId);
              onBannerEvent?.(
                `💥 ${other.name} ran into ${racer.name}'s trailing Cryo Mine!`
              );
            }
            break;
          }
        }
      } else if (trailMineRig && !trailMineRig.root.isDisposed()) {
        trailMineRig.root.setEnabled(false);
      }

      // 2c. Phase Cloak Hologram Shell
      const cloakShell = this.phaseCloakShells.get(racer.racerId);
      if (racer.phaseCloakTimer > 0) {
        const activeShell =
          !cloakShell ||
          cloakShell.isDisposed() ||
          cloakShell.parent !== racer.assembly.visualRoot
            ? this.ensurePhaseCloakShell(racer)
            : cloakShell;
        activeShell.setEnabled(true);
        activeShell.rotation.y -= dt * 3.2;
        this.phaseCloakMat.alpha =
          0.32 + 0.14 * Math.sin(this.elapsedSec * 12.0);
      } else if (cloakShell && !cloakShell.isDisposed()) {
        cloakShell.setEnabled(false);
      }

      // Helper to check if any active orbiting drone (or the 2.25m orbital ring perimeter) contacts a rival kart
      const checkOrbitingRigContact = (
        rig: OrbitalShieldRig,
        activeCharges: number,
        radius: number,
        consumeCharge: () => void,
        droneLabel: string
      ) => {
        if (activeCharges <= 0) return;
        for (const other of racers) {
          if (
            other.racerId === racer.racerId ||
            other.spinOutTimer > 0 ||
            other.phaseCloakTimer > 0
          ) {
            continue;
          }
          const dx = other.position.x - racer.position.x;
          const dz = other.position.z - racer.position.z;
          const centerDistSq = dx * dx + dz * dz;

          // Check 1: Direct contact with the spinning orbital ring perimeter (2.25m orbit + 1.30m kart hull = 3.55m)
          let hit = centerDistSq <= 3.55 * 3.55;

          // Check 2: Exact 3D world-space contact with any individual orbiting drone mesh (<= 2.15m)
          if (!hit) {
            for (let d = 0; d < Math.min(3, activeCharges); d++) {
              const drone = rig.droneMeshes[d];
              if (!drone || !drone.isEnabled()) continue;
              const angle =
                rig.orbitAngle +
                (d * Math.PI * 2) / Math.max(1, activeCharges) +
                racer.headingYaw;
              const orbX = racer.position.x + Math.cos(angle) * radius;
              const orbZ = racer.position.z + Math.sin(angle) * radius;
              const odx = other.position.x - orbX;
              const odz = other.position.z - orbZ;
              if (odx * odx + odz * odz <= 2.15 * 2.15) {
                hit = true;
                break;
              }
            }
          }

          if (hit) {
            consumeCharge();

            // Separate karts & apply outward knockback so the orb carrier is never Juggernaut-bounced
            const centerDist = Math.sqrt(centerDistSq);
            const nx = centerDist > 1e-4 ? dx / centerDist : Math.sin(racer.headingYaw);
            const nz = centerDist > 1e-4 ? dz / centerDist : Math.cos(racer.headingYaw);

            racer.collisionCooldown = Math.max(racer.collisionCooldown, 0.45);
            other.collisionCooldown = Math.max(other.collisionCooldown, 0.45);

            if (
              other.novaOverdriveTimer > 0 ||
              other.warpAutopilotTimer > 0
            ) {
              onBannerEvent?.(
                `${other.name} shattered ${racer.name}'s ${droneLabel}!`
              );
            } else {
              if (centerDist < 3.25) {
                const pushDist = 3.25 - centerDist;
                other.position.x += nx * pushDist;
                other.position.z += nz * pushDist;
                other.assembly.kartRoot.position.copyFrom(other.position);
              }
              other.knockVelocity.set(nx * 22.0, 0, nz * 22.0);
              other.triggerSpinOut(1.15, 3.8);
              globalAiBrain.recordItemHitLanded(racer.racerId);
              onBannerEvent?.(
                `💥 ${racer.name}'s orbiting ${droneLabel} wiped out ${other.name}!`
              );
            }
            break;
          }
        }
      };

      // 2d. Orbital Shield Drones (3x orbiting defense/ricochet drones: auto-orbit + rival contact wipeout)
      const shieldRig = this.orbitalShieldRigs.get(racer.racerId);
      if (racer.orbitalShieldCharges > 0) {
        const activeShield =
          !shieldRig ||
          shieldRig.root.isDisposed() ||
          shieldRig.root.parent !== racer.assembly.kartRoot
            ? this.ensureOrbitalShieldRig(racer)
            : shieldRig;
        activeShield.root.setEnabled(true);
        activeShield.orbitAngle += dt * 4.8;
        const radius = 2.25;
        for (let d = 0; d < 3; d++) {
          const drone = activeShield.droneMeshes[d];
          if (d < racer.orbitalShieldCharges) {
            drone.setEnabled(true);
            const angle =
              activeShield.orbitAngle +
              (d * Math.PI * 2) / Math.max(1, racer.orbitalShieldCharges);
            drone.position.set(
              Math.cos(angle) * radius,
              Math.sin(this.elapsedSec * 5.0 + d * 2.0) * 0.15,
              Math.sin(angle) * radius
            );
            drone.rotation.y += dt * 6.0;
            drone.rotation.x += dt * 3.5;
          } else {
            drone.setEnabled(false);
          }
        }

        checkOrbitingRigContact(
          activeShield,
          racer.orbitalShieldCharges,
          radius,
          () => {
            racer.orbitalShieldCharges = Math.max(
              0,
              racer.orbitalShieldCharges - 1
            );
            if (racer.heldItem === "ORBITAL_SHIELD") {
              if (racer.orbitalShieldCharges > 0) {
                racer.heldItemCharges = racer.orbitalShieldCharges;
              } else {
                racer.heldItem = null;
                racer.heldItemCharges = 0;
              }
            }
          },
          "Orbital Shield Drone"
        );
      } else if (shieldRig && !shieldRig.root.isDisposed()) {
        shieldRig.root.setEnabled(false);
      }

      // 2e. Triple Seeker Swarm (3x orbiting homing seeker drones: auto-orbit + rival contact wipeout + homing fire)
      const seekerRig = this.tripleSeekerRigs.get(racer.racerId);
      if (racer.tripleSeekerCharges > 0) {
        const activeSeekers =
          !seekerRig ||
          seekerRig.root.isDisposed() ||
          seekerRig.root.parent !== racer.assembly.kartRoot
            ? this.ensureTripleSeekerRig(racer)
            : seekerRig;
        activeSeekers.root.setEnabled(true);
        activeSeekers.orbitAngle += dt * 5.2;
        const radius = 2.25;
        for (let d = 0; d < 3; d++) {
          const drone = activeSeekers.droneMeshes[d];
          if (d < racer.tripleSeekerCharges) {
            drone.setEnabled(true);
            const angle =
              activeSeekers.orbitAngle +
              (d * Math.PI * 2) / Math.max(1, racer.tripleSeekerCharges);
            drone.position.set(
              Math.cos(angle) * radius,
              Math.sin(this.elapsedSec * 5.6 + d * 2.1) * 0.16,
              Math.sin(angle) * radius
            );
            drone.rotation.y += dt * 7.0;
            drone.rotation.z += dt * 4.0;
          } else {
            drone.setEnabled(false);
          }
        }

        checkOrbitingRigContact(
          activeSeekers,
          racer.tripleSeekerCharges,
          radius,
          () => {
            racer.tripleSeekerCharges = Math.max(
              0,
              racer.tripleSeekerCharges - 1
            );
            if (racer.heldItem === "TRIPLE_SEEKER") {
              if (racer.tripleSeekerCharges > 0) {
                racer.heldItemCharges = racer.tripleSeekerCharges;
              } else {
                racer.heldItem = null;
                racer.heldItemCharges = 0;
              }
            }
          },
          "Tri-Seeker Drone"
        );
      } else if (seekerRig && !seekerRig.root.isDisposed()) {
        seekerRig.root.setEnabled(false);
      }
    }

    // 2f. Update Expanding EMP Shockwave Rings
    for (let i = this.empWaves.length - 1; i >= 0; i--) {
      const wave = this.empWaves[i];
      wave.lifeTimer -= dt;
      if (wave.lifeTimer <= 0) {
        wave.mesh.dispose();
        this.empWaves.splice(i, 1);
        continue;
      }
      const progress = 1.0 - Math.max(0, wave.lifeTimer / 0.75);
      const scale = 1.0 + progress * wave.maxRadius;
      wave.mesh.scaling.set(scale, 1.0, scale);
      wave.mesh.rotation.y += dt * 8.0;
    }

    // 3. Update Deployed Cryo Mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      mine.armTimer = Math.max(0, mine.armTimer - dt);
      mine.lifeTimer -= dt;
      mine.root.rotation.y += dt * 2.5;

      if (mine.lifeTimer <= 0) {
        mine.root.dispose();
        this.mines.splice(i, 1);
        continue;
      }

      if (mine.armTimer > 0) continue;

      let triggered = false;
      for (const racer of racers) {
        if (racer.phaseCloakTimer > 0) continue;
        const dx = racer.position.x - mine.position.x;
        const dz = racer.position.z - mine.position.z;
        // 1.8u trigger radius per spec
        if (dx * dx + dz * dz <= 1.8 * 1.8) {
          if (
            racer.novaOverdriveTimer > 0 ||
            racer.warpAutopilotTimer > 0
          ) {
            onBannerEvent?.(
              `${racer.name} shattered a Cryo Mine!`
            );
          } else {
            const blockedBy = this.tryConsumeOrbitingDroneBlock(racer);
            if (blockedBy) {
              const label =
                blockedBy === "TRIPLE_SEEKER"
                  ? "Tri-Seeker Swarm"
                  : blockedBy === "TRIPLE_CRYO_MINE"
                  ? "Tri-Cryo Mine Cluster"
                  : "Orbital Shield";
              onBannerEvent?.(
                `${racer.name}'s ${label} neutralized a Cryo Mine!`
              );
            } else {
              racer.triggerSpinOut(1.1, 2.5);
              if (mine.ownerId !== racer.racerId) {
                globalAiBrain.recordItemHitLanded(mine.ownerId);
              }
              onBannerEvent?.(`${racer.name} hit a Cryo Mine (720° Spin-Out)!`);
            }
          }
          triggered = true;
          break;
        }
      }

      if (triggered) {
        mine.root.dispose();
        this.mines.splice(i, 1);
      }
    }

    // 3b. Update Deployed Prank Glitch Prisms (Fake Item Boxes)
    for (let i = this.glitchPrisms.length - 1; i >= 0; i--) {
      const prism = this.glitchPrisms[i];
      prism.armTimer = Math.max(0, prism.armTimer - dt);
      prism.lifeTimer -= dt;

      if (prism.lifeTimer <= 0) {
        prism.root.dispose();
        this.glitchPrisms.splice(i, 1);
        continue;
      }

      // Mimic Item Box rotation & bobbing with a subtle counter-spin
      prism.prismMesh.rotation.y -= dt * 2.4;
      prism.prismMesh.rotation.x += dt * 1.35;
      prism.root.position.y =
        prism.basePosition.y +
        Math.sin(this.elapsedSec * 3.8 + prism.phaseOffset) * 0.25;

      if (prism.armTimer > 0) continue;

      let triggered = false;
      for (const racer of racers) {
        if (racer.phaseCloakTimer > 0) continue;
        const dx = racer.position.x - prism.basePosition.x;
        const dz = racer.position.z - prism.basePosition.z;
        if (dx * dx + dz * dz <= 2.0 * 2.0) {
          if (
            racer.novaOverdriveTimer > 0 ||
            racer.warpAutopilotTimer > 0
          ) {
            onBannerEvent?.(
              `${racer.name} smashed a Prank Glitch Prism!`
            );
          } else {
            const blockedBy = this.tryConsumeOrbitingDroneBlock(racer);
            if (blockedBy) {
              const label =
                blockedBy === "TRIPLE_SEEKER"
                  ? "Tri-Seeker Swarm"
                  : blockedBy === "TRIPLE_CRYO_MINE"
                  ? "Tri-Cryo Mine Cluster"
                  : "Orbital Shield";
              onBannerEvent?.(
                `${racer.name}'s ${label} zapped a Prank Glitch Prism!`
              );
            } else {
              racer.triggerSpinOut(1.3, 3.8);
              if (prism.ownerId !== racer.racerId) {
                globalAiBrain.recordItemHitLanded(prism.ownerId);
              }
              onBannerEvent?.(
                `${racer.name} fell for a Prank Glitch Prism (720° Spin-Out)!`
              );
            }
          }
          triggered = true;
          break;
        }
      }

      if (triggered) {
        prism.root.dispose();
        this.glitchPrisms.splice(i, 1);
      }
    }

    // 4. Update Active Projectiles (Pulse Seeker, Ricochet Disc & Lil' Saucer UFO Rocket)
    const totalTrackLen = Math.max(200, this.track.totalTrackLength);
    const saucerLookAheadDeltaT = Math.min(0.035, Math.max(0.006, 26 / totalTrackLen));
    const seekerLookAheadDeltaT = Math.min(0.03, Math.max(0.005, 22 / totalTrackLen));

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.lifeTimer -= dt;
      proj.coreMesh.rotation.y += dt * 9.0;
      proj.ringMesh.rotation.z += dt * 6.5;

      if (proj.lifeTimer <= 0) {
        proj.root.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.type === "LIL_SAUCER") {
        // High-speed Lil' Saucer UFO rocket: follows spline at 88 u/s and dives onto its randomly chosen target ahead
        const targetRacer = racers.find(
          (r) => r.racerId === proj.targetRacerId
        );
        const query = this.track.queryClosestTrackPoint(proj.position);
        const splineAhead = this.track.getPointAtNormalizedT(
          (query.normalizedSplineT + saucerLookAheadDeltaT) % 1.0,
          0
        );

        let desiredDir = splineAhead.position
          .subtract(proj.position)
          .normalize();

        if (targetRacer) {
          const toTarget = targetRacer.position.subtract(proj.position);
          toTarget.y = 0;
          const distToTarget = toTarget.length();
          if (distToTarget < 46.0 && distToTarget > 0.01) {
            desiredDir = toTarget.scale(1 / distToTarget);
          }
        }

        desiredDir.y = 0;
        if (desiredDir.lengthSquared() > 1e-4) {
          desiredDir.normalize();
        }

        const currentDir = proj.velocity.clone().normalize();
        const steeredDir = Vector3.Lerp(
          currentDir,
          desiredDir,
          Math.min(1, dt * 13.5)
        ).normalize();
        proj.velocity = steeredDir.scale(88.0);
        proj.position.addInPlace(proj.velocity.scale(dt));

        const groundQuery = this.track.queryClosestTrackPoint(proj.position);
        const wobbleBob = Math.sin(this.elapsedSec * 14.0) * 0.16;
        proj.position.y = groundQuery.roadY + 1.18 + wobbleBob;
        proj.root.position.copyFrom(proj.position);

        // Keep the UFO's quirky face oriented along its flight path with a comical saucer tilt
        proj.root.rotation.y = Math.atan2(proj.velocity.x, proj.velocity.z);
        proj.root.rotation.z = Math.sin(this.elapsedSec * 15.0) * 0.2;
      } else if (proj.type === "PULSE_SEEKER") {
        // Follow Path3D spline ahead and steer toward locked target racer
        const targetRacer = racers.find(
          (r) => r.racerId === proj.targetRacerId
        );
        const query = this.track.queryClosestTrackPoint(proj.position);
        const splineAhead = this.track.getPointAtNormalizedT(
          (query.normalizedSplineT + seekerLookAheadDeltaT) % 1.0,
          0
        );

        let desiredDir = splineAhead.position
          .subtract(proj.position)
          .normalize();

        if (targetRacer) {
          const toTarget = targetRacer.position.subtract(proj.position);
          toTarget.y = 0;
          const distToTarget = toTarget.length();
          if (distToTarget < 36.0 && distToTarget > 0.01) {
            desiredDir = toTarget.scale(1 / distToTarget);
          }
        }

        desiredDir.y = 0;
        if (desiredDir.lengthSquared() > 1e-4) {
          desiredDir.normalize();
        }

        const currentDir = proj.velocity.clone().normalize();
        const steeredDir = Vector3.Lerp(
          currentDir,
          desiredDir,
          Math.min(1, dt * 9.5)
        ).normalize();
        proj.velocity = steeredDir.scale(65.0);
        proj.position.addInPlace(proj.velocity.scale(dt));

        const groundQuery = this.track.queryClosestTrackPoint(proj.position);
        proj.position.y = groundQuery.roadY + 0.72;
        proj.root.position.copyFrom(proj.position);
      } else {
        // RICOCHET_DISC: travels straight at 70 u/s and reflects elastically off track boundary walls up to 4 times
        proj.position.addInPlace(proj.velocity.scale(dt));
        const query = this.track.queryClosestTrackPoint(proj.position);
        proj.position.y = query.roadY + 0.62;

        const wallBoundary = query.localRoadHalfWidth + 2.4;
        if (query.horizontalDistance >= wallBoundary) {
          const sign = query.signedLateralOffset >= 0 ? 1 : -1;
          const wallNormal = query.binormal.scale(-sign);
          const vDotN = Vector3.Dot(proj.velocity, wallNormal);
          if (vDotN < 0) {
            proj.velocity.subtractInPlace(wallNormal.scale(2 * vDotN));
            proj.velocity = new Vector3(
              proj.velocity.x,
              0,
              proj.velocity.z
            )
              .normalize()
              .scale(70.0);
            proj.bouncesRemaining -= 1;
          }
          const clampedPos = query.closestPoint.add(
            query.binormal.scale(sign * (wallBoundary - 0.25))
          );
          proj.position.x = clampedPos.x;
          proj.position.z = clampedPos.z;
        }

        proj.root.position.copyFrom(proj.position);
        if (proj.bouncesRemaining < 0) {
          proj.root.dispose();
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // 4a. Check if projectile is intercepted by a deployed Cryo Mine or Glitch Prism (Defensive Tail-Block!)
      if (proj.type !== "LIL_SAUCER") {
        let blockedByTrap = false;
        for (let m = this.mines.length - 1; m >= 0; m--) {
          const mine = this.mines[m];
          const dx = mine.position.x - proj.position.x;
          const dz = mine.position.z - proj.position.z;
          if (dx * dx + dz * dz <= 1.95 * 1.95) {
            globalAiBrain.recordDefensiveBlock(mine.ownerId);
            mine.root.dispose();
            this.mines.splice(m, 1);
            blockedByTrap = true;
            break;
          }
        }
        if (!blockedByTrap) {
          for (let g = this.glitchPrisms.length - 1; g >= 0; g--) {
            const gp = this.glitchPrisms[g];
            const dx = gp.basePosition.x - proj.position.x;
            const dz = gp.basePosition.z - proj.position.z;
            if (dx * dx + dz * dz <= 2.05 * 2.05) {
              globalAiBrain.recordDefensiveBlock(gp.ownerId);
              gp.root.dispose();
              this.glitchPrisms.splice(g, 1);
              blockedByTrap = true;
              break;
            }
          }
        }
        if (blockedByTrap) {
          proj.root.dispose();
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // 4b. Check impact with any kart
      let hitKart = false;
      const hitRadius = proj.type === "LIL_SAUCER" ? 2.35 : 2.05;
      const graceThreshold = proj.type === "LIL_SAUCER" ? 10.4 : 7.9;

      for (const racer of racers) {
        if (racer.racerId === proj.ownerId && proj.lifeTimer > graceThreshold) {
          continue; // Brief launch grace window for caster
        }
        if (racer.phaseCloakTimer > 0) {
          continue; // Ghost Phase Cloak passes right through projectiles
        }
        const dx = racer.position.x - proj.position.x;
        const dz = racer.position.z - proj.position.z;
        if (dx * dx + dz * dz <= hitRadius * hitRadius) {
          const projLabel =
            proj.type === "LIL_SAUCER"
              ? "Lil' Saucer UFO"
              : proj.type === "PULSE_SEEKER"
              ? "Pulse Seeker"
              : "Ricochet Disc";

          if (
            racer.novaOverdriveTimer > 0 ||
            racer.warpAutopilotTimer > 0
          ) {
            onBannerEvent?.(`${racer.name} deflected ${projLabel}!`);
          } else if (
            (racer.orbitalShieldCharges > 0 ||
              racer.tripleSeekerCharges > 0 ||
              racer.tripleCryoMineCharges > 0) &&
            proj.type !== "LIL_SAUCER"
          ) {
            const blockedBy = this.tryConsumeOrbitingDroneBlock(racer);
            const shieldLabel =
              blockedBy === "TRIPLE_SEEKER"
                ? "Tri-Seeker Swarm"
                : blockedBy === "TRIPLE_CRYO_MINE"
                ? "Tri-Cryo Mine Cluster"
                : "Orbital Shield";
            onBannerEvent?.(
              `${racer.name}'s ${shieldLabel} intercepted ${projLabel}!`
            );
          } else if (proj.type === "LIL_SAUCER") {
            if (racer.spinOutTimer <= 0) {
              racer.triggerSpinOut(1.45, 5.2);
              if (proj.ownerId !== racer.racerId) {
                globalAiBrain.recordItemHitLanded(proj.ownerId);
              }
              onBannerEvent?.(
                `${racer.name} was abducted & blasted by ${projLabel}!`
              );
            }
          } else {
            racer.triggerSpinOut(1.2, 4.2);
            if (proj.ownerId !== racer.racerId) {
              globalAiBrain.recordItemHitLanded(proj.ownerId);
            }
            onBannerEvent?.(`${racer.name} was blasted by ${projLabel}!`);
          }

          // LIL_SAUCER bowls through intermediate karts until it reaches its randomly chosen target!
          if (
            proj.type === "LIL_SAUCER" &&
            proj.targetRacerId &&
            racer.racerId !== proj.targetRacerId
          ) {
            continue;
          }

          hitKart = true;
          break;
        }
      }

      if (hitKart) {
        proj.root.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    for (const p of this.projectiles) p.root.dispose();
    for (const m of this.mines) m.root.dispose();
    for (const gp of this.glitchPrisms) gp.root.dispose();
    for (const w of this.empWaves) w.mesh.dispose();
    this.root.dispose();
  }
}
