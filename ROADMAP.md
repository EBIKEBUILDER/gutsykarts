# Gutsy Karts — Open-Source Procedural Architecture & Feature Roadmap

**Gutsy Karts** is an open-source, browser-native 3D arcade kart racer built with **Next.js**, **TypeScript**, **Tailwind CSS**, and **Babylon.js** (`@babylonjs/core`). Because all tracks, terrain topologies, karts, drivers, power-ups, particles, and audio are synthesized **100% procedurally at runtime** from mathematical splines and parametric rules rather than static binary assets, the unit of content distribution shifts from multi-megabyte 3D archives to kilobyte-scale instruction sets.

This document defines the architectural blueprint, feature evaluation matrix, and phased implementation roadmap for expanding **Gutsy Karts** into a full user-generated content (UGC) and competitive online racing ecosystem.

---

## 1. Core Architectural Paradigm: Procedural WebGL vs. Traditional Asset Pipelines

| Architectural Dimension | Legacy External-Model Pipeline | Pre-Built Modular Piece Studios | Gutsy Karts Procedural Spline Architecture |
| :--- | :--- | :--- | :--- |
| **Geometry & Asset Creation** | External 3D modeling; manual UV unwrapping and texture baking. | Pre-built modular track blocks; proprietary platform lock-in. | Runtime procedural synthesis in [`TrackBuilder.ts`](./src/game/world/TrackBuilder.ts) and [`KartMeshFactory.ts`](./src/game/entities/KartMeshFactory.ts) via `Curve3`, `Path3D`, `MeshBuilder`, and `DynamicTexture`. |
| **Collision & AI Routing** | Separate collision mesh exports and manual checkpoint authoring. | Automated along snapped modular pieces. | Derived mathematically from `Path3D` Frenet frames (`getTangents()`, `getNormals()`, `getBinormals()`) and continuous spline samples. |
| **Payload Size & Format** | Tens to hundreds of megabytes of binary models and textures. | Multi-megabyte save files hosted on centralized servers. | Lightweight JSON or compressed binary parametric payloads (`1.5 KB` to `25 KB`) storable in `localStorage` or shareable URLs. |
| **Multiplayer Distribution** | Pre-installed monolithic track packs before launching. | Asynchronous download from central repository prior to lobby launch. | Instantaneous on-join packet streaming (`WELCOME_SNAPSHOT`) from Host to peers via WebRTC `RTCDataChannel` or Supabase Realtime Broadcast in [`MultiplayerManager.ts`](./src/game/network/MultiplayerManager.ts). |
| **Access & Onboarding Friction** | High; requires external tools and manual file management. | Moderate; requires dedicated hardware and installs. | Near-zero; instant browser execution via shared web URL with full offline/online parity and mobile multi-touch controls. |

---

## 2. Track Networking, Validation & The Community Gallery

### 2.1 Ad-Hoc Host-to-Peer Streaming (Implemented Foundation + Binary Compression)
When a player designs a custom circuit in [`TrackEditor.tsx`](./src/components/TrackEditor.tsx) and hosts an online room, invited participants do not need the track to exist in a central database prior to joining:
- [`MultiplayerManager.ts`](./src/game/network/MultiplayerManager.ts) already transmits the host's [`CustomTrackDefinition`](./src/types/game.ts) inside `WELCOME_SNAPSHOT` over the reliable ordered `RTCDataChannel` (with automatic fallback to Supabase Realtime Broadcast or local `BroadcastChannel`).
- **Planned Upgrade**: Quantize spline control node coordinates (`x, y, z`), banking angles, width scalars, and terrain brush modifiers into a compact binary schema compressed via `CompressionStream('deflate-raw')` + Base64URL, plus a deterministic checkpoint coordinate hash so all peers verify identical track synthesis prior to green-flag launch.

### 2.2 Baseline-Kart Track Validation & Anti-Softlock Protocol
Before a creator exports a Verified Challenge Link or submits a `localStorage` track to the public community gallery, the engine enforces a two-stage validation protocol:
1. **Standardized Baseline Drive ("The Cul-de-Sac Clunker")**: The creator must complete a continuous 3-lap, itemless validation run in a standardized baseline loadout. This proves all elevation crests, stunt jump ramps, and road transitions are physically navigable without relying on power-up boosts.
2. **Author Medal & AI Racing Line Harvesting**:
   - The creator's validation finish time becomes the embedded **Author Medal** benchmark, with **Gold (`+6%`)**, **Silver (`+15%`)**, and **Bronze (`+28%`)** thresholds derived automatically.
   - Recording the creator's validation spline trajectory automatically harvests an optimal driving line (including custom off-road shortcut cuts), feeding [`KartController.computeAiInputs`](./src/game/physics/KartController.ts) and [`AiBrainTrainer.ts`](./src/game/ai/AiBrainTrainer.ts) so offline and lobby-filler AI bots navigate custom layouts immediately.

