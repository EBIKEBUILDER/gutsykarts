# Gutsy Karts

An open-source 3D procedural arcade kart racer built with **Next.js**, **TypeScript**, **Tailwind CSS**, and **Babylon.js**. All karts, drivers, tracks, terrain, scenery props, power-ups, particles, and audio are generated **100% procedurally at runtime** with zero external binary 3D models, image textures, or audio files.

---

## Existing Features

### 1. Custom Arcade Kart Physics & Asymmetric Mass System
- **Kinematic-Dynamic Arcade Physics (`KartPhysics.ts`, `KartController.ts`)**: Custom 60Hz vehicle simulation featuring raycast vertical suspension, slope pitch/roll alignment, and delta-time clamping (`dt <= 0.05s`).
- **Asymmetric Mass Collision ("The Juggernaut Law")**:
  - Uses cubic mass dominance ($\gamma = 3.0$) to resolve kart-to-kart collisions:
    $$\alpha_A = \frac{m_B^3}{m_A^3 + m_B^3}, \quad \alpha_B = \frac{m_A^3}{m_A^3 + m_B^3}$$
  - When a heavier kart meets the Juggernaut threshold ($\Delta m \ge 40\text{ kg}$ or $m_{\text{heavy}} > 1.3 \times m_{\text{light}}$), it suffers `< 3%` velocity perturbation while shoving the lighter kart laterally across the track.
- **Multi-Surface Terrain Classification**:
  - **Asphalt Pavement**: `100%` top speed, high lateral grip, and high-speed tire heat haze.
  - **Rumble Strip Curbs**: `98%` top speed, alternating red/white curb geometry, micro-sparks, and subtle camera vibration.
  - **Off-Road Grass & Dirt**: Caps max speed to `55%`, applies linear drag (`4.5 s⁻¹`), lowers lateral grip, and kicks up procedural dirt clods and grass blades (unless bypassed by active boost/overdrive items).
- **Hop & 3-Stage Mini-Turbo Drift System**:
  - Triggering a hop (`vy = 6.5` for `0.18s`) while steering locks the kart into an inward drift slide with counter-steer radius control and charges three progressive Mini-Turbo tiers:
    - **Tier 1 (`1.0s`) — Mini-Turbo**: Electric Blue sparks (`+25%` speed for `0.8s`)
    - **Tier 2 (`2.2s`) — Super Mini-Turbo**: Fiery Orange sparks (`+40%` speed for `1.5s`)
    - **Tier 3 (`3.6s`) — Ultra Mini-Turbo**: Purple/Magenta sparks & exhaust flames (`+55%` speed for `2.2s`)

### 2. Playable Drivers & Customizable Kart Chassis
- **4 Driver Weight Classes (`roster.ts`)**:
  - **Rex Ironclad** (*Super Heavyweight*, `220 kg`) — Unbudgeable Juggernaut with the highest straight-line top speed (`48 u/s`).
  - **Aero Vance** (*Balanced*, `120 kg`) — All-round Grand Prix racer with balanced acceleration, speed, and cornering.
  - **Nyx Veloce** (*Technical*, `85 kg`) — Precision drift specialist with enhanced handling and a `+15%` Mini-Turbo duration bonus.
  - **Pip Spark** (*Featherweight*, `50 kg`) — High-acceleration sprinter (`35 u/s²`) with razor-sharp cornering.
- **6 Procedural Kart Chassis**:
  - **Behemoth Bruiser** (*Tank* — dual rear tires & spiked bumper)
  - **Apex Striker** (*Formula* — open-wheel multi-plane wing racer)
  - **Phantom Coupe** (*Coupe* — sleek swept-tailfin aerodynamic body)
  - **Bumblebee Buggy** (*Buggy* — tubular roll-cage off-road frame)
  - **Cul-de-Sac Interceptor** (*Formula* — `+2.5` Top Speed, `+1.5` Acceleration, `-10 kg` Mass)
  - **Iron Bulldog Rig** (*Tank* — `+30 kg` Mass, `+1.5` Top Speed, dual rear tires)

