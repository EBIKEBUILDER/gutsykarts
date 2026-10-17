# AGENTS.md - Gutsy Karts

Skills-first project setup (standard as of Oct 2026).

- Briefs are requirements + walls + observable acceptance criteria, never how-to.
- Propose -> he approves -> bounded edits. Unasked work is a defect.
- Commit identity: EBIKEBUILDER <ebikebuilder@protonmail.com>
- Never commit/push without his explicit word.
- Devlog: publish:false default, time-capsule style.
- IP: Gutsy Karts original open-source suburban kart racer universe. Zero external proprietary IP in code or copy.

## Project Architecture & Invariants: Gutsy Karts 3D (Next.js + Babylon.js)

### 1. Core Stack & Module Constraints
- **Framework**: Next.js (App Router, TypeScript, Tailwind CSS) + `@babylonjs/core` (ES6 modular imports only) + `lucide-react` (for HUD icons).
- **SSR Safety**: All Babylon.js components and canvas hooks MUST use `"use client"` and instantiate `Engine` / `Scene` strictly inside `useEffect` with proper `scene.dispose()` and `engine.dispose()` cleanup.
- **Zero External Binary Assets**: NEVER import external `.glb`, `.gltf`, `.obj`, `.babylon`, or external image texture URLs that could 404. All 3D karts, characters, tracks, trees, item boxes, and projectiles MUST be generated procedurally via `MeshBuilder`, `Curve3`, `Path3D`, `StandardMaterial`, `DynamicTexture`, and `ParticleSystem`.
- **HUD Telemetry Throttling**: Decouple the 60Hz Babylon.js physics loop (`src/game/physics/KartController.ts`) from React HUD state (`src/components/RaceGame.tsx`). Throttle React state updates to 10–15Hz or bind high-frequency telemetry via `useRef`.

### 2. Physics & Asymmetric Mass Invariants (CRITICAL)
- Do NOT use Havok, Cannon, or Ammo `RaycastVehicle`. Implement the custom Kinematic-Dynamic Arcade Kart Controller in `src/game/physics/KartPhysics.ts` and `src/game/physics/KartController.ts`.
- **Delta Time Clamping**: Always clamp frame delta time `dt = Math.min(engine.getDeltaTime() / 1000, 0.05)`.
- **Asymmetric Kart-to-Kart Collision ("The Juggernaut vs. Featherweight Law")**:
  - Every kart has an explicit `mass` property (Super Heavyweight = 220, Balanced = 120, Technical = 85, Featherweight = 50; Nova Overdrive active = 9999).
  - On collision between Kart A and Kart B, compute cubic mass dominance ($\gamma = 3.0$):
    - `alphaA = Math.pow(massB, 3) / (Math.pow(massA, 3) + Math.pow(massB, 3))`
    - `alphaB = Math.pow(massA, 3) / (Math.pow(massA, 3) + Math.pow(massB, 3))`
  - Separate overlapping positions immediately using `alphaA` and `alphaB`.
  - If `massB - massA >= 40` (or `massB > massA * 1.3`), Kart B is an **UNBUDGEABLE JUGGERNAUT**: Kart B suffers `< 3%` velocity perturbation regardless of how fast Kart A was moving, while Kart A's velocity reflects off the collision normal and receives a strong outward knockback impulse scaled by `Math.max(relSpeed, 18) * alphaA * (massB / massA)` plus a vertical hop (`vy = 4.5`) and `0.35s` yaw wobble stun.

### 3. Track, Terrain, Hop-Drift & Mobile Control Invariants
- **Track Geometry**: Closed-loop `Curve3.CreateCatmullRomSpline(controlPoints, 25, true)` passed to `Path3D`. Use `Path3D` Frenet frames (`getTangents()`, `getNormals()`, `getBinormals()`, `getDistances()`) to generate `MeshBuilder.CreateRibbon` for the asphalt road (`closePath: true`, `roadHalfWidth = 9`) and alternating red/white rumble strip curbs (`curbWidth = roadHalfWidth + 1.2`).
- **Terrain Classification**: Cast downward ray (`Ray`) for vertical suspension and slope normal alignment, and compute horizontal distance `distToCenter` from kart to nearest `Path3D` spline sample:
  - **Asphalt Pavement (`distToCenter <= roadHalfWidth`)**: 100% top speed (`1.0x`), high grip (`0.92`), subtle tire heat haze at high speed.
  - **Rumble Strip Curb (`roadHalfWidth < distToCenter <= curbWidth`)**: 98% top speed (`0.98x`), grip (`0.88`), red/white micro-sparks and subtle camera vertical jitter.
  - **Off-Road Grass/Dirt (`distToCenter > curbWidth`)**: Unless Nitro Core or Nova Overdrive is active, clamp max speed to 55% (`0.55x`), apply strong linear drag (`4.5 s^-1`), reduce lateral grip to `0.45`, and emit brown dirt clods and green grass blades from rear wheels (`BLENDMODE_STANDARD`).
- **Hop & Drift System**: Pressing and holding Jump/Hop (`Shift`, `Space`, or mobile Jump/Drift button) triggers an upward vertical hop (`vy = 6.5` for `0.18s`). Holding the Jump/Hop button while steering locks the kart into `DRIFT_ACTIVE` upon landing (`+/- 22 deg` inward slip angle, counter-steer radius control) and charges Mini-Turbo tiers (`1.0s` = Electric Blue sparks / `+25%` for `0.8s`; `2.2s` = Fiery Orange sparks / `+40%` for `1.5s`; `3.6s` = Purple/Magenta sparks + exhaust flames / `+55%` for `2.2s`) using `ParticleSystem` (`BLENDMODE_ONEONE`) with procedural `DynamicTexture` radial flares.
- **Mobile Touch Ergonomics**: Provide a multi-touch bottom-left virtual joystick for steering/throttle and bottom-right touch buttons for **HOP / DRIFT** (hold to hop and drift) and **USE ITEM** (trigger active power-up).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
