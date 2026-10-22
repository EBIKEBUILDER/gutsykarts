import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { MiniTurboTier, ResolvedRacerStats, SurfaceType } from "@/src/types/game";

export interface KartAssembly {
  kartRoot: TransformNode;
  visualRoot: TransformNode;
  mergedChassisMesh: Mesh;
  chassisMaterials: StandardMaterial[];
  frontLeftPivot: TransformNode;
  frontRightPivot: TransformNode;
  wheelMeshes: Mesh[];
  leftExhaustEmitter: TransformNode;
  rightExhaustEmitter: TransformNode;
  leftRearWheelEmitter: TransformNode;
  rightRearWheelEmitter: TransformNode;
  updateNameplate: (displayName: string, visible: boolean) => void;
  updateVisuals: (params: {
    dt: number;
    forwardSpeed: number;
    maxSpeed: number;
    steerInput: number;
    miniTurboTier: MiniTurboTier;
    isDrifting: boolean;
    isBoosting: boolean;
    novaOverdriveActive: boolean;
    surface: SurfaceType;
    grounded: boolean;
    isBurnoutActive?: boolean;
  }) => void;
  dispose: () => void;
}

let sharedFlareTexture: DynamicTexture | null = null;
let sharedClodTexture: DynamicTexture | null = null;
let sharedGrassBladeTexture: DynamicTexture | null = null;
let sharedBurnoutTexture: DynamicTexture | null = null;
let sharedDirtBurnoutTexture: DynamicTexture | null = null;

function getSharedFlareTexture(scene: Scene): DynamicTexture {
  if (sharedFlareTexture && sharedFlareTexture.getScene() === scene) {
    return sharedFlareTexture;
  }
  const tex = new DynamicTexture("radialFlareTex", { width: 128, height: 128 }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 128, 128);

  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 60);
  grad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  grad.addColorStop(0.35, "rgba(255, 255, 255, 0.85)");
  grad.addColorStop(0.7, "rgba(255, 255, 255, 0.28)");
  grad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  tex.update();
  sharedFlareTexture = tex;
  return tex;
}

function getSharedClodTexture(scene: Scene): DynamicTexture {
  if (sharedClodTexture && sharedClodTexture.getScene() === scene) {
    return sharedClodTexture;
  }
  const tex = new DynamicTexture("dirtClodTex", { width: 64, height: 64 }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 64, 64);

  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(54, 18);
  ctx.lineTo(58, 42);
  ctx.lineTo(38, 58);
  ctx.lineTo(14, 52);
  ctx.lineTo(8, 26);
  ctx.closePath();
  ctx.fill();
  tex.update();
  sharedClodTexture = tex;
  return tex;
}

function getSharedGrassBladeTexture(scene: Scene): DynamicTexture {
  if (sharedGrassBladeTexture && sharedGrassBladeTexture.getScene() === scene) {
    return sharedGrassBladeTexture;
  }
  const tex = new DynamicTexture("grassBladeTex", { width: 64, height: 64 }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 64, 64);

  // Draw a cluster of sharp ripped-up grass blades
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  // Center blade
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.quadraticCurveTo(40, 28, 36, 58);
  ctx.lineTo(27, 58);
  ctx.quadraticCurveTo(28, 28, 32, 4);
  ctx.closePath();
  ctx.fill();

  // Left angled blade
  ctx.beginPath();
  ctx.moveTo(14, 12);
  ctx.quadraticCurveTo(24, 32, 24, 56);
  ctx.lineTo(16, 56);
  ctx.quadraticCurveTo(14, 34, 14, 12);
  ctx.closePath();
  ctx.fill();

  // Right angled blade
  ctx.beginPath();
  ctx.moveTo(50, 10);
  ctx.quadraticCurveTo(46, 34, 47, 56);
  ctx.lineTo(39, 56);
  ctx.quadraticCurveTo(40, 32, 50, 10);
  ctx.closePath();
  ctx.fill();

  tex.update();
  sharedGrassBladeTexture = tex;
  return tex;
}

function getSharedBurnoutTexture(scene: Scene): DynamicTexture {
  if (sharedBurnoutTexture && sharedBurnoutTexture.getScene() === scene) {
    return sharedBurnoutTexture;
  }
  const tex = new DynamicTexture("burnoutStreakTex", { width: 256, height: 128 }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 128);

  // Draw left & right rear tire rubber burnout bands with tread grooves and feathered ends
  const drawTireBand = (centerX: number) => {
    const bandW = 54;
    const x0 = centerX - bandW / 2;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, "rgba(10, 12, 16, 0.15)");
    grad.addColorStop(0.18, "rgba(10, 12, 16, 0.92)");
    grad.addColorStop(0.82, "rgba(10, 12, 16, 0.92)");
    grad.addColorStop(1.0, "rgba(10, 12, 16, 0.15)");

    ctx.fillStyle = grad;
    ctx.fillRect(x0, 0, bandW, 128);

    // Subtle longitudinal tread sipes inside each rubber mark
    ctx.clearRect(centerX - 10, 0, 4, 128);
    ctx.clearRect(centerX + 6, 0, 4, 128);
  };

  drawTireBand(48);
  drawTireBand(208);

  tex.update();
  sharedBurnoutTexture = tex;
  return tex;
}

function getSharedDirtBurnoutTexture(scene: Scene): DynamicTexture {
  if (sharedDirtBurnoutTexture && sharedDirtBurnoutTexture.getScene() === scene) {
    return sharedDirtBurnoutTexture;
  }
  const tex = new DynamicTexture("dirtBurnoutStreakTex", { width: 256, height: 128 }, scene, false);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 128);

  // Draw left & right torn-up brown soil & turf tire ruts for off-road grass burnouts
  const drawDirtRutBand = (centerX: number) => {
    const bandW = 60;
    const x0 = centerX - bandW / 2;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, "rgba(138, 88, 42, 0.18)");
    grad.addColorStop(0.16, "rgba(145, 92, 44, 0.96)");
    grad.addColorStop(0.5, "rgba(122, 74, 34, 0.98)");
    grad.addColorStop(0.84, "rgba(145, 92, 44, 0.96)");
    grad.addColorStop(1.0, "rgba(138, 88, 42, 0.18)");

    ctx.fillStyle = grad;
    ctx.fillRect(x0, 0, bandW, 128);

    // Darker churned mud/soil center furrow and diagonal tire lug marks
    ctx.fillStyle = "rgba(82, 48, 20, 0.92)";
    ctx.fillRect(centerX - 18, 6, 12, 116);
    ctx.fillRect(centerX + 6, 6, 12, 116);

    // Clumpy dirt & torn turf edge irregularities
    for (let y = 10; y < 118; y += 16) {
      ctx.fillStyle = "rgba(168, 112, 56, 0.9)";
      ctx.fillRect(x0 - 3, y, 8, 9);
      ctx.fillRect(x0 + bandW - 5, y + 6, 8, 9);
      ctx.fillStyle = "rgba(96, 58, 24, 0.95)";
      ctx.fillRect(centerX - 24, y + 4, 48, 5);
    }
  };

  drawDirtRutBand(48);
  drawDirtRutBand(208);

  tex.update();
  sharedDirtBurnoutTexture = tex;
  return tex;
}