### 3. Power-Ups & Item Combat (`ItemManager.ts`)
- **Rank-Weighted Item Roulette**: Floating crystalline item boxes along the circuit award position-weighted power-ups and automatically respawn.
- **5 Tactical Power-Ups**:
  - **Nitro Core**: `+45%` top speed burst for `2.0s` and complete immunity to off-road grass/dirt slowdown for corner cutting.
  - **Pulse Seeker**: Homing crimson drone (`65 u/s`) that follows the track spline and locks onto the next racer ahead.
  - **Ricochet Disc**: High-velocity emerald energy disc (`70 u/s`) fired forward that bounces off boundary walls up to 4 times.
  - **Cryo Mine**: Spiked hazard emitter deployed behind the kart that triggers a `720°` spin-out and `80%` speed loss on contact.
  - **Nova Overdrive**: `7.5s` of golden invincibility, `+35%` bonus speed, off-road immunity, and `9,999 kg` Juggernaut ramming mass that spins out any opponent on contact.

### 4. Grand Prix Cups, 9 Built-In Circuits & Adaptive AI
- **Grand Prix Cup Series & Single Race Modes**: Compete across 3-lap races in full multi-track Cup tournaments with cumulative championship points standings:
  - **Cul-de-Sac Cup**: *Gutsy Avenue Grand Circuit*, *Maple Leaf Parkway*, *Pinewood Switchback Park*
  - **Neon Creek Cup**: *Creekbed Canyon Run*, *Arcade Plaza Perimeter*, *Twin Peaks Ridgeway*
  - **Overdrive Crown Cup**: *Foundry Switchback Yard*, *Skyline Overlook Speedway*, *Gutsy Crown Finale Gauntlet*
- **3 AI Difficulty Tiers (`EASY`, `MEDIUM`, `HARD`)**: AI karts use multi-point spline curvature look-ahead, apex corner-cutting, drift charging, item box seeking, obstacle avoidance, and tactical power-up deployment.

### 5. Interactive 3D & 2D Track Editor (`TrackEditor.tsx`, `TrackBuilder.ts`)
- **Dual-Viewport Circuit Studio**: Switch seamlessly between `3D Only`, `Split 3D + 2D`, and `2D Overhead` views with Undo/Redo support and automatic persistence to `localStorage`.
- **Centripetal Catmull-Rom Spline Editing**: Drag control points in XZ space or sculpt vertical track elevation (`Y`) with mathematically guaranteed cusp-free, non-self-intersecting road ribbons.
- **C2-Continuous Terrain Sculpting Brushes**: Raise hills, carve valleys, or flatten terrain with smooth radial bell-curve brushes (`TERRAIN_RAISE`, `TERRAIN_LOWER`, `TERRAIN_FLATTEN`).
- **Interactive Object & Hazard Placement**:
  - **Track Features**: Place or erase **Boost Pads** and **Item Box Rows** along any spline coordinate.
  - **Track Obstacles**: Place **Stunt Jump Ramps**, **Traffic Pylon Cones**, **Oil Slick Puddles**, and **Hazard Barrier Crates**.
  - **Scenery Prefabs & Auto-Forest Generation**: Place **Pine Trees**, **Oak Trees**, **Granite Boulders**, **Suburban Houses**, **Spectator Grandstands**, and **Streetlight Posts**, or auto-generate trackside woodland scenery that automatically clears the road corridor when spline points move.

### 6. Controls, Camera Perspectives & Procedural Audio
- **Desktop Keyboard & Mobile Touch Controls (`VirtualJoystick.tsx`)**:
  - **Keyboard**: `W`/`S` or `↑`/`↓` (Throttle/Brake), `A`/`D` or `←`/`→` (Steer), `Shift`/`Space` (Hold to Hop & Drift), `E`/`Enter` (Use Item), `C` (Cycle Camera), `R` (Reset to Track).
  - **Mobile Touch**: Multi-touch bottom-left virtual joystick for steering/throttle plus dedicated bottom-right **HOP / DRIFT** and **USE ITEM** buttons.
- **Dynamic Camera Modes**: Switch between Chase, Far Chase, Nose/Bumper, and Top-Down camera views with speed-based FOV scaling and impact shake.
- **Real-Time Race HUD**: Throttled React HUD displaying live rank, lap counter, lap splits, speedometer, active surface badge, Mini-Turbo charge meter, item roulette slot, asymmetric collision telemetry banners, and an SVG track minimap with live racer dots.
- **Procedural Web Audio (`SoundtrackManager.ts`)**: Real-time synthesized 8-bar upbeat jazz-pop circuit soundtrack and sound effects using the Web Audio API with zero external audio assets.

