---
name: ip-clean-guard
description: >-
  Enforces strict original-IP hygiene across all source code, comments, UI copy,
  and git commit messages for Gutsy Karts. Activate this skill before writing
  item/track/character copy, before refactoring gameplay mechanics inspired by
  arcade kart racers, and before crafting any git commit message.
---

# Original IP & Trademark Hygiene Guard (`ip-clean-guard`)

Gutsy Karts is a 100% original, open-source suburban arcade kart racer universe.
Zero external proprietary intellectual property, third-party game titles,
character names, or trademarked item/mechanic names may ever appear in source
code, comments, documentation, UI strings, or git commit messages.

## Mandatory Rules

1. **Zero Third-Party Trademarks in Code, Comments, or Commits**:
   - NEVER mention external commercial kart racing franchises, consoles, publishers, characters, tracks, or trademarked item names in:
     - TypeScript/React source files (`src/**`)
     - Code comments or JSDoc blocks
     - JSON data files (`defaultCups.json`, roster/item catalogs)
     - Git commit messages or PR descriptions
   - Even if the user references an external game mechanic conversationally in chat to explain an idea, translate the concept immediately into **original Gutsy Karts terminology** before writing code, comments, or commit messages.

2. **Canonical Gutsy Karts Terminology Map**:
   Always use the official Gutsy Karts original nomenclature:
   - **Forward / Homing Projectiles**:
     - `RICOCHET_DISC` ("Ricochet Disc" — straight-line bank-shot energy disc)
     - `PULSE_SEEKER` / `TRIPLE_SEEKER` ("Pulse Seeker" / "Triple Pulse Seekers" — spline-following lock-on seekers)
     - `LIL_SAUCER` ("Lil' Saucer" — frontrunner-hunting UFO interceptor)
   - **Boosts & Autopilot**:
     - `NITRO_CORE` / `TRIPLE_NITRO` ("Nitro Core" / "Triple Nitro" — high-output boost cylinders)
     - `GOLDEN_OVERCLOCK` ("Golden Overclock" — 7.5s unlimited rapid-fire boost core)
     - `WARP_AUTOPILOT` ("Hyper-Shuttle Autopilot" — spline-locked supersonic recovery shuttle)
     - `NOVA_OVERDRIVE` ("Nova Overdrive" — full-body invulnerability + juggernaut mass + speed surge)
   - **Track Traps, Shields & Field Disruption**:
     - `CRYO_MINE` / `TRIPLE_CRYO_MINE` ("Cryo Mine" / "Triple Cryo Mines" — stationary frost hazards)
     - `GLITCH_PRISM` ("Glitch Prism" — decoy item crate hazard)
     - `ORBITAL_SHIELD` ("Orbital Shield" — 3 orbiting plasma bumper spheres)
     - `EMP_SHOCKWAVE` ("EMP Shockwave" — full-field opponent shrink & top-speed disruption)
     - `OIL_SQUALL` ("Oil Squall" — remote ink/oil splatter blinding windshield & reducing grip)
     - `PHASE_CLOAK` ("Phase Cloak" — translucent intangible slipstream & item siphon)

3. **Pre-Commit Verification Step**:
   Before running `git commit`, always verify:
   - The staged diff (`git diff --cached`) contains zero references to external game titles or trademarked item names.
   - The commit message subject and body strictly use Gutsy Karts domain terms (e.g., `Hyper-Shuttle Autopilot`, `Triple Pulse Seekers`, `EMP Shockwave`, `Lil' Saucer`, `Underdog Comeback Loot Table`).