export function buildProceduralKart(
  scene: Scene,
  racerId: string,
  stats: ResolvedRacerStats,
  shadowGenerator?: ShadowGenerator
): KartAssembly {
  const { character, kart } = stats;

  const kartRoot = new TransformNode(`kartRoot_${racerId}`, scene);
  const visualRoot = new TransformNode(`visualRoot_${racerId}`, scene);
  visualRoot.parent = kartRoot;

  // Materials for static chassis & driver sub-assembly (high-gloss automotive finish)
  const primaryMat = new StandardMaterial(`primaryMat_${racerId}`, scene);
  primaryMat.diffuseColor = Color3.FromHexString(kart.primaryColor);
  primaryMat.specularColor = new Color3(0.65, 0.65, 0.72);
  primaryMat.specularPower = 48;

  const secondaryMat = new StandardMaterial(`secondaryMat_${racerId}`, scene);
  secondaryMat.diffuseColor = Color3.FromHexString(kart.secondaryColor);
  secondaryMat.specularColor = new Color3(0.5, 0.5, 0.55);
  secondaryMat.specularPower = 36;

  const accentMat = new StandardMaterial(`accentMat_${racerId}`, scene);
  accentMat.diffuseColor = Color3.FromHexString(kart.accentColor);
  accentMat.emissiveColor = Color3.FromHexString(kart.accentColor).scale(0.22);
  accentMat.specularColor = new Color3(0.7, 0.7, 0.75);
  accentMat.specularPower = 64;

  const chromeMat = new StandardMaterial(`chromeMat_${racerId}`, scene);
  chromeMat.diffuseColor = new Color3(0.82, 0.85, 0.9);
  chromeMat.specularColor = new Color3(0.95, 0.95, 1.0);
  chromeMat.specularPower = 96;

  const darkMetalMat = new StandardMaterial(`darkMetalMat_${racerId}`, scene);
  darkMetalMat.diffuseColor = new Color3(0.15, 0.17, 0.21);
  darkMetalMat.specularColor = new Color3(0.35, 0.35, 0.4);
  darkMetalMat.specularPower = 32;

  const seatMat = new StandardMaterial(`seatMat_${racerId}`, scene);
  seatMat.diffuseColor = new Color3(0.1, 0.11, 0.14);
  seatMat.specularColor = new Color3(0.2, 0.2, 0.22);

  const suitMat = new StandardMaterial(`suitMat_${racerId}`, scene);
  suitMat.diffuseColor = Color3.FromHexString(character.colors.suit);
  suitMat.specularColor = new Color3(0.28, 0.28, 0.32);

  const helmetMat = new StandardMaterial(`helmetMat_${racerId}`, scene);
  helmetMat.diffuseColor = Color3.FromHexString(character.colors.helmet);
  helmetMat.specularColor = new Color3(0.85, 0.85, 0.92);
  helmetMat.specularPower = 80;

  const visorMat = new StandardMaterial(`visorMat_${racerId}`, scene);
  visorMat.diffuseColor = Color3.FromHexString(character.colors.visor);
  visorMat.emissiveColor = Color3.FromHexString(character.colors.visor).scale(0.38);
  visorMat.specularColor = new Color3(0.95, 0.95, 1.0);
  visorMat.specularPower = 96;

  const skinMat = new StandardMaterial(`skinMat_${racerId}`, scene);
  skinMat.diffuseColor = Color3.FromHexString(character.colors.skin);
  skinMat.specularColor = new Color3(0.15, 0.12, 0.1);

  const chassisMaterials: StandardMaterial[] = [
    primaryMat,
    secondaryMat,
    accentMat,
    chromeMat,
    darkMetalMat,
    seatMat,
    suitMat,
    helmetMat,
    visorMat,
    skinMat,
  ];

  const w = kart.chassisWidth;
  const l = kart.chassisLength;
  const chassisParts: Mesh[] = [];

  const addStaticPart = (mesh: Mesh, mat: StandardMaterial, flatShade = false) => {
    if (flatShade) {
      mesh.convertToFlatShadedMesh();
    }
    mesh.material = mat;
    mesh.isPickable = false;
    chassisParts.push(mesh);
  };

  // 1. Elongated Composite Floorpan & Lower Aero Undertray
  const undertray = MeshBuilder.CreateBox(
    `undertray_${racerId}`,
    { width: w * 0.68, height: 0.12, depth: l * 0.86 },
    scene
  );
  undertray.position = new Vector3(0, 0.24, 0.02);
  addStaticPart(undertray, darkMetalMat);

  const mainFrame = MeshBuilder.CreateBox(
    `frame_${racerId}`,
    { width: w * 0.56, height: 0.24, depth: l * 0.78 },
    scene
  );
  mainFrame.position = new Vector3(0, 0.36, -0.02);
  addStaticPart(mainFrame, primaryMat);

  // Sleek Tubular Perimeter Chassis Rails (left & right longitudinal tubes)
  for (const side of [-1, 1]) {
    const sideRail = MeshBuilder.CreateCylinder(
      `sideRail_${racerId}_${side}`,
      { height: l * 0.82, diameter: 0.11, tessellation: 16 },
      scene
    );
    sideRail.rotation.x = Math.PI / 2;
    sideRail.position = new Vector3(side * (w * 0.34), 0.31, 0.02);
    addStaticPart(sideRail, chromeMat);
  }

  // Front & Rear Suspension A-Arm Axles connecting frame to wheel hubs
  const frontZ = l * 0.35;
  const rearZ = -l * 0.34;
  const frontX = w * 0.49;
  const rearX = w * 0.53;

  for (const zPos of [frontZ, rearZ]) {
    const axleWidth = zPos > 0 ? frontX * 1.92 : rearX * 1.94;
    const axleTube = MeshBuilder.CreateCylinder(
      `axle_${racerId}_${zPos}`,
      { height: axleWidth, diameter: zPos > 0 ? 0.09 : 0.13, tessellation: 16 },
      scene
    );
    axleTube.rotation.z = Math.PI / 2;
    axleTube.position = new Vector3(0, 0.33, zPos);
    addStaticPart(axleTube, darkMetalMat);
  }

  // 2. Sculpted Elongated Front Nose Cowl & Front Bumper Assembly
  if (kart.bodyStyle === "TANK") {
    // Long sloped armored hood + heavy front bull-bar
    const armoredHood = MeshBuilder.CreateCylinder(
      `armoredHood_${racerId}`,
      {
        height: l * 0.42,
        diameterTop: w * 0.52,
        diameterBottom: w * 0.72,
        tessellation: 18,
      },
      scene
    );
    armoredHood.scaling = new Vector3(1.0, 0.52, 1.0);
    armoredHood.rotation.x = Math.PI / 2;
    armoredHood.position = new Vector3(0, 0.48, l * 0.24);
    addStaticPart(armoredHood, primaryMat);

    const bullBar = MeshBuilder.CreateBox(
      `prow_${racerId}`,
      { width: w * 0.88, height: 0.32, depth: 0.46 },
      scene
    );
    bullBar.position = new Vector3(0, 0.4, l * 0.45);
    addStaticPart(bullBar, secondaryMat);

    // Twin armored LED headlights
    for (const side of [-1, 1]) {
      const lamp = MeshBuilder.CreateCylinder(
        `lamp_${racerId}_${side}`,
        { height: 0.14, diameter: 0.22, tessellation: 16 },
        scene
      );
      lamp.rotation.x = Math.PI / 2;
      lamp.position = new Vector3(side * (w * 0.28), 0.46, l * 0.47);
      addStaticPart(lamp, accentMat);
    }

    if (kart.spikedBumper) {
      for (const sx of [-0.62, 0, 0.62]) {
        const spike = MeshBuilder.CreateCylinder(
          `spike_${racerId}_${sx}`,
          { height: 0.46, diameterTop: 0, diameterBottom: 0.2, tessellation: 16 },
          scene
        );
        spike.rotation.x = Math.PI / 2;
        spike.position = new Vector3(sx * w * 0.46, 0.4, l * 0.48 + 0.26);
        addStaticPart(spike, chromeMat);
      }
    }
  } else if (kart.bodyStyle === "COUPE") {
    // Sleek, rounded long-nose aerodynamic sports fairing
    const coupeNose = MeshBuilder.CreateSphere(
      `coupeNose_${racerId}`,
      {
        diameterX: w * 0.68,
        diameterY: 0.44,
        diameterZ: l * 0.52,
        segments: 20,
      },
      scene
    );
    coupeNose.position = new Vector3(0, 0.44, l * 0.25);
    addStaticPart(coupeNose, primaryMat);

    const frontSplitter = MeshBuilder.CreateBox(
      `splitter_${racerId}`,
      { width: w * 0.82, height: 0.07, depth: 0.52 },
      scene
    );
    frontSplitter.position = new Vector3(0, 0.24, l * 0.44);
    addStaticPart(frontSplitter, secondaryMat);

    // Swept rear tailfins on Coupe
    for (const side of [-1, 1]) {
      const tailFin = MeshBuilder.CreateBox(
        `tailFin_${racerId}_${side}`,
        { width: 0.08, height: 0.34, depth: 0.85 },
        scene
      );
      tailFin.rotation.x = 0.22;
      tailFin.position = new Vector3(side * (w * 0.34), 0.66, -l * 0.28);
      addStaticPart(tailFin, accentMat);
    }
  } else if (kart.bodyStyle === "BUGGY") {
    // Rounded rally nose cone + tubular roll-bar hoop over cockpit
    const buggyNose = MeshBuilder.CreateSphere(
      `buggyNose_${racerId}`,
      {
        diameterX: w * 0.64,
        diameterY: 0.46,
        diameterZ: l * 0.46,
        segments: 18,
      },
      scene
    );
    buggyNose.position = new Vector3(0, 0.46, l * 0.24);
    addStaticPart(buggyNose, primaryMat);

    const frontHoop = MeshBuilder.CreateTorus(
      `frontHoop_${racerId}`,
      { diameter: w * 0.66, thickness: 0.09, tessellation: 20 },
      scene
    );
    frontHoop.position = new Vector3(0, 0.36, l * 0.44);
    addStaticPart(frontHoop, chromeMat);
  } else {
    // FORMULA: Long tapered needle nose cone + multi-element front wing with endplates
    const formulaNose = MeshBuilder.CreateCylinder(
      `formulaNose_${racerId}`,
      {
        height: l * 0.48,
        diameterTop: 0.24,
        diameterBottom: w * 0.54,
        tessellation: 20,
      },
      scene
    );
    formulaNose.scaling = new Vector3(1.0, 0.56, 1.0);
    formulaNose.rotation.x = Math.PI / 2;
    formulaNose.position = new Vector3(0, 0.42, l * 0.26);
    addStaticPart(formulaNose, primaryMat);

    const frontWing = MeshBuilder.CreateBox(
      `frontWing_${racerId}`,
      { width: w * 0.86, height: 0.07, depth: 0.38 },
      scene
    );
    frontWing.position = new Vector3(0, 0.24, l * 0.47);
    addStaticPart(frontWing, secondaryMat);

    for (const side of [-1, 1]) {
      const wingEndplate = MeshBuilder.CreateBox(
        `fWingEnd_${racerId}_${side}`,
        { width: 0.06, height: 0.2, depth: 0.44 },
        scene
      );
      wingEndplate.position = new Vector3(side * (w * 0.43), 0.28, l * 0.47);
      addStaticPart(wingEndplate, accentMat);
    }
  }

  // 3. Contoured Aerodynamic Sidepods with Radiator Air Intakes
  for (const side of [-1, 1]) {
    const podBody = MeshBuilder.CreateCylinder(
      `sidepod_${racerId}_${side}`,
      {
        height: l * 0.46,
        diameterTop: 0.34,
        diameterBottom: 0.42,
        tessellation: 18,
      },
      scene
    );
    podBody.scaling = new Vector3(0.95, 0.82, 1.0);
    podBody.rotation.x = Math.PI / 2;
    podBody.position = new Vector3(side * (w * 0.36), 0.42, -0.02);
    addStaticPart(podBody, secondaryMat);

    // Sidepod dark radiator intake mouth
    const intake = MeshBuilder.CreateBox(
      `intake_${racerId}_${side}`,
      { width: 0.22, height: 0.2, depth: 0.12 },
      scene
    );
    intake.position = new Vector3(side * (w * 0.36), 0.42, l * 0.21);
    addStaticPart(intake, darkMetalMat);

    // Glowing accent side skirt stripe
    const sideStripe = MeshBuilder.CreateBox(
      `trim_${racerId}_${side}`,
      { width: 0.06, height: 0.09, depth: l * 0.48 },
      scene
    );
    sideStripe.position = new Vector3(side * (w * 0.48), 0.38, -0.02);
    addStaticPart(sideStripe, accentMat);
  }

  // 4. Sculpted Racing Bucket Seat & Cockpit Dashboard
  const seatBack = MeshBuilder.CreateBox(
    `seatBack_${racerId}`,
    { width: 0.56, height: 0.68, depth: 0.14 },
    scene
  );
  seatBack.rotation.x = -0.18;
  seatBack.position = new Vector3(0, 0.72, -0.28);
  addStaticPart(seatBack, seatMat);

  for (const side of [-1, 1]) {
    const bolster = MeshBuilder.CreateBox(
      `seatBolster_${racerId}_${side}`,
      { width: 0.1, height: 0.34, depth: 0.48 },
      scene
    );
    bolster.position = new Vector3(side * 0.28, 0.54, -0.08);
    addStaticPart(bolster, seatMat);
  }

  // Cockpit fairing cowl + steering column + circular racing steering wheel
  const dashCowl = MeshBuilder.CreateSphere(
    `dashCowl_${racerId}`,
    { diameterX: 0.54, diameterY: 0.32, diameterZ: 0.62, segments: 16 },
    scene
  );
  dashCowl.position = new Vector3(0, 0.64, l * 0.14);
  addStaticPart(dashCowl, secondaryMat);

  const column = MeshBuilder.CreateCylinder(
    `steerCol_${racerId}`,
    { height: 0.52, diameter: 0.09, tessellation: 14 },
    scene
  );
  column.rotation.x = -Math.PI / 3.6;
  column.position = new Vector3(0, 0.78, l * 0.11);
  addStaticPart(column, darkMetalMat);

  const steeringWheel = MeshBuilder.CreateTorus(
    `steerWheel_${racerId}`,
    { diameter: 0.34, thickness: 0.045, tessellation: 20 },
    scene
  );
  steeringWheel.rotation.x = Math.PI / 3.2;
  steeringWheel.position = new Vector3(0, 0.94, l * 0.06);
  addStaticPart(steeringWheel, seatMat);

  // 5. High-Detail Rear Engine Block, Cylinder Heads & Swept Twin Exhausts
  const engineBlock = MeshBuilder.CreateBox(
    `engine_${racerId}`,
    { width: w * 0.42, height: 0.44, depth: 0.68 },
    scene
  );
  engineBlock.position = new Vector3(0, 0.64, -l * 0.28);
  addStaticPart(engineBlock, darkMetalMat);

  // Twin V-cylinder heads with chrome valve covers
  for (const side of [-1, 1]) {
    const cylHead = MeshBuilder.CreateCylinder(
      `cylHead_${racerId}_${side}`,
      { height: 0.36, diameter: 0.26, tessellation: 16 },
      scene
    );
    cylHead.rotation.z = -side * 0.42;
    cylHead.position = new Vector3(side * 0.22, 0.88, -l * 0.26);
    addStaticPart(cylHead, chromeMat);

    const exhaust = MeshBuilder.CreateCylinder(
      `exhaust_${racerId}_${side}`,
      { height: 0.92, diameterTop: 0.22, diameterBottom: 0.14, tessellation: 18 },
      scene
    );
    exhaust.rotation.x = -Math.PI / 2.8;
    exhaust.position = new Vector3(side * (w * 0.22), 0.82, -l * 0.39);
    addStaticPart(exhaust, chromeMat);

    const exhaustTip = MeshBuilder.CreateTorus(
      `exhaustTip_${racerId}_${side}`,
      { diameter: 0.21, thickness: 0.035, tessellation: 16 },
      scene
    );
    exhaustTip.rotation.x = Math.PI / 6;
    exhaustTip.position = new Vector3(side * (w * 0.22), 0.98, -l * 0.48);
    addStaticPart(exhaustTip, accentMat);
  }

  // 6. Multi-Element Rear Spoiler Wing + Endplates
  for (const side of [-1, 1]) {
    const strut = MeshBuilder.CreateBox(
      `wingStrut_${racerId}_${side}`,
      { width: 0.07, height: 0.52, depth: 0.24 },
      scene
    );
    strut.rotation.x = -0.15;
    strut.position = new Vector3(side * (w * 0.24), 1.02, -l * 0.38);
    addStaticPart(strut, darkMetalMat);

    const endplate = MeshBuilder.CreateBox(
      `wingEndplate_${racerId}_${side}`,
      { width: 0.05, height: 0.28, depth: 0.52 },
      scene
    );
    endplate.position = new Vector3(side * (w * 0.44), 1.28, -l * 0.41);
    addStaticPart(endplate, primaryMat);
  }

  const spoilerWing = MeshBuilder.CreateBox(
    `spoilerWing_${racerId}`,
    { width: w * 0.88, height: 0.08, depth: 0.42 },
    scene
  );
  spoilerWing.position = new Vector3(0, 1.28, -l * 0.41);
  spoilerWing.rotation.x = 0.18;
  addStaticPart(spoilerWing, accentMat);

  // 7. High-Definition Driver Character (Smooth Suit Torso, Arms, Gloves, Helmet & Wraparound Visor)
  const torso = MeshBuilder.CreateCylinder(
    `driverTorso_${racerId}`,
    {
      height: 0.64,
      diameterTop: 0.44,
      diameterBottom: 0.52,
      tessellation: 18,
    },
    scene
  );
  torso.position = new Vector3(0, 0.84, -0.08);
  addStaticPart(torso, suitMat);

  // Driver shoulders & arms reaching forward to grip steering wheel
  for (const side of [-1, 1]) {
    const shoulder = MeshBuilder.CreateSphere(
      `shoulder_${racerId}_${side}`,
      { diameter: 0.22, segments: 12 },
      scene
    );
    shoulder.position = new Vector3(side * 0.25, 1.04, -0.06);
    addStaticPart(shoulder, suitMat);

    const arm = MeshBuilder.CreateCylinder(
      `arm_${racerId}_${side}`,
      { height: 0.44, diameter: 0.14, tessellation: 14 },
      scene
    );
    arm.rotation.x = Math.PI / 2.5;
    arm.rotation.z = side * 0.18;
    arm.position = new Vector3(side * 0.21, 0.98, 0.08);
    addStaticPart(arm, suitMat);

    const hand = MeshBuilder.CreateSphere(
      `hand_${racerId}_${side}`,
      { diameter: 0.15, segments: 12 },
      scene
    );
    hand.position = new Vector3(side * 0.16, 0.94, l * 0.06);
    addStaticPart(hand, darkMetalMat);
  }

  const head = MeshBuilder.CreateSphere(
    `driverHead_${racerId}`,
    { diameter: 0.48, segments: 16 },
    scene
  );
  head.position = new Vector3(0, 1.32, -0.08);
  addStaticPart(head, skinMat);

  const helmet = MeshBuilder.CreateSphere(
    `driverHelmet_${racerId}`,
    { diameterX: 0.56, diameterY: 0.55, diameterZ: 0.6, segments: 20 },
    scene
  );
  helmet.position = new Vector3(0, 1.38, -0.09);
  addStaticPart(helmet, helmetMat);

  // Smooth wraparound aerodynamic helmet visor
  const visor = MeshBuilder.CreateCylinder(
    `driverVisor_${racerId}`,
    {
      height: 0.2,
      diameterTop: 0.54,
      diameterBottom: 0.55,
      tessellation: 20,
      arc: 0.55,
    },
    scene
  );
  visor.rotation.y = Math.PI * 0.225;
  visor.position = new Vector3(0, 1.37, -0.07);
  addStaticPart(visor, visorMat);

  // Character-specific helmet details (Chrome horns for Rex, Aero dorsal fin for Nyx, Goggle crest for Pip)
  if (character.id === "rex_ironclad") {
    for (const side of [-1, 1]) {
      const horn = MeshBuilder.CreateCylinder(
        `horn_${racerId}_${side}`,
        { height: 0.34, diameterTop: 0, diameterBottom: 0.14, tessellation: 14 },
        scene
      );
      horn.position = new Vector3(side * 0.29, 1.58, -0.08);
      horn.rotation.z = -side * 0.55;
      addStaticPart(horn, chromeMat);
    }
  } else if (character.id === "nyx_drift") {
    const fin = MeshBuilder.CreateBox(
      `helmetFin_${racerId}`,
      { width: 0.07, height: 0.22, depth: 0.46 },
      scene
    );
    fin.position = new Vector3(0, 1.62, -0.16);
    addStaticPart(fin, accentMat);
  }

  // Merge all static chassis + driver parts into a single draw call preserving multi-materials
  const merged = Mesh.MergeMeshes(
    chassisParts,
    true,
    true,
    undefined,
    false,
    true
  );
  const mergedChassisMesh = merged ?? mainFrame;
  mergedChassisMesh.name = `mergedChassis_${racerId}`;
  mergedChassisMesh.parent = visualRoot;
  mergedChassisMesh.isPickable = false;

  if (shadowGenerator) {
    shadowGenerator.addShadowCaster(mergedChassisMesh);
  }

  // Tier 2: High-Definition Articulated Wheel Nodes (Front wheels on steering pivots, all 4 wheels spin around X)
  const tireMat = new StandardMaterial(`tireMat_${racerId}`, scene);
  tireMat.diffuseColor = new Color3(0.11, 0.12, 0.14);
  tireMat.specularColor = new Color3(0.22, 0.22, 0.25);
  tireMat.specularPower = 24;

  const rimMat = new StandardMaterial(`rimMat_${racerId}`, scene);
  rimMat.diffuseColor = Color3.FromHexString(kart.accentColor);
  rimMat.specularColor = new Color3(0.85, 0.85, 0.9);
  rimMat.specularPower = 64;

  const frontLeftPivot = new TransformNode(`flPivot_${racerId}`, scene);
  frontLeftPivot.parent = visualRoot;
  const frontRightPivot = new TransformNode(`frPivot_${racerId}`, scene);
  frontRightPivot.parent = visualRoot;

  const wheelRadius = 0.35 * kart.wheelScale;
  const wheelWidth = 0.3 * kart.wheelScale;

  frontLeftPivot.position = new Vector3(-frontX, wheelRadius, frontZ);
  frontRightPivot.position = new Vector3(frontX, wheelRadius, frontZ);

  const wheelMeshes: Mesh[] = [];

  const createWheelUnit = (
    name: string,
    parent: TransformNode,
    localPos: Vector3,
    widthScale = 1.0,
    radiusScale = 1.0
  ) => {
    const tire = MeshBuilder.CreateCylinder(
      name,
      {
        height: wheelWidth * widthScale,
        diameter: wheelRadius * 2 * radiusScale,
        tessellation: 24,
      },
      scene
    );
    // Rotate geometry into wheel orientation via bakeCurrentTransformIntoVertices so local X rotation spins the wheel forward
    tire.rotation.z = Math.PI / 2;
    tire.bakeCurrentTransformIntoVertices();
    tire.material = tireMat;
    tire.parent = parent;
    tire.position = localPos;
    tire.isPickable = false;

    // Rounded tire sidewall torus shoulders for realistic racing slick profile
    const sidewall = MeshBuilder.CreateTorus(
      `${name}_sidewall`,
      {
        diameter: wheelRadius * 1.65 * radiusScale,
        thickness: wheelWidth * widthScale * 0.42,
        tessellation: 24,
      },
      scene
    );
    sidewall.rotation.z = Math.PI / 2;
    sidewall.bakeCurrentTransformIntoVertices();
    sidewall.material = tireMat;
    sidewall.parent = tire;
    sidewall.isPickable = false;

    const hub = MeshBuilder.CreateCylinder(
      `${name}_hub`,
      {
        height: wheelWidth * widthScale * 1.06,
        diameter: wheelRadius * 1.15 * radiusScale,
        tessellation: 20,
      },
      scene
    );
    hub.rotation.z = Math.PI / 2;
    hub.bakeCurrentTransformIntoVertices();
    hub.material = rimMat;
    hub.parent = tire;
    hub.isPickable = false;

    // Center chrome lug nut cap
    const centerCap = MeshBuilder.CreateCylinder(
      `${name}_cap`,
      {
        height: wheelWidth * widthScale * 1.14,
        diameter: wheelRadius * 0.42 * radiusScale,
        tessellation: 14,
      },
      scene
    );
    centerCap.rotation.z = Math.PI / 2;
    centerCap.bakeCurrentTransformIntoVertices();
    centerCap.material = chromeMat;
    centerCap.parent = tire;
    centerCap.isPickable = false;

    wheelMeshes.push(tire);
    return tire;
  };

  createWheelUnit(`wheelFL_${racerId}`, frontLeftPivot, Vector3.Zero(), 0.92, 0.92);
  createWheelUnit(`wheelFR_${racerId}`, frontRightPivot, Vector3.Zero(), 0.92, 0.92);

  const rearWheelScale = kart.dualRearTires ? 1.28 : 1.06;
  createWheelUnit(
    `wheelRL_${racerId}`,
    visualRoot,
    new Vector3(-rearX, wheelRadius * 1.05, rearZ),
    rearWheelScale,
    1.05
  );
  createWheelUnit(
    `wheelRR_${racerId}`,
    visualRoot,
    new Vector3(rearX, wheelRadius * 1.05, rearZ),
    rearWheelScale,
    1.05
  );

  // Particle Emitter Nodes
  const leftExhaustEmitter = new TransformNode(`leftExhaust_${racerId}`, scene);
  leftExhaustEmitter.parent = visualRoot;
  leftExhaustEmitter.position = new Vector3(-w * 0.22, 0.98, -l * 0.48);

  const rightExhaustEmitter = new TransformNode(`rightExhaust_${racerId}`, scene);
  rightExhaustEmitter.parent = visualRoot;
  rightExhaustEmitter.position = new Vector3(w * 0.22, 0.98, -l * 0.48);

  const leftRearWheelEmitter = new TransformNode(`leftRearEmitter_${racerId}`, scene);
  leftRearWheelEmitter.parent = visualRoot;
  leftRearWheelEmitter.position = new Vector3(-rearX, 0.18, rearZ - 0.15);

  const rightRearWheelEmitter = new TransformNode(`rightRearEmitter_${racerId}`, scene);
  rightRearWheelEmitter.parent = visualRoot;
  rightRearWheelEmitter.position = new Vector3(rearX, 0.18, rearZ - 0.15);

  const flareTex = getSharedFlareTexture(scene);
  const clodTex = getSharedClodTexture(scene);
  const grassBladeTex = getSharedGrassBladeTexture(scene);

  // 1. Multi-Stage Mini-Turbo Drift Spark ParticleSystems (Left & Right Rear Wheels)
  const createSparkSystem = (name: string, emitter: TransformNode) => {
    const ps = new ParticleSystem(name, 140, scene);
    ps.particleTexture = flareTex;
    ps.emitter = emitter as unknown as Mesh;
    ps.minEmitBox = new Vector3(-0.12, 0, -0.12);
    ps.maxEmitBox = new Vector3(0.12, 0.12, 0.12);
    ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
    ps.minLifeTime = 0.16;
    ps.maxLifeTime = 0.34;
    ps.emitRate = 0;
    ps.direction1 = new Vector3(-1.8, 1.5, -3.5);
    ps.direction2 = new Vector3(1.8, 3.2, -1.5);
    ps.minEmitPower = 2.8;
    ps.maxEmitPower = 6.2;
    ps.gravity = new Vector3(0, -9.8, 0);
    ps.start();
    return ps;
  };

  const leftDriftSparks = createSparkSystem(`sparksL_${racerId}`, leftRearWheelEmitter);
  const rightDriftSparks = createSparkSystem(`sparksR_${racerId}`, rightRearWheelEmitter);

  // 2. Twin Exhaust Flame Trail ParticleSystems (BLENDMODE_ONEONE)
  const createExhaustSystem = (name: string, emitter: TransformNode) => {
    const ps = new ParticleSystem(name, 90, scene);
    ps.particleTexture = flareTex;
    ps.emitter = emitter as unknown as Mesh;
    ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
    ps.color1 = new Color4(1.0, 0.55, 0.1, 1.0);
    ps.color2 = new Color4(1.0, 0.2, 0.6, 0.9);
    ps.colorDead = new Color4(0.2, 0.05, 0.0, 0.0);
    ps.minSize = 0.18;
    ps.maxSize = 0.44;
    ps.minLifeTime = 0.1;
    ps.maxLifeTime = 0.24;
    ps.emitRate = 0;
    ps.direction1 = new Vector3(-0.4, 0.2, -4.5);
    ps.direction2 = new Vector3(0.4, 0.8, -6.5);
    ps.minEmitPower = 3.0;
    ps.maxEmitPower = 6.0;
    ps.start();
    return ps;
  };

  const leftExhaustFlames = createExhaustSystem(`exhaustL_${racerId}`, leftExhaustEmitter);
  const rightExhaustFlames = createExhaustSystem(`exhaustR_${racerId}`, rightExhaustEmitter);

  // 3. Off-Road Dirt Clods & Shredded Grass Blades ParticleSystems (BLENDMODE_STANDARD)
  const createOffRoadSystem = (name: string, emitter: TransformNode) => {
    const ps = new ParticleSystem(name, 140, scene);
    ps.particleTexture = clodTex;
    ps.emitter = emitter as unknown as Mesh;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.color1 = new Color4(0.48, 0.34, 0.18, 0.95); // Brown dirt clods
    ps.color2 = new Color4(0.22, 0.62, 0.24, 0.95); // Green grass chunks
    ps.colorDead = new Color4(0.32, 0.24, 0.14, 0.0);
    ps.minSize = 0.16;
    ps.maxSize = 0.36;
    ps.minLifeTime = 0.25;
    ps.maxLifeTime = 0.52;
    ps.emitRate = 0;
    ps.direction1 = new Vector3(-1.6, 2.2, -3.2);
    ps.direction2 = new Vector3(1.6, 4.4, -1.2);
    ps.minEmitPower = 2.5;
    ps.maxEmitPower = 5.2;
    ps.gravity = new Vector3(0, -14.0, 0);
    ps.start();
    return ps;
  };

  const createGrassBladeSystem = (name: string, emitter: TransformNode) => {
    const ps = new ParticleSystem(name, 160, scene);
    ps.particleTexture = grassBladeTex;
    ps.emitter = emitter as unknown as Mesh;
    ps.minEmitBox = new Vector3(-0.22, -0.05, -0.25);
    ps.maxEmitBox = new Vector3(0.22, 0.1, 0.15);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.color1 = new Color4(0.18, 0.76, 0.22, 0.98); // Fresh ripped green grass
    ps.color2 = new Color4(0.42, 0.88, 0.26, 0.96); // Bright lime-green grass tips
    ps.colorDead = new Color4(0.25, 0.48, 0.16, 0.0);
    ps.minSize = 0.2;
    ps.maxSize = 0.44;
    ps.minLifeTime = 0.28;
    ps.maxLifeTime = 0.58;
    ps.minAngularSpeed = -9.0;
    ps.maxAngularSpeed = 9.0;
    ps.emitRate = 0;
    ps.direction1 = new Vector3(-1.8, 2.6, -3.8);
    ps.direction2 = new Vector3(1.8, 4.8, -1.0);
    ps.minEmitPower = 2.8;
    ps.maxEmitPower = 5.8;
    ps.gravity = new Vector3(0, -12.5, 0);
    ps.start();
    return ps;
  };

  const leftOffRoadDirt = createOffRoadSystem(`dirtL_${racerId}`, leftRearWheelEmitter);
  const rightOffRoadDirt = createOffRoadSystem(`dirtR_${racerId}`, rightRearWheelEmitter);
  const leftGrassBlades = createGrassBladeSystem(`grassL_${racerId}`, leftRearWheelEmitter);
  const rightGrassBlades = createGrassBladeSystem(`grassR_${racerId}`, rightRearWheelEmitter);

  // 4. Curb Micro-Sparks & High-Speed Pavement Heat Haze
  const curbAndHazeSystem = new ParticleSystem(`curbHaze_${racerId}`, 80, scene);
  curbAndHazeSystem.particleTexture = flareTex;
  curbAndHazeSystem.emitter = leftRearWheelEmitter as unknown as Mesh;
  curbAndHazeSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  curbAndHazeSystem.minSize = 0.12;
  curbAndHazeSystem.maxSize = 0.26;
  curbAndHazeSystem.minLifeTime = 0.12;
  curbAndHazeSystem.maxLifeTime = 0.26;
  curbAndHazeSystem.emitRate = 0;
  curbAndHazeSystem.start();

  // 5. Floating 3D Camera-Facing Human Player Nameplate Billboard (Mesh.BILLBOARDMODE_ALL)
  const nameplateMesh = MeshBuilder.CreatePlane(
    `nameplate_${racerId}`,
    { width: 3.6, height: 0.9 },
    scene
  );
  nameplateMesh.parent = kartRoot;
  nameplateMesh.position = new Vector3(0, 2.55, 0);
  nameplateMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  nameplateMesh.isPickable = false;
  nameplateMesh.setEnabled(false);

  const nameplateTex = new DynamicTexture(
    `nameplateTex_${racerId}`,
    { width: 512, height: 128 },
    scene,
    false
  );
  nameplateTex.hasAlpha = true;

  const nameplateMat = new StandardMaterial(`nameplateMat_${racerId}`, scene);
  nameplateMat.diffuseTexture = nameplateTex;
  nameplateMat.emissiveTexture = nameplateTex;
  nameplateMat.opacityTexture = nameplateTex;
  nameplateMat.emissiveColor = new Color3(1, 1, 1);
  nameplateMat.disableLighting = true;
  nameplateMat.backFaceCulling = false;
  nameplateMesh.material = nameplateMat;

  let lastRenderedName = "";
  let lastRenderedVisible: boolean | null = null;

  const updateNameplate: KartAssembly["updateNameplate"] = (
    displayName: string,
    visible: boolean
  ) => {
    const cleanName = (displayName || character.name).trim().slice(0, 18);
    if (visible !== lastRenderedVisible) {
      lastRenderedVisible = visible;
      nameplateMesh.setEnabled(visible);
    }
    if (!visible || cleanName === lastRenderedName) {
      return;
    }
    lastRenderedName = cleanName;

    const ctx =
      nameplateTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 128);

    // Draw high-contrast rounded pill background
    const padX = 28;
    const padY = 14;
    const boxW = 512 - padX * 2;
    const boxH = 82;
    const radius = 24;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(padX + radius, padY);
    ctx.lineTo(padX + boxW - radius, padY);
    ctx.quadraticCurveTo(padX + boxW, padY, padX + boxW, padY + radius);
    ctx.lineTo(padX + boxW, padY + boxH - radius);
    ctx.quadraticCurveTo(
      padX + boxW,
      padY + boxH,
      padX + boxW - radius,
      padY + boxH
    );
    // Downward pointer arrow at bottom center pointing to driver helmet
    ctx.lineTo(256 + 14, padY + boxH);
    ctx.lineTo(256, padY + boxH + 18);
    ctx.lineTo(256 - 14, padY + boxH);
    ctx.lineTo(padX + radius, padY + boxH);
    ctx.quadraticCurveTo(padX, padY + boxH, padX, padY + boxH - radius);
    ctx.lineTo(padX, padY + radius);
    ctx.quadraticCurveTo(padX, padY, padX + radius, padY);
    ctx.closePath();

    ctx.fillStyle = "rgba(8, 12, 24, 0.88)";
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = character.colors.badge || "#38bdf8";
    ctx.stroke();

    // Online human indicator dot
    ctx.beginPath();
    ctx.arc(padX + 34, padY + boxH / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#34d399";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Player callsign text (auto-fit font size for longer names)
    const fontSize = cleanName.length > 13 ? 34 : 40;
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.strokeText(cleanName, 272, padY + boxH / 2 + 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(cleanName, 272, padY + boxH / 2 + 2);
    ctx.restore();

    nameplateTex.update();
  };

  let rainbowTimer = 0;

  // 6. Visual-Only Tire Burnout Ground Streaks Pool (black rubber on pavement/curb; torn brown soil ruts on off-road grass)
  const burnoutTex = getSharedBurnoutTexture(scene);
  const burnoutMat = new StandardMaterial(`burnoutMat_${racerId}`, scene);
  burnoutMat.diffuseTexture = burnoutTex;
  burnoutMat.opacityTexture = burnoutTex;
  burnoutMat.diffuseColor = new Color3(0.06, 0.07, 0.09);
  burnoutMat.specularColor = new Color3(0.04, 0.04, 0.05);
  burnoutMat.zOffset = -2;
  burnoutMat.backFaceCulling = false;

  const dirtBurnoutTex = getSharedDirtBurnoutTexture(scene);
  const dirtBurnoutMat = new StandardMaterial(`dirtBurnoutMat_${racerId}`, scene);
  dirtBurnoutMat.diffuseTexture = dirtBurnoutTex;
  dirtBurnoutMat.opacityTexture = dirtBurnoutTex;
  dirtBurnoutMat.diffuseColor = new Color3(0.58, 0.38, 0.19);
  dirtBurnoutMat.emissiveColor = new Color3(0.2, 0.12, 0.05);
  dirtBurnoutMat.specularColor = new Color3(0.05, 0.04, 0.02);
  dirtBurnoutMat.zOffset = -2;
  dirtBurnoutMat.backFaceCulling = false;

  const BURNOUT_POOL_SIZE = 20;
  const burnoutStrips: Array<{ mesh: Mesh; age: number; active: boolean }> = [];
  for (let i = 0; i < BURNOUT_POOL_SIZE; i++) {
    const strip = MeshBuilder.CreateGround(
      `burnoutStrip_${racerId}_${i}`,
      { width: rearX * 2.55, height: 1.15 },
      scene
    );
    strip.material = burnoutMat;
    strip.isPickable = false;
    strip.setEnabled(false);
    burnoutStrips.push({ mesh: strip, age: 0, active: false });
  }
  let nextBurnoutIdx = 0;
  let lastBurnoutStampPos: Vector3 | null = null;

  const updateVisuals: KartAssembly["updateVisuals"] = ({
    dt,
    forwardSpeed,
    maxSpeed,
    steerInput,
    miniTurboTier,
    isDrifting,
    isBoosting,
    novaOverdriveActive,
    surface,
    grounded,
    isBurnoutActive = false,
  }) => {
    // 1. Steer front wheels around local Y (+/- 28 degrees = +/- 0.488 rad)
    const targetSteerAngle = steerInput * 0.488;
    frontLeftPivot.rotation.y += (targetSteerAngle - frontLeftPivot.rotation.y) * Math.min(1, dt * 14);
    frontRightPivot.rotation.y += (targetSteerAngle - frontRightPivot.rotation.y) * Math.min(1, dt * 14);

    // 2. Spin all 4 wheels around local X proportional to forward speed (rear tires spin rapidly during burnout launch)
    const effectiveSpinSpeed =
      isBurnoutActive && grounded
        ? Math.max(forwardSpeed, maxSpeed * 0.85)
        : forwardSpeed;
    const frontSpinDelta = (forwardSpeed / Math.max(0.25, wheelRadius)) * dt;
    const rearSpinDelta = (effectiveSpinSpeed / Math.max(0.25, wheelRadius)) * dt;
    wheelMeshes.forEach((wheel, idx) => {
      wheel.rotation.x += idx >= 2 ? rearSpinDelta : frontSpinDelta;
    });

    // Age and fade active tire burnout streaks on the ground
    for (const item of burnoutStrips) {
      if (!item.active) continue;
      item.age += dt;
      if (item.age >= 4.2) {
        item.active = false;
        item.mesh.setEnabled(false);
      } else if (item.age > 2.6) {
        item.mesh.visibility = Math.max(0, 0.88 * (1 - (item.age - 2.6) / 1.6));
      }
    }

    if (isBurnoutActive && grounded) {
      const yaw = kartRoot.rotation.y;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const rearAxlePos = new Vector3(
        kartRoot.position.x + fwdX * (rearZ - 0.12),
        kartRoot.position.y - 0.04,
        kartRoot.position.z + fwdZ * (rearZ - 0.12)
      );
      const shouldStamp =
        !lastBurnoutStampPos ||
        Vector3.DistanceSquared(rearAxlePos, lastBurnoutStampPos) >= 0.32 * 0.32;
      if (shouldStamp) {
        const entry = burnoutStrips[nextBurnoutIdx];
        nextBurnoutIdx = (nextBurnoutIdx + 1) % BURNOUT_POOL_SIZE;
        entry.active = true;
        entry.age = 0;
        entry.mesh.material =
          surface === "OFFROAD" ? dirtBurnoutMat : burnoutMat;
        entry.mesh.position.copyFrom(rearAxlePos);
        entry.mesh.rotation.x = visualRoot.rotation.x;
        entry.mesh.rotation.y = yaw + visualRoot.rotation.y * 0.35;
        entry.mesh.rotation.z = visualRoot.rotation.z;
        entry.mesh.visibility = surface === "OFFROAD" ? 0.94 : 0.88;
        entry.mesh.setEnabled(true);
        lastBurnoutStampPos = rearAxlePos.clone();
      }
    } else {
      lastBurnoutStampPos = null;
    }

    // 3. Configure Drift Smoke & Multi-Stage Spark ParticleSystem (Phase 0 Gray Smoke -> Tier 1 Blue -> Tier 2 Orange -> Tier 3 Purple)
    if (isDrifting && grounded) {
      for (const ps of [leftDriftSparks, rightDriftSparks]) {
        if (miniTurboTier === 0) {
          // Phase 0 / 1: Gray Smoke wisps beneath rear tires on initial drift slide
          ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
          ps.color1 = new Color4(0.76, 0.79, 0.84, 0.55);
          ps.color2 = new Color4(0.48, 0.52, 0.58, 0.36);
          ps.minSize = 0.18;
          ps.maxSize = 0.34;
          ps.emitRate = 48;
        } else if (miniTurboTier === 1) {
          // Stage 1 (1x Outside->Inside pump or >= 1.0s): Electric Blue Sparks
          ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
          ps.color1 = new Color4(0.15, 0.72, 1.0, 1.0);
          ps.color2 = new Color4(0.45, 0.92, 1.0, 1.0);
          ps.minSize = 0.18;
          ps.maxSize = 0.32;
          ps.emitRate = 75;
        } else if (miniTurboTier === 2) {
          // Stage 2 (2x Outside->Inside pump or >= 2.2s): Continuous Fiery Orange-Red Sparks
          ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
          ps.color1 = new Color4(1.0, 0.45, 0.08, 1.0);
          ps.color2 = new Color4(1.0, 0.82, 0.18, 1.0);
          ps.minSize = 0.24;
          ps.maxSize = 0.46;
          ps.emitRate = 105;
        } else {
          // Stage 3 (>= 3.6s corner hold): Intense Purple/Magenta Sparks
          ps.blendMode = ParticleSystem.BLENDMODE_ONEONE;
          ps.color1 = new Color4(0.88, 0.18, 1.0, 1.0);
          ps.color2 = new Color4(1.0, 0.45, 0.92, 1.0);
          ps.minSize = 0.3;
          ps.maxSize = 0.55;
          ps.emitRate = 135;
        }
      }
    } else {
      leftDriftSparks.emitRate = 0;
      rightDriftSparks.emitRate = 0;
    }

    // 4. Twin Exhaust Flame Trails (active on Tier 2/3 flaming drift charge, Mini-Turbo burst, Nitro Core, Nova Overdrive)
    const isFlamingDriftCharge = isDrifting && grounded && miniTurboTier >= 2;
    const flameRate =
      isBoosting || novaOverdriveActive
        ? 115
        : miniTurboTier === 3 && isFlamingDriftCharge
        ? 95
        : isFlamingDriftCharge
        ? 65
        : 0;
    for (const ps of [leftExhaustFlames, rightExhaustFlames]) {
      if (isBoosting || novaOverdriveActive) {
        ps.minSize = 0.24;
        ps.maxSize = 0.54;
      } else {
        ps.minSize = 0.18;
        ps.maxSize = 0.44;
      }
      ps.emitRate = flameRate;
    }

    // 5. Off-Road Dirt Clods & Ripped-Up Grass Blades OR Shallow Lagoon Water Spray
    if (
      grounded &&
      surface === "SHALLOW_WATER" &&
      (isBurnoutActive || Math.abs(forwardSpeed) > 2.5)
    ) {
      const splashRate = isBurnoutActive
        ? 135
        : Math.min(125, Math.abs(forwardSpeed) * 3.8);
      for (const ps of [leftOffRoadDirt, rightOffRoadDirt]) {
        ps.color1 = new Color4(0.18, 0.88, 0.98, 0.92); // Bright cyan lagoon splash
        ps.color2 = new Color4(0.92, 0.98, 1.0, 0.95); // White seafoam droplets
        ps.colorDead = new Color4(0.12, 0.65, 0.85, 0.0);
        ps.emitRate = splashRate;
      }
      leftGrassBlades.emitRate = 0;
      rightGrassBlades.emitRate = 0;
    } else if (
      grounded &&
      surface === "OFFROAD" &&
      (isBurnoutActive || Math.abs(forwardSpeed) > 3.0)
    ) {
      const dirtRate = isBurnoutActive
        ? 125
        : Math.min(110, Math.abs(forwardSpeed) * 3.5);
      const grassBladeRate = isBurnoutActive
        ? 145
        : Math.min(85, Math.abs(forwardSpeed) * 2.6);
      for (const ps of [leftOffRoadDirt, rightOffRoadDirt]) {
        ps.color1 = new Color4(0.48, 0.34, 0.18, 0.95); // Brown dirt clods
        ps.color2 = new Color4(0.22, 0.62, 0.24, 0.95); // Green grass chunks
        ps.colorDead = new Color4(0.32, 0.24, 0.14, 0.0);
        ps.emitRate = dirtRate;
      }
      leftGrassBlades.emitRate = grassBladeRate;
      rightGrassBlades.emitRate = grassBladeRate;
    } else {
      leftOffRoadDirt.emitRate = 0;
      rightOffRoadDirt.emitRate = 0;
      leftGrassBlades.emitRate = 0;
      rightGrassBlades.emitRate = 0;
    }

    // 6. Curb Micro-Sparks, Burnout Tire Smoke / Turf Dust / Water Mist & Pavement Heat Haze
    if (isBurnoutActive && grounded) {
      if (surface === "SHALLOW_WATER") {
        curbAndHazeSystem.color1 = new Color4(0.35, 0.92, 1.0, 0.72);
        curbAndHazeSystem.color2 = new Color4(0.95, 0.99, 1.0, 0.65);
        curbAndHazeSystem.emitRate = 85;
      } else if (surface === "OFFROAD") {
        curbAndHazeSystem.color1 = new Color4(0.54, 0.36, 0.18, 0.62);
        curbAndHazeSystem.color2 = new Color4(0.24, 0.68, 0.22, 0.52);
        curbAndHazeSystem.emitRate = 75;
      } else {
        curbAndHazeSystem.color1 = new Color4(0.86, 0.89, 0.94, 0.52);
        curbAndHazeSystem.color2 = new Color4(0.55, 0.58, 0.64, 0.35);
        curbAndHazeSystem.emitRate = 60;
      }
    } else if (
      grounded &&
      surface === "SHALLOW_WATER" &&
      Math.abs(forwardSpeed) > 6.0
    ) {
      curbAndHazeSystem.color1 = new Color4(0.45, 0.94, 1.0, 0.55);
      curbAndHazeSystem.color2 = new Color4(0.95, 0.99, 1.0, 0.45);
      curbAndHazeSystem.emitRate = 52;
    } else if (grounded && surface === "CURB" && Math.abs(forwardSpeed) > 8.0) {
      curbAndHazeSystem.color1 = new Color4(1.0, 0.25, 0.25, 0.9);
      curbAndHazeSystem.color2 = new Color4(1.0, 1.0, 1.0, 0.9);
      curbAndHazeSystem.emitRate = 45;
    } else if (
      grounded &&
      surface === "PAVEMENT" &&
      Math.abs(forwardSpeed) > maxSpeed * 0.82
    ) {
      curbAndHazeSystem.color1 = new Color4(0.28, 0.3, 0.34, 0.35);
      curbAndHazeSystem.color2 = new Color4(0.18, 0.2, 0.24, 0.22);
      curbAndHazeSystem.emitRate = 24;
    } else {
      curbAndHazeSystem.emitRate = 0;
    }

    // 7. Nova Overdrive cyclic gold/rainbow emissive shader flash
    if (novaOverdriveActive) {
      rainbowTimer += dt * 10;
      const r = 0.5 + 0.5 * Math.sin(rainbowTimer);
      const g = 0.5 + 0.5 * Math.sin(rainbowTimer + 2.09);
      const b = 0.5 + 0.5 * Math.sin(rainbowTimer + 4.18);
      primaryMat.emissiveColor = new Color3(r * 0.85, g * 0.75, b * 0.35);
      secondaryMat.emissiveColor = new Color3(0.95, 0.8, 0.2);
    } else {
      primaryMat.emissiveColor = Color3.Black();
      secondaryMat.emissiveColor = Color3.Black();
    }
  };

  const dispose = () => {
    leftDriftSparks.dispose();
    rightDriftSparks.dispose();
    leftExhaustFlames.dispose();
    rightExhaustFlames.dispose();
    leftOffRoadDirt.dispose();
    rightOffRoadDirt.dispose();
    leftGrassBlades.dispose();
    rightGrassBlades.dispose();
    curbAndHazeSystem.dispose();
    for (const item of burnoutStrips) {
      item.mesh.dispose();
    }
    burnoutMat.dispose();
    dirtBurnoutMat.dispose();
    nameplateMesh.dispose();
    nameplateMat.dispose();
    nameplateTex.dispose();
    kartRoot.dispose();
  };

  return {
    kartRoot,
    visualRoot,
    mergedChassisMesh,
    chassisMaterials,
    frontLeftPivot,
    frontRightPivot,
    wheelMeshes,
    leftExhaustEmitter,
    rightExhaustEmitter,
    leftRearWheelEmitter,
    rightRearWheelEmitter,
    updateNameplate,
    updateVisuals,
    dispose,
  };
}