---

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser to race or launch the 3D Track Editor.

---

## AI Self-Training Lab, Path Recorder & Character Balance Guide

Gutsy Karts includes a built-in **Evolutionary AI Brain (`AiBrainTrainer.ts`)**, **2D Racing Path Recorder**, and **Character Balance & Auto-Tuning Advisor** accessible from the main menu (`4-AI TRAINING SIM`) or the in-race top HUD bar (`AI LAB & PATHS`).

### 1. Running an Unattended 4-AI Self-Training Session
1. On the main menu, select a Cup and click **`4-AI TRAINING SIM`** in the AI Difficulty & Self-Training Lab bar.
2. This launches an automated 4-AI simulation with the **AI Telemetry & Self-Training Lab** open and configures the recommended training regime:
   - **`AI: SELF-LEARN`**: Evolves a 4-genome population (`Elitist Champion`, `Fine-Tuned Mutant`, `Genetic Crossover`, and `Wide Explorer`) with a **23-parameter genome** (`15` continuous vehicle-dynamics & drift-PD control weights + an `8-weight` `tanh` neural steering residual) after every 3-lap race.
   - **`ITEMS: OFF (PURE DRIVING)`**: Disables item box pickups and random projectiles so 100% of fitness scores and lap times measure pure cornering, drift-holding, and boosted off-road shortcuts without item RNG noise. (Click **`ITEMS: ON (COMBAT)`** when you want to test full combat racing.)
   - **`LOOP: ROTATE CUP`**: Advances to the next track in the active Cup after every race (`1.6s` podium auto-advance) so the AI learns generalizable racing lines across both straightaways and tight technical hairpins rather than overfitting to a single map. (Click **`LOOP: SINGLE TRACK`** to drill a single custom circuit.)
   - **Orthogonal Latin-Square Grid & Genome Rotation**: Every episode rotates both the starting grid positions (`P1–P4`) and the 4 candidate AI genomes across `Rex Ironclad`, `Aero Vance`, `Nyx Veloce`, and `Pip Spark` across a 16-race Latin-Square cycle to eliminate slot or character bias.
3. Click **`8x`** (next to `SIM:` in the top HUD bar) to run the 60Hz physics engine with 8 sub-steps per frame (**480Hz / 8x real-time**), completing a full 3-lap race every ~12–15 seconds.

### 2. Resetting Training Data vs. Resetting Character Balance Stats
Inside the in-race **AI Telemetry & Self-Training Lab** panel (bottom-right of the Character Balance header), there are two distinct reset buttons:
- **`RESET AI MODEL (GEN 1)`**: Wipes all evolved generations back to `Gen #1 • Episode #1`, resets the Champion genome and population back to seed weights, and clears all character balance stats. **Use this whenever:**
  - Core driving/drift physics rules were changed, OR
  - Earlier generations were trained with `ITEMS: ON` (where random item hits/boosts muddied historical fitness scores) and you want a clean pure-driving training run.
- **`RESET BALANCE STATS`**: Keeps your trained AI driving brain (`Gen #N` Champion weights) intact, and **only** resets the Character Balance table (`Races`, `Win %`, `Avg Rank`, `Avg Lap`, `Pace Δ`) back to 0. **Use this whenever:**
  - We tweak character stats (`topSpeed`, `acceleration`, `miniTurboDurationBonus`) or toggle `AUTO-BALANCE ROSTER: ON/OFF` and want to measure the new character balance cleanly without losing the AI's driving skill.

### 3. Balancing the 4 Characters & Karts
Watch the **Character Balance Matrix & Auto-Tuning Advisor** table at the bottom of the AI Lab panel after **16–40+ pure-driving races** (`ITEMS: OFF`, `LOOP: ROTATE CUP`):
- **Target Benchmark**: Each of the 4 characters should converge toward a **~25% Win Rate**, an **Avg Rank of ~2.50**, and a **`Pace Δ` within $\pm 0.5\%$** of the fleet mean. (See [`docs/CHARACTER_BALANCE.md`](./docs/CHARACTER_BALANCE.md) for the complete asymmetric design philosophy.)
- **Live Equalization (`AUTO-BALANCE ROSTER: ON / OFF`)**: Toggling **`AUTO-BALANCE ROSTER: ON ✓`** dynamically applies empirical stat equalization (`TopSpd`, `Accel`, `MT Bonus`) at race start so all 4 archetypes compete evenly while preserving their weight/handling feel.
- **One-Click Copy for Permanent Codebase Tuning (`COPY REPORT FOR AI`)**:
  - Click **`COPY REPORT FOR AI`** in the AI Lab panel to copy a formatted Markdown table + JSON payload of all character win rates, lap times, pace deltas, Advisor stat recommendations, and Champion policy weights directly to your clipboard.
  - Paste that report into the coding assistant chat to permanently apply the recommended stat deltas to `CHARACTER_ROSTER` in `src/game/data/roster.ts`.

