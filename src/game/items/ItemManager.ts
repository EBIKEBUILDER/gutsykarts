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

export class ItemManager {
  private readonly scene: Scene;
  private readonly track: BuiltTrack;
  private readonly root: TransformNode;

  private readonly itemBoxes: ItemBoxInstance[] = [];
  private readonly projectiles: ActiveProjectile[] = [];
  private readonly mines: DeployedCryoMine[] = [];
  private readonly glitchPrisms: DeployedGlitchPrism[] = [];
  private readonly novaOverdriveCores = new Map<string, Mesh>();

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
  private readonly saucerChromeMat: StandardMaterial;
  private readonly saucerDomeFaceMat: StandardMaterial;
  private readonly saucerBeamMat: StandardMaterial;
  private readonly glitchPrismMat: StandardMaterial;
  private readonly glitchRingMat: StandardMaterial;

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
      if (r < 0.30) return "CRYO_MINE";
      if (r < 0.56) return "GLITCH_PRISM";
      if (r < 0.80) return "RICOCHET_DISC";
      if (r < 0.92) return "NITRO_CORE";
      return "PULSE_SEEKER";
    }
    if (rank === 2) {
      if (canGetSaucer && r < 0.10) return "LIL_SAUCER";
      if (r < 0.32) return "PULSE_SEEKER";
      if (r < 0.52) return "NITRO_CORE";
      if (r < 0.70) return "RICOCHET_DISC";
      if (r < 0.84) return "GLITCH_PRISM";
      if (r < 0.94) return "CRYO_MINE";
      return "NOVA_OVERDRIVE";
    }
    if (rank === 3) {
      if (canGetSaucer && r < 0.24) return "LIL_SAUCER";
      if (r < 0.50) return "NITRO_CORE";
      if (r < 0.72) return "PULSE_SEEKER";
      if (r < 0.86) return "NOVA_OVERDRIVE";
      if (r < 0.94) return "GLITCH_PRISM";
      return "RICOCHET_DISC";
    }
    // Rank 4+ (Last place racer is highly likely to roll the UFO rocket!)
    if (canGetSaucer && r < 0.46) return "LIL_SAUCER";
    if (r < 0.74) return "NITRO_CORE";
    if (r < 0.90) return "NOVA_OVERDRIVE";
    return "PULSE_SEEKER";
  }

  public activatePowerUp(
    caster: KartController,
    item: PowerUpType,
    allRacers: KartController[],
    onBannerEvent?: (message: string) => void
  ): void {
    const meta = POWER_UP_CATALOG[item];

    if (item === "NITRO_CORE") {
      caster.activateNitroCore();
      onBannerEvent?.(`${caster.name} ignited ${meta.name} (+45% Boost)!`);
      return;
    }

    if (item === "NOVA_OVERDRIVE") {
      caster.activateNovaOverdrive();
      this.ensureNovaOverdriveCore(caster);
      onBannerEvent?.(
        `${caster.name} unleashed ${meta.name} (9,999 kg Invincibility)!`
      );
      return;
    }

    if (item === "CRYO_MINE") {
      this.deployCryoMine(caster);
      onBannerEvent?.(`${caster.name} dropped a ${meta.name}!`);
      return;
    }

    if (item === "GLITCH_PRISM") {
      this.deployGlitchPrism(caster);
      onBannerEvent?.(`${caster.name} planted a ${meta.name} decoy!`);
      return;
    }

    if (item === "RICOCHET_DISC") {
      this.spawnRicochetDisc(caster, allRacers);
      onBannerEvent?.(`${caster.name} fired a ${meta.name}!`);
      return;
    }

    if (item === "PULSE_SEEKER") {
      this.spawnPulseSeeker(caster, allRacers);
      onBannerEvent?.(`${caster.name} launched a homing ${meta.name}!`);
      return;
    }

    if (item === "LIL_SAUCER") {
      const target = this.spawnLilSaucer(caster, allRacers);
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
    const box = this.itemBoxes.find((b) => b.id === boxId);
    if (box) {
      box.respawnTimer = 6.0;
      box.mesh.setEnabled(false);
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

    // 2. Update Nova Overdrive Orbiting Cores
    for (const racer of racers) {
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
        const dx = racer.position.x - mine.position.x;
        const dz = racer.position.z - mine.position.z;
        // 1.8u trigger radius per spec
        if (dx * dx + dz * dz <= 1.8 * 1.8) {
          if (racer.novaOverdriveTimer > 0) {
            onBannerEvent?.(
              `${racer.name}'s Nova Overdrive shattered a Cryo Mine!`
            );
          } else {
            racer.triggerSpinOut(1.1, 2.5);
            onBannerEvent?.(`${racer.name} hit a Cryo Mine (720° Spin-Out)!`);
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
        const dx = racer.position.x - prism.basePosition.x;
        const dz = racer.position.z - prism.basePosition.z;
        if (dx * dx + dz * dz <= 2.0 * 2.0) {
          if (racer.novaOverdriveTimer > 0) {
            onBannerEvent?.(
              `${racer.name}'s Nova Overdrive smashed a Prank Glitch Prism!`
            );
          } else {
            racer.triggerSpinOut(1.3, 3.8);
            onBannerEvent?.(
              `${racer.name} fell for a Prank Glitch Prism (720° Spin-Out)!`
            );
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
          (query.normalizedSplineT + 0.032) % 1.0,
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
          (query.normalizedSplineT + 0.025) % 1.0,
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

        const wallBoundary = this.track.roadHalfWidth + 2.4;
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

      // Check impact with any kart
      let hitKart = false;
      const hitRadius = proj.type === "LIL_SAUCER" ? 2.35 : 2.05;
      const graceThreshold = proj.type === "LIL_SAUCER" ? 10.4 : 7.9;

      for (const racer of racers) {
        if (racer.racerId === proj.ownerId && proj.lifeTimer > graceThreshold) {
          continue; // Brief launch grace window for caster
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

          if (racer.novaOverdriveTimer > 0) {
            onBannerEvent?.(`${racer.name} deflected ${projLabel}!`);
          } else if (proj.type === "LIL_SAUCER") {
            if (racer.spinOutTimer <= 0) {
              racer.triggerSpinOut(1.45, 5.2);
              onBannerEvent?.(
                `${racer.name} was abducted & blasted by ${projLabel}!`
              );
            }
          } else {
            racer.triggerSpinOut(1.2, 4.2);
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
    this.root.dispose();
  }
}