### 2.3 Community Taxonomy, Curated Cups & Dynamic Obstacle Tuning
- **Track Style Tags**: Classify courses by driving discipline:
  - `TECH`: Tight corners requiring rapid 5-phase manual powerslide alternation and throttle control.
  - `FULLSPEED`: Flowing high-speed sweepers and banked curves.
  - `GAUNTLET`: High-hazard precision obstacle courses.
  - `NITRO_CUT`: Layouts built around high-commitment off-road grass/dirt gap cuts using **Nitro Cores** or **Ultra Mini-Turbos**.
  - `ENDURANCE`: Multi-minute high-lap circuits (e.g., *Cul-de-Sac Scramble* high-density short-track marathons).
- **Dynamic Obstacle Behavior Sliders**: Extend [`PlacedObstacle`](./src/types/game.ts) in [`TrackEditor.tsx`](./src/components/TrackEditor.tsx) with parametric sliders for lateral oscillation amplitude, patrol frequency, and initial phase offset—serialized as lightweight floats.
- **Curated Custom Cups**: Allow players to bundle 4 to 16 community tracks into shareable [`GrandPrixCupDefinition`](./src/types/game.ts) playlists with custom engine speed classes and item rulesets.

---

## 3. Parametric Driver & Kart Studio

### 3.1 Hierarchical Parametric Sockets & Procedural Shaders
To avoid topological clipping when customizing racers and karts, [`KartMeshFactory.ts`](./src/game/entities/KartMeshFactory.ts) expands into an interactive **Parametric Garage Studio**:
- **Surface-Normal & TransformNode Sockets**: Accessories (spoilers, twin-turbo manifolds, spiked bumpers, roll cages, helmets, visors) attach to parented `TransformNode` sockets that automatically translate and scale with chassis dimensions.
- **Unified Procedural Material Finishes**: Expose Babylon.js `StandardMaterial` presets across every sub-mesh—toggling between **Matte Rubber**, **Anodized Aluminum**, **Pearlescent Enamel**, and **Glowing Neon Emissive**—paired with 100% procedural Canvas 2D vector emblems rendered into `DynamicTexture` (zero external `.svg` or bitmap files).

### 3.2 Competitive Integrity: Wireframe Weight Bounds & Archetype Matrix
To prevent decorative geometry from distorting physics hitboxes, collision volumes remain strictly decoupled from visual extrusions and governed by the 4 core weight classes and **The Juggernaut Law ($\gamma = 3.0$)** in [`KartPhysics.ts`](./src/game/physics/KartPhysics.ts):

| Archetype / Weight Class | Base Mass | Top Speed | Acceleration | Handling & Drift | Off-Road Traction | Boost / Mini-Turbo | Procedural Visual Cue |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Featherweight (`FEATHERWEIGHT`)** | `50 kg` | Low-Mod | Maximum | Razor-Sharp | Moderate | High Duration | Compact wheelbase, exposed tubular frame. |
| **Technical Drifter (`TECHNICAL`)** | `85 kg` | Moderate | High | High Slip-Angle | Low-Mod | Fast Charge (`+15%`) | Low camber, wide rear slicks, multi-plane wing. |
| **Balanced All-Round (`BALANCED`)** | `120 kg` | Mod-High | Moderate | Balanced | Moderate | Balanced | Classic street coupe proportions, even weight. |
| **Super Heavy Juggernaut (`SUPER_HEAVY`)** | `220 kg` | Maximum | Low | Wide Radius | Moderate | High Exit Surge | Reinforced spiked bumper, dual rear tires, heavy rig. |

- **Wireframe Bounding Box Preview**: The Garage Studio renders a translucent 3D wireframe cylinder showing the active weight class's exact physics collision boundary.
- **Between-Race Lobby Hot-Swap**: Integrate a between-race garage selector in [`RaceGame.tsx`](./src/components/RaceGame.tsx) powered by [`KartController.swapRacerIdentity`](./src/game/physics/KartController.ts) so players can counter-pick chassis and weight classes for the upcoming track's surface mix.

---

