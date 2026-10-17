# Gutsy Karts — Power-Up Ideas Backlog

Saved design specifications for future Gutsy Karts suburban/sci-fi power-ups (all 100% procedural Babylon.js meshes/textures, zero external binary assets).

---

## Implemented in Latest Update

1. **`LIL_SAUCER` ("Lil' Saucer") — Quirky Face-on-Dome UFO Rocket**
   - **Eligibility**: Strictly requires `rank > 1` AND at least one racer ahead on the track (`getRacersAheadOf(racer, allRacers).length > 0`). Highly weighted in last place (`46%` in 4th place, `24%` in 3rd, `10%` in 2nd, `0%` in 1st).
   - **Mechanic**: Randomly locks onto one of the racers currently ahead of the caster, rockets down the `Path3D` spline at `88 u/s` with a comical saucer wobble, bowls through any intermediate karts in its path, and blasts the chosen target with a high-impulse spin-out.
   - **Procedural Visuals**: Metallic lavender-chrome saucer rim (`CreateCylinder`), glowing cyan tractor-beam ring (`CreateTorus`), top antenna stalk & bobble (`CreateCylinder` + `CreateSphere`), and a pastel dome (`CreateSphere`) wrapped in a procedural `DynamicTexture` with big goofy asymmetrical eyes, rosy cheeks, raised eyebrows, and a wobbly smirk.

2. **`GLITCH_PRISM` ("Prank Glitch Prism") — Counterfeit Decoy Item Box**
   - **Eligibility**: Weighted toward front-runners and mid-pack racers (`26%` in 1st, `14%` in 2nd, `8%` in 3rd).
   - **Mechanic**: Drops behind the caster (`0.35s` arm delay, `32s` lifetime) at the exact height (`roadY + 1.45`) and size of a real Item Prism. Spins and bobs in place with a subtle crimson-magenta glitch pulse and inverted ring tilt; triggers a `720°` spin-out when a rival drives into it.

---

## Saved Ideas for Future Sessions

### 1. `DETENTION_DRONE` ("Sky Detention Drone") — 1st-Place Leader Hunter
- **Concept**: High-altitude autonomous hall-monitor drone that hunts down the current 1st-place race leader.
- **Eligibility**: Trailing racers only (`rank >= 2`, highest weight in 3rd–4th place).
- **Procedural Visuals**:
  - Angular matte-charcoal quad-rotor siren drone (`CreateBox` + 4x `CreateTorus` rotor shrouds) with alternating red/blue/amber flashing strobe domes (`CreateSphere`) and a downward spotlight cone (`CreateCylinder` with `alpha = 0.35`, `BLENDMODE_ONEONE`).
- **Physics & Behavior**:
  - Cruises along the track centerline spline at `105 u/s` at an elevated altitude (`roadY + 3.2m`), buzzing over 2nd and 3rd place without stopping.
  - Once within `18m` of the 1st-place leader, descends to hover `2.6m` directly above the leader's roof for `0.65s` (locking a warning siren beam onto them) before triggering an EMP detention shockwave (`4.5m` blast radius, `1.5s` spin-out + upward knock `vy = 5.5`).

### 2. `GRID_SURGE` ("Transformer Overload") — Global Opponent Zap & Shrink Debuff
- **Concept**: Blows a suburban cul-de-sac power transformer, zapping every opponent ahead of the caster with high-voltage static.
- **Eligibility**: Deep catch-up item (`rank >= 3` only, `~15%` in 4th place, with a global race cooldown so it cannot be spammed).
- **Procedural Visuals**:
  - Brief full-track cyan/violet sky flash + jagged procedural `MeshBuilder.CreateTube` / `CreateLines` arcs striking each targeted kart from above, followed by crackling yellow electric sparks (`ParticleSystem`) around affected karts.
- **Physics & Behavior**:
  - Hits all racers with `rank < caster.rank` (unless shielded by `NOVA_OVERDRIVE`).
  - Causes an immediate `0.65s` micro-jolt spin, clears their held item, and applies a `4.5s` **Mini-Static Debuff**: scales `visualRoot.scaling` down to `0.68x`, reduces `effectiveMass` by `40%` (making them easy targets for the Juggernaut Law!), and caps top speed at `75%`.

### 3. `TRIPLE_TURBO` ("3-Pack Soda Rockets") — Orbiting Multi-Charge Boost Canisters
- **Concept**: Three pressurized neon-orange/cyan soda-rocket canisters that orbit the kart's waist and grant three separate speed boosts on demand.
- **Eligibility**: Mid-to-back pack (`rank >= 2`).
- **Procedural Visuals**:
  - Three procedural цилиндrical canisters (`CreateCylinder` + conical nozzle caps) parented to an orbiting `TransformNode` ring around `visualRoot`. Each press of **USE ITEM** consumes one orbiting mesh and fires an `NITRO_CORE` burst (`+45%` top speed + off-road immunity for `1.6s`).

### 4. `FIZZ_SPLAT` ("Soda Geyser Splat") — Vision & Tire Grip Disruptor
- **Concept**: Launches a pressurized shaken-up fizzy soda bomb that erupts over racers ahead, coating their visors and tires in sticky neon-purple grape fizz.
- **Eligibility**: Ranks 2–4 (`~18%` in 3rd, `~12%` in 2nd/4th).
- **Procedural Visuals & HUD Effect**:
  - Erupts purple/teal fizz droplets (`ParticleSystem`) over all racers ahead of the caster.
  - Reduces affected racers' tire lateral grip by `25%` for `3.8s` (making corners extra slidey) and renders 3–4 translucent neon-purple fizzy drip decals on the React HUD overlay (`RaceGame.tsx`) that slide down and fade out over `3.5s` (instantly cleared if the racer activates a boost!).

### 5. `SAUCER_ABDUCTION_RIDE` ("Tractor-Beam Autopilot Mode" — Optional UFO Variant)
- **Concept**: Alternate or upgrade variant of `LIL_SAUCER` where a giant mother-saucer hovers directly above the caster's kart, envelopes them in a cyan tractor beam, sets their mass to `9,999 kg` (unbudgeable Juggernaut), and autopilots the kart along the `Path3D` spline at `1.65x` top speed for `4.5s`, shoving aside any rival karts along the route.