### 4. Saving & Baking Self-Trained AI Datasets into the Game Build
1. **Assigning Presets Locally (`EASY`, `MEDIUM`, `HARD`)**:
   - At any point during training, click **`SAVE → EASY`** (e.g. `Gen #3–5`), **`SAVE → MEDIUM`** (e.g. `Gen #10–15`), or **`SAVE → HARD`** (e.g. `Gen #25+`) in the AI Lab panel to bind the current Champion genome to that difficulty tier in your browser's `localStorage`.
2. **Baking Trained Models Permanently into the Repository**:
   - Click **`EXPORT JSON`** (or **`COPY REPORT FOR AI`**) to export `championWeights` and `savedPresets`.
   - Copy those weight objects into `DEFAULT_POLICY_WEIGHTS` (`EASY`, `MEDIUM`, `HARD`, and `SELF_LEARNING`) in `src/game/ai/AiBrainTrainer.ts` so every player and server boots with your self-trained AI models out of the box.

---

## Technical Architecture: AI Self-Learning & Neuro-Evolutionary System

Technically, Gutsy Karts implements a **Hybrid Parametric Control + Neuro-Evolutionary Strategy ($\mu + \lambda$ / $(1 + 3)$ Elitist Evolution Strategy with a Neural Residual Policy)** in [`src/game/ai/AiBrainTrainer.ts`](./src/game/ai/AiBrainTrainer.ts) and [`src/game/physics/KartController.ts`](./src/game/physics/KartController.ts).

Rather than training a raw black-box neural network from scratch (which would spend thousands of episodes driving into walls), each AI racer runs a **two-layer hybrid controller** combining an analytical spline/drift-PD controller with an evolvable neural residual perceptron:

### 1. The 23-Parameter Policy Genome (`AiPolicyGenome`)
Each AI genome encodes **23 continuous floating-point parameters** split into two layers:
- **15 Vehicle-Dynamics & Closed-Loop Drift PD Weights**:
  - **Dynamic Look-Ahead Horizon (`lookAheadBase`, `lookAheadCurve`, `lookAheadDrift`)**: Controls how many meters ahead on the `Path3D` Catmull-Rom spline the kart targets on straightaways, tight hairpins, and active powerslides.
  - **Apex & Shortcut Geometry (`apexCutRatio`, `driftCutRatio`, `insideApexTarget`, `padSeekWeight`)**: Governs how aggressively the kart clips inside rumble curbs, seeks boost/jump pads, and cuts across off-road grass when holding Mini-Turbo or Nitro off-road immunity.
  - **Drift Entry & Counter-Steer PD Controller (`steerGain`, `driftEntryThreshold`, `preferredChargeSec`, `maxHoldChargeSec`, `driftAngleGain`, `driftLatGain`, `driftVelDamping`, `exitTangentAlignBlend`)**: Governs hop-drift initiation, lateral slip stabilization during slides, and Tier 1 (Blue), Tier 2 (Orange), and Tier 3 (Purple) Mini-Turbo release timing.
- **8-Weight Neural Residual Perceptron (`neuralBias[0..7]`)**:
  - Every 60Hz physics tick, [`evaluateNeuralResidualSteer`](./src/game/ai/AiBrainTrainer.ts) feeds **8 normalized real-time telemetry sensors** into a single-layer `tanh`-activated neural network that outputs a continuous fine-steering correction ($\pm 0.22$):
    $$\Delta u_{\text{neural}} = 0.22 \cdot \tanh\left(\sum_{i=0}^{7} w_i \cdot s_i\right)$$
  - **The 8 Sensor Inputs ($s_0 \dots s_7$)**: (0) heading angle error to target, (1) signed lateral track offset ratio, (2) lateral velocity ratio, (3) near-horizon spline curvature, (4) mid-horizon spline curvature, (5) speed-to-top-speed ratio delta, (6) active drift direction $\times$ lateral offset, and (7) character handling stat $\times$ lateral offset.