## 4. Competitive & Asynchronous Online Systems

### 4.1 Zero-Friction URL Ghost Challenges & Deterministic Verification
- **Fixed-Tick Input Recording**: Rather than recording 60Hz 3D coordinates, record quantized [`ControlInputState`](./src/types/game.ts) frames (`throttle`, `brake`, `steer`, `driftHeld`, `hopJustPressed`, `useItemJustPressed`) stepped through [`KartPhysics.ts`](./src/game/physics/KartPhysics.ts) at a fixed `dt = 1/60s`.
- **1-Click Shareable Challenge URLs**: Compress a 3-lap input stream (`< 1.5 KB`) alongside the track identifier or custom spline payload into a single URL (`?challenge=...`). Opening the link boots directly onto the starting grid with the challenger's translucent procedural ghost and a live **Input Telemetry HUD Overlay** (visualizing the rival's steering, hop, and 5-phase drift pumping inputs).
- **Headless Deterministic Verification**: Because [`KartPhysics.ts`](./src/game/physics/KartPhysics.ts) is pure TypeScript math with zero WebGL/DOM dependencies, a lightweight Next.js API route can replay submitted input streams headlessly in `< 50ms` to certify leaderboard records against tampering.

### 4.2 Daily Cul-de-Sac Challenge & Knockout Elimination
- **24-Hour Daily Challenge**: Resets daily at `00:00 UTC` using a date-seeded PRNG. Every player competes on the exact same procedural circuit with a locked character/kart loadout, random item boxes disabled, and strictly **3 Nitro Cores** (`+45%` speed + off-road immunity) to spend on strategic corner cuts.
- **Knockout Elimination Mode**: After a warm-up lap, the lowest-ranking racer at the end of each lap is eliminated and seamlessly transitions into the built-in **Live Spectator Camera** (`isSpectating` in [`RaceGame.tsx`](./src/components/RaceGame.tsx)) until a single winner remains.

---

## 5. Novel Multiplayer Modes & Co-Op Mechanics

### 5.1 Online Tandem Crew Mode (2 Players per Kart — 8 Players Across 4 Karts)
Dual-rider cooperative racing allows a 4-kart physics simulation to support up to **8 human players** (or 4 players in a 2v2 team duel) without increasing networked vehicle physics bodies:
- **Front Driver**: Controls steering, throttle, braking, and 5-phase manual powerslide drift charging.
- **Backseat Scrapper**: Manages dual power-up slots (`Nitro Cores`, `Ricochet Discs`, `Pulse Seekers`, `Cryo Mines`, `Lil' Saucers`, `Glitch Prisms`), 360-degree projectile aiming, and physical defense.
- **Synchronized Tandem Launch**: If both the Driver and Backseat Scrapper hit throttle on the green-flag window, the kart triggers a high-output **Tandem Overclock Launch**.
- **Mid-Race Seat Swap & Lateral Slide-Steal**: Pressing the swap input simultaneously rotates Driver and Scrapper roles mid-race. When empty-handed, the Backseat Scrapper can trigger left/right **Lateral Slide Checks** that bodycheck adjacent karts, disrupt their yaw, and swipe their held power-up.

### 5.2 High-Intensity 4-to-8 Player Party & Tactical Modes

| Game Mode | Core Mechanical Loop | Player Count | Procedural Engine Synergy |
| :--- | :--- | :---: | :--- |
| **Countdown Mode** | Racers start with a `3:00` clock. Crossing the line after Lap 3 does not end the race; hitting rivals with power-ups or Juggernaut knockbacks adds bonus seconds. Winner is maximum `totalProgressDistance` before time expires. | 4–8 Players | Keeps 4-kart lobbies tightly grouped; isolated front-running cannot farm combat time extensions. |
| **Item Rain** | Standard item rows are supplemented or replaced by continuous waves of power-ups (**Nitro Cores**, **Ricochet Discs**, **Cryo Mines**, **Nova Overdrive Cores**) raining onto the road ahead of the pack. | 4–8 Players | `Path3D` spline surface normals allow the Host to spawn falling power-ups deterministically along the asphalt ribbon. |
| **200cc Overclock & Brake-Drifting** | Engine physics and projectile velocities scale by `1.35x–1.5x`, requiring **Brake-Drifting** (tapping brake while holding `DRIFT_ACTIVE` to tighten cornering radius without dropping spark charge). | 1–8 Players | Toggles dynamically on any built-in or user-generated circuit without re-authoring geometry. |
| **Endurance Overtake** | 10-to-30 lap overtake challenge starting at the back of a grid populated by recorded validation ghost clones. | 1–8 Players | Uses lightweight deterministic ghost playback with zero extra network bandwidth. |
| **Tactical Escalation (Optional Ruleset)** | Collecting consecutive item prisms upgrades held weapons across 3 tiers (**Level 1 $\rightarrow$ Level 2 $\rightarrow$ Level 3** for **Pulse Seekers**, **Ricochet Discs**, **Nitro Cores**, and **EMP Bolts**) paired with a unified drift-fed Boost & Energy Shield meter. | 1–8 Players | Offered as an optional lobby toggle alongside Classic Rank-Weighted Roulette. |

