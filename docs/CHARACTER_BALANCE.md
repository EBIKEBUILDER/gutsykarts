# Gutsy Karts — Character Archetypes & Asymmetric Balance Philosophy

## 1. Core Design Philosophy: Asymmetric Archetypes, Equal Overall Pace

Rather than making all four racers feel like identical reskins, **Gutsy Karts** is built around **asymmetric physical archetypes** whose distinct strengths and weaknesses trade off across a 3-lap race to converge on an **equal ~25% win rate and identical flying-lap pace** across the cup circuits.

Every character is tuned across five physical axes in [`src/game/data/roster.ts`](../src/game/data/roster.ts):

1. **Mass & The Juggernaut Law (`mass`)**:
   - Determines kart-to-kart collision dominance via cubic mass weighting ($\gamma = 3.0$):
     $$\alpha_A = \frac{m_B^3}{m_A^3 + m_B^3}, \quad \alpha_B = \frac{m_A^3}{m_A^3 + m_B^3}$$
   - When $\Delta m \ge 40\text{ kg}$ or $m_{\text{heavy}} > 1.3 \times m_{\text{light}}$, the heavier kart acts as an **Unbudgeable Juggernaut** (`< 3%` speed loss on contact) while shoving the lighter kart laterally (`~2.8m`) with a brief yaw wobble.
2. **Top Speed (`topSpeed` / `offRoadTopSpeed`)**:
   - Maximum unboosted cruising speed on asphalt (`100%`), rumble curbs (`98%`), and unboosted off-road grass/dirt (`55%`).
3. **Non-Linear Launch Acceleration (`acceleration`)**:
   - Controls standing-start holeshot punch (`+55%` low-speed torque below `65%` top speed), corner-exit recovery, and post-collision speed recovery.
4. **Handling & Drift Grip (`handling`, `driftGrip`, `driftSteerOutRatio`)**:
   - Controls normal turn-in authority, lateral traction during powerslides, and outside counter-steer widening control (`driftSteerOutRatio`).
5. **Mini-Turbo Boost Duration (`miniTurboDurationBonus`, `miniTurboDurationSec`)**:
   - Scales the duration of **Tier 1 Electric Blue (`+25%`)**, **Tier 2 Super Orange (`+40%`)**, and **Tier 3 Ultra Purple (`+55%`)** drift sparks, granting full **Off-Road Immunity (PRB)** while active.

---

## 2. The Four Racer Archetypes (Pass #14 Baseline)

| Character | Archetype Class | Mass (`kg`) | Top Speed (`m/s`) | Accel (`m/s²`) | Handling / Grip | Mini-Turbo Bonus | Signature Win Condition |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Rex Ironclad** | `SUPER_HEAVY` | **`220`** | **`47.28`** *(1st)* | `23.42` *(4th)* | `1.77` / `0.76` | `+2%` (`0.42s`) | **Straightaway & Pack Bully**: Highest raw top speed and **0 hits taken** (`~15.4` shoves/race). Shrugs off every other kart in traffic and dominates long straights, but launches slowest off the line and requires wider drift arcs. |
| **Aero Vance** | `BALANCED` | **`120`** | **`45.88`** *(2nd)* | `27.9` *(3rd)* | `2.00` / `0.80` | `+6%` (`0.46s`) | **All-Round Grand Prix Ace**: Second-highest top speed, Juggernaut advantage over **Nyx** and **Pip** (`~11.5` shoves/race), and dependable balance between straightaway pace, cornering grip, and Mini-Turbo punch. |
| **Nyx Veloce** | `TECHNICAL` | **`85`** | **`44.25`** *(3rd)* | `31.4` *(2nd)* | `2.10` / **`0.83`** | **`+14%` (`0.51s`)** | **Corner-Exit & Mini-Turbo Specialist**: Highest lateral drift grip (`0.83`) and **longest Mini-Turbo boosts (`+14%` / `0.51s`)**. Slingshots out of hairpins and chains boosts across grass apex shortcuts longer than any other racer. |
| **Pip Spark** | `FEATHERWEIGHT` | **`50`** | `43.71` *(4th)* | **`35.45`** *(1st)* | **`2.15`** / `0.82` | `+8%` (`0.49s`) | **Holeshot & Hairpin Rocket**: Explosive standing-start and post-bump acceleration (`35.45`, `+51%` faster than Rex) with the sharpest turn-in (`2.15`). Grabs the Lap-1 holeshot into clean air and recovers instantly from mistakes, but must avoid getting body-checked by heavier karts. |

---

## 3. How the Three Phases of a Race Balance Out

Over a 3-lap race, the four archetypes trade advantages across three distinct phases:

1. **Phase 1 — Standing Start & Lap-1 Holeshot**:
   - **Pip Spark** (`35.45` Accel) and **Nyx Veloce** (`31.4` Accel) accelerate off the grid fastest, reaching Turn 1 in clean air (`~150ms` ahead of Rex on Lap 1).
2. **Phase 2 — Hairpins, Chicanes & Boost Cuts**:
   - **Nyx** (`+14%` MT duration, `0.83` drift grip) and **Pip** (`+8%` MT duration, `2.15` handling) carve tighter inside lines and stay in Mini-Turbo / Off-Road Immunity state longer coming out of technical corners.
3. **Phase 3 — Straightaways & Pack Traffic**:
   - **Rex Ironclad** (`47.28 m/s`, `220 kg`) and **Aero Vance** (`45.88 m/s`, `120 kg`) reel the lighter karts back in on straightaways and sweeping curves. When side-by-side in pack traffic, cubic mass dominance lets Rex and Aero hold the inside line and shove lighter karts wide.

---

## 4. Empirical Verification via the 4-AI Self-Learning Balance Lab

To ensure that character balance reflects real multi-kart racing rather than theoretical spreadsheet math, [`AiBrainTrainer.ts`](../src/game/ai/AiBrainTrainer.ts) benchmarks all four characters continuously:

- **Orthogonal Latin-Square Rotation**: Across every 4-episode block (`16` episodes for a full Latin square), every character rotates through all **4 starting grid slots (`P1`–`P4`)** and all **4 evolutionary AI policy genomes (`Elite Champion`, `Fine-Tuned`, `Crossover`, `Explorer`)** so grid position and AI brain variance never bias character win rates.
- **Pure Driving Benchmark (`Items = OFF`, `ROTATE_CUP`)**: Evaluates pure physical pace, Lap 1 vs. Flying Lap splits (`Avg Lap (L1 / Fly)`), Juggernaut collision rates (`Bumps (Shove/Hit)`), and Mini-Turbo frequency (`MTs/Race`) across all Cup tracks.