### 2. Multi-Objective 60Hz Telemetry Fitness Function (`0–100` Score)
During every race, all 4 AI karts are sampled at 60Hz (or 480Hz in `8x` accelerated simulation mode). At the end of each 3-lap episode, each genome is scored on an objective **0–100 fitness scale** that is normalized by each kart's own top-speed stat (so a genome is evaluated on how well it drove its assigned kart rather than raw character top speed):

$$\text{Fitness} = \underbrace{0.42\,\text{Pave\%} + 0.38\,\text{Curb\%} + 0.36\,\text{BoostedCut\%}}_{\text{Clean Surface Mastery}} + \underbrace{0.48\,\left(\frac{\bar{v}}{v_{\text{top}}}\right)}_{\text{Normalized Pace}} + \underbrace{\text{MT Bonus}}_{\le 14\text{ pts}} - \underbrace{\text{Penalties}}_{\text{Grass Drag + Ping-Pongs + Walls}}$$

- **Positive Rewards**: Maintaining high normalized speed ($\bar{v}/v_{\text{top}}$), staying on asphalt/curbs, executing **boosted off-road shortcuts** while Off-Road Immunity is active, and firing Tier 1/2/3 Mini-Turbos.
- **Penalties**: Unboosted off-road grass drag (`-1.15x`), cross-track "ping-pong" over-oscillations (`-2.8` per crossing), perimeter wall collisions (`-3.5` per hit), and aborted drifts (`-1.1` each).

### 3. $(1 + 3)$ Elitist Evolutionary Loop & Simulated Annealing
At the conclusion of every 3-lap race:
1. **Elitist Champion Promotion (with Lap-Time Tiebreaker)**: If the episode's best genome exceeds the all-time `championGenome.fitness`—or ties `100.0/100` fitness while clocking a faster `bestLapMs`—it is promoted to the new all-time Champion.
2. **Next-Generation Population Synthesis**:
   - **Slot 0 (`Alpha / Elitist Champion`)**: Unmutated copy of the all-time Champion genome, guaranteeing zero performance regression across generations.
   - **Slot 1 (`Beta / Fine-Tuned Mutant`)**: Box-Muller Gaussian perturbation of the Champion with a tight step size (`0.55 × mutScale`).
   - **Slot 2 (`Gamma / Genetic Crossover`)**: Uniform/blended genetic crossover between the **All-Time Champion** and the episode's **#2 Runner-Up**, followed by moderate Gaussian mutation (`0.85 × mutScale`).
   - **Slot 3 (`Delta / Wide Explorer`)**: High-variance Gaussian mutation (`1.35 × mutScale`) to discover novel corner-cutting trajectories and deeper Mini-Turbo charge windows.
3. **Adaptive Mutation Annealing**: The base mutation scale `mutScale` automatically anneals from `0.68` (broad exploration at lower fitness) down to `0.22` (millisecond precision micro-tuning once fitness reaches $\ge 95/100$).

### 4. Orthogonal Latin-Square Rotation for Unbiased Character Benchmarking
Because the 4 parallel AI genomes have different exploration rates (`Slot 0` Elitist Champion vs. `Slot 3` Wide Explorer) and the 4 starting grid slots (`P1–P4`) have different Lap-1 traffic patterns, [`RaceGame.tsx`](./src/components/RaceGame.tsx) and [`AiBrainTrainer.ts`](./src/game/ai/AiBrainTrainer.ts) use an **Orthogonal Latin-Square schedule** across every 16-episode cycle:
- **Starting Grid Rotation (`Period 4`)**: `gridOffset = episodesCompleted % 4`
- **Brain-to-Character Rotation (`Period 16`)**: `genomeIndex = (slotIndex + Math.floor(episodesCompleted / 4)) % 4`

Every 16 races, each of the 4 characters (`Rex Ironclad`, `Aero Vance`, `Nyx Veloce`, `Pip Spark`) has started from every grid position (`P1–P4`) paired with every AI genome slot (`Slot 0–3`), ensuring that empirical win rates and lap-time splits measure pure character physics.