### 5.3 Real-Time Collaborative Track Editor & Replay Media Studio
- **Live Co-Op Spline Editing**: Synchronize [`CustomTrackDefinition`](./src/types/game.ts) edits across connected peers in [`TrackEditor.tsx`](./src/components/TrackEditor.tsx) over WebRTC `RTCDataChannel` so one player adjusts spline elevation/banking while another sculpts terrain hills and a third test-drives a live kart on the updating ribbon.
- **In-Browser Replay Studio**: Import multiple deterministic ghost runs onto a shared timeline, attach spline-tangent camera keyframes or free orbital cameras with `0.1x–2.0x` slow-motion controls, and export WebM highlight clips via native browser `MediaRecorder`.

---

## 6. Feature Evaluation & Prioritization Matrix

| # | Feature / System | Player Value | Eng. Effort | Codebase Fit | Priority |
| :-: | :--- | :---: | :---: | :--- | :---: |
| **1** | **Deterministic Input Recorder, Ghost Runner & Telemetry HUD** | High | Med | Pure TS [`KartPhysics.ts`](./src/game/physics/KartPhysics.ts) at fixed `1/60s` tick. | **P0** |
| **2** | **1-Click Compressed URL Track + Ghost Challenge Links** | High | Low | `CompressionStream` + Base64URL on [`CustomTrackDefinition`](./src/types/game.ts). | **P0** |
| **3** | **Baseline Kart Validation, Author Medals & AI Line Harvesting** | High | Low | Feeds creator ghost trajectory directly into AI lookahead. | **P0** |
| **4** | **200cc Overclock Engine Class & Brake-Drifting** | High | Low | `< 100` LOC in [`KartPhysics.ts`](./src/game/physics/KartPhysics.ts) & [`KartController.ts`](./src/game/physics/KartController.ts). | **P0** |
| **5** | **Midnight-UTC Daily Challenge (Fixed Loadout + 3 Nitro Cores)** | High | Low | Date-seeded PRNG + headless Next.js API replay verifier. | **P1** |
| **6** | **Between-Race Lobby Character/Kart Hot-Swap Picker** | High | Low | Reuses [`KartController.swapRacerIdentity`](./src/game/physics/KartController.ts). | **P1** |
| **7** | **Spline Banking, Variable Road Width & Oscillating Obstacles** | High | Med | Backward-compatible extension to [`TrackBuilder.ts`](./src/game/world/TrackBuilder.ts). | **P1** |
| **8** | **Compact Lobby Modes: Countdown, Item Rain & Knockout** | High | Low | Extends [`ItemManager.ts`](./src/game/items/ItemManager.ts) & existing spectator camera. | **P1** |
| **9** | **Parametric Garage Studio (Sockets, Finishes, Vector Decals)** | High | Med | Extends [`KartMeshFactory.ts`](./src/game/entities/KartMeshFactory.ts) & `DynamicTexture`. | **P2** |
| **10** | **Replay Media Studio (Multi-Ghost Timeline & WebM Export)** | Med | Med | Builds atop P0 Ghost Runner + `canvas.captureStream(60)`. | **P2** |
| **11** | **Tandem Crew Co-Op Mode (2 Players per Kart / 8-Player Lobbies)** | Med | High | Multiplexes Driver + Backseat Scrapper inputs per slot. | **P3** |
| **12** | **Live Multi-Peer Collaborative Track Editor & 3-Tier Escalation** | Med | High | Debounced ribbon rebuilds over WebRTC DataChannels. | **P3** |

---

## 7. Phased Implementation Plan (Requirements, Walls & Acceptance Criteria)

### Phase 1: Deterministic Ghosts, URL Challenge Links & 200cc Overclock (P0)
- **Requirements**:
  1. Record quantized [`ControlInputState`](./src/types/game.ts) frames at a deterministic 60Hz physics step and render a translucent procedural ghost kart with a live steering/drift telemetry HUD widget.
  2. Encode [`CustomTrackDefinition`](./src/types/game.ts) + challenger ghost inputs into a compressed Base64URL query parameter (`?challenge=...`).
  3. Enforce a 3-lap itemless baseline-kart validation run to lock in Author/Gold/Silver/Bronze medal thresholds and harvest the author's spline racing line for AI bots.
  4. Add `150cc Standard` / `200cc Overclock` speed classes and **Brake-Drifting** (tapping brake while in `DRIFT_ACTIVE` tightens turn radius without resetting `driftChargeSubState`).
- **Walls**:
  - Do NOT add external Wasm physics libraries; keep [`KartPhysics.ts`](./src/game/physics/KartPhysics.ts) as the single source of truth.
  - Keep standard 25-node track + ghost URLs under `2,048` characters.
- **Observable Acceptance Criteria**:
  - Opening a shared `?challenge=` URL boots directly onto the custom track starting grid with the challenger's ghost and input telemetry overlay active.
  - AI bots follow the creator's validated off-road shortcut line within `2.5m`.
  - Tapping brake mid-drift in `200cc Overclock` tightens the cornering arc while preserving active blue/orange spark charging.

### Phase 2: Daily Challenge, Dynamic Splines & 4-Slot Party Modes (P1)
- **Requirements**:
  1. Launch the 24-hour **Daily Cul-de-Sac Challenge** (`00:00 UTC` seed, locked driver/kart, item boxes disabled, 3 **Nitro Cores**) with headless API replay verification.
  2. Add per-node banking angle and width scalars to [`TrackBuilder.ts`](./src/game/world/TrackBuilder.ts) plus dynamic oscillation sliders to obstacles in [`TrackEditor.tsx`](./src/components/TrackEditor.tsx).
  3. Add between-race Character/Kart hot-swap in Cups and online lobbies.
  4. Add **Countdown Mode**, **Item Rain**, and **Knockout Elimination** rulesets.
- **Walls**:
  - Existing saved `localStorage` tracks without banking/width/oscillation fields must load without migration errors.
  - Headless replay verification must execute in `< 50ms` in Node/Edge without WebGL/DOM imports.
- **Observable Acceptance Criteria**:
  - Two browsers opening the Daily Challenge on the same UTC date load the identical circuit, loadout, and 3-Nitro inventory.
  - Last-place finishers each lap in Knockout Mode transition cleanly into Spectator Camera while remaining racers continue.

### Phase 3: Parametric Garage Studio & Replay Cinema (P2)
- **Requirements**:
  1. Build the **Parametric Garage Studio** with parented `TransformNode` accessory sockets, procedural material finishes, Canvas 2D vector emblems on `DynamicTexture`, point-buy [`KartStatModifiers`](./src/types/game.ts), and a 3D wireframe weight-class hitbox overlay.
  2. Build the **Replay Media Studio** with multi-ghost comparison, spline-tangent camera keyframes, `0.1x–2.0x` playback speed, and WebM video export.
- **Walls**:
  - Zero external `.glb`, `.svg`, or image files.
  - Decorative chassis extrusions must never alter the physics collision cylinder or Juggernaut mass dominance math.
- **Observable Acceptance Criteria**:
  - Custom studio karts serialize in `< 256 bytes` inside [`RoomPeerEntry`](./src/types/game.ts) and render identically across all connected peers during mid-race hot-join.

### Phase 4: Tandem Crew Co-Op & Live Collaborative Sandbox (P3)
- **Requirements**:
  1. Implement **Tandem Crew Co-Op** (Front Driver + Backseat Scrapper) supporting up to 8 human players across 4 physics karts, including dual item slots, synchronized **Tandem Overclock Launch**, mid-race seat swapping, and lateral slide-check item steals.
  2. Synchronize live multi-peer track editing in [`TrackEditor.tsx`](./src/components/TrackEditor.tsx) with simultaneous live kart test-driving.
  3. Add optional **3-Tier Tactical Weapon Escalation** and unified Boost/Shield energy meter ruleset.
- **Walls**:
  - Maintain a 60Hz render loop during collaborative spline editing via debounced ribbon rebuilds.
- **Observable Acceptance Criteria**:
  - Two players paired into `Slot 0` can execute a synchronized start boost, swap Driver/Scrapper seats mid-race, and side-check an adjacent kart to steal its held power-up.
