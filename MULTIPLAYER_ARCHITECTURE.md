# Gutsy Karts 3D — Multiplayer & Networking Architecture Reference

This document captures our architectural planning conversation, design decisions, and technical reference for the **Player-Hosted Online Multiplayer** system in **Gutsy Karts 3D**.

---

## 1. Core Multiplayer Goals & Design Requirements

1. **Live Lobby & Online Presence**:
   - Players can see who else is online right now and browse active/open races.
   - Players can start (host) a new race or join an existing race with a single click/tap.
2. **4-Slot Races with AI Bot Fill**:
   - Every race has **4 Racer Slots** (`Slot 0` through `Slot 3`).
   - Any slot not occupied by a human player is driven by a Gutsy Karts AI bot (`KartController.computeAiInputs`).
3. **Mid-Race Hot-Join ("Drop-In / Drop-Out AI Replacement")**:
   - When a player joins a race that is *already in progress*, they immediately replace one of the AI bots in the ongoing race.
   - The joining player can bring their own selected **Character & Kart Chassis** (swapping that AI slot's procedural 3D mesh and mass/speed stats on the fly) while inheriting the AI bot's live position on the track, current speed, lap count, checkpoints, and held power-up.
   - If a human player disconnects mid-race, their kart immediately reverts to AI control on the next frame so the race continues uninterrupted.
4. **Mobile Device Reliability (5G / LTE / Wi-Fi)**:
   - Must work reliably on mobile phones and tablets alongside the multi-touch virtual joystick (`VirtualJoystick.tsx`).
   - Must handle strict cellular NATs (CGNAT / Symmetric NAT) where direct Peer-to-Peer UDP is blocked, and handle mobile browser backgrounding (when a mobile host locks their screen or switches apps).
5. **Player-Hosted (No Dedicated Game Servers to Run)**:
   - Avoid running or paying for stateful 60Hz Babylon.js servers.
   - Use **Supabase Realtime** (Presence + Broadcast) paired with **WebRTC DataChannels (`RTCPeerConnection`)** and automatic relay fallback so the simulation is 100% player-hosted in participants' browsers.

---

## 2. Options Evaluated & Architectural Decisions

### Why Player-Hosted Multiplayer Needs Two Layers
Even when a game is 100% player-hosted in the browser, two distinct networking layers are required:
1. **Discovery & Signaling ("The Phonebook")**: How a player opening the game discovers who is online, sees open race lobbies, and exchanges WebRTC connection handshakes (`SDP` + `ICE candidates`).
2. **Real-Time Race Transport ("The Data Pipe")**: How 20–30Hz kart telemetry, drift sparks, Juggernaut collisions, and power-up events travel between devices with minimal latency.

### Comparison of the 3 Architectures Considered

| Approach | Lobby Discovery | Race Data Transport | Mobile (5G/LTE) Reliability | Backend / Maintenance |
| :--- | :--- | :--- | :--- | :--- |
| **Option 1: Hybrid Supabase Realtime + WebRTC P2P w/ Relay Fallback *(CHOSEN)*** | **Supabase Realtime Presence** tracks online players and open rooms automatically; rooms disappear the moment everyone leaves. | **WebRTC `RTCDataChannel` (UDP)** for direct peer-to-peer speed, with automatic fallback to **TURN / Supabase Realtime Broadcast** when mobile cellular NATs block P2P. | **~100%** (Fallback catches strict 5G/LTE Symmetric NATs that block raw UDP hole-punching). | **$0** free tier on Supabase; zero game servers or database tables to manage. |
| **Option 2: Pure Zero-Backend P2P (`trystero` / `PeerJS`)** | Uses public WebTorrent/Nostr relays to announce lobbies. | WebRTC `RTCDataChannel` only. | **~70–80%** without a TURN server, because cellular CGNAT drops direct UDP. | **$0**, zero accounts, slightly slower room discovery (1–3s). |
| **Option 3: Edge Relay Rooms (`PartyKit` / Cloudflare Durable Objects)** | Edge worker room registry. | All packets route via the nearest Cloudflare edge WebSocket (~20ms) to the Host browser. | **100%** (Standard HTTPS port 443 WebSockets). | **$0** free tier, requires deploying a separate edge script. |

### Key Decisions Made
1. **Transport & Discovery Stack**: **Supabase Realtime (Presence + Broadcast) + WebRTC DataChannels** (with built-in BroadcastChannel + public WebRTC signaling fallback when Supabase environment variables are not set, allowing instant local multi-tab and zero-config testing).
2. **Hot-Join Character/Kart Policy**: **Allow choosing any available character & kart**. When a player hot-joins mid-race and replaces an AI bot, the slot preserves its exact spatial progress (`position`, `velocity`, `headingYaw`, `lap`, `checkpointsMask`, `totalProgressDistance`, `heldItem`) and swaps the procedural `KartAssembly` mesh and `ResolvedRacerStats` in-place.
3. **Host Disconnect / Mobile Sleep Policy**: **Automatic Host Migration**. If the current Host stops sending heartbeats for `> 1.5s` (e.g., locked phone screen or closed tab), the remaining human player with the earliest `joinedAt` timestamp automatically promotes to Host and takes over ticking the AI bots and item boxes.

---

## 3. Detailed Networking Architecture

### 3.1 Channel Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. GLOBAL LOBBY CHANNEL ("gutsykarts:lobby")                            │
│    - Supabase Realtime Presence (tracks all online players & open rooms)│
│    - Live room metadata: roomId, hostPeerId, trackName, phase, lap,     │
│      humanCount/4, openAiSlots                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Player hosts or joins a room)
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. ROOM SIGNALING & RELAY CHANNEL ("gutsykarts:room:<roomId>")          │
│    - Room-level Presence (tracks ordered peer list for Host Migration)  │
│    - WebRTC SDP Offer/Answer + ICE Candidate exchange                   │
│    - Reliable Broadcast Fallback (if a mobile peer's UDP is blocked)    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Direct P2P negotiated in < 300ms)
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. WEBRTC P2P DATACHANNELS (Per-Peer Mesh)                              │
│    - "fast" channel: ordered=false, maxRetransmits=0 (UDP semantics)    │
│      Streams 25Hz kart kinematics, drift tiers & AI bot positions       │
│    - "reliable" channel: ordered=true                                   │
│      Sends WELCOME_SNAPSHOT, SLOT_TAKEOVER, ITEM_EVENT, COLLISION_EVENT │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 The 4-Slot Control State Machine

Every race always has **4 `KartController` slots** (`slotIndex: 0 | 1 | 2 | 3`). Each slot operates in one of three control modes on any given machine:

| Control Mode | Who Computes Physics (`KartController.update`)? | Network Behavior |
| :--- | :--- | :--- |
| **`LOCAL_HUMAN`** | **Local Browser (60Hz)**. Reads keyboard/mobile touch inputs (`ControlInputState`) directly for zero input lag. | Broadcasts compact `KartNetState` at 25Hz to all peers. |
| **`AI` (On Host)** | **Host Browser (60Hz)**. Runs `racer.computeAiInputs(dt, activeBoxes, racers)` and steps full physics. | Host includes all `AI` slots in its 25Hz `WORLD_TICK` packet. |
| **`AI` (On Client)** / **`REMOTE_HUMAN`** | **Remote Owner (25Hz) + Local Dead-Reckoning (60Hz)**. Local browser smoothly blends position/yaw toward latest network snapshot while predicting velocity and animating wheels, drift sparks, and suspension at 60Hz. | Receives `KartNetState` packets and applies smooth Hermite/exponential interpolation. |

---

## 4. Mid-Race Hot-Join ("Replace an AI Bot") Flow

1. **Discovery**:
   - Player B opens the **Online Lobby** modal or bar on the Select screen and sees an active room (e.g., *"Cul-de-Sac Cup — Suburbia Circuit (Lap 2/3, 1/4 Players, 3 AI Bots Open)"*).
2. **Join Request**:
   - Player B picks their preferred Character (e.g., *Rex Ironclad*) and Kart Chassis (e.g., *Goliath Tank*) and clicks **Join & Replace AI**.
   - Player B joins `"gutsykarts:room:<roomId>"` and sends `JOIN_REQUEST` (`peerId`, `playerName`, `characterId`, `kartId`).
3. **Slot Assignment & `WELCOME_SNAPSHOT` (Host -> Joiner)**:
   - The Host selects an `AI`-controlled slot (`slotIndex` 1, 2, or 3).
   - The Host updates that slot's owner to Player B's `peerId`, swaps the slot's character/kart to Player B's choice via `racer.swapRacerIdentity(newStats, playerName)`, and replies with `WELCOME_SNAPSHOT`:
     - Complete `CustomTrackDefinition` (so even custom tracks from the Track Editor load identically!).
     - Current `racePhase` (`COUNTDOWN` | `RACING`), `countdownRemaining`, and `elapsedRaceMs`.
     - Assigned `slotIndex`.
     - Full state of all 4 slots (`slotIndex`, `ownerPeerId`, `playerName`, `characterId`, `kartId`, `position`, `velocity`, `headingYaw`, `forwardSpeed`, `lap`, `maxLapReached`, `checkpointsMask`, `totalProgressDistance`, `heldItem`, `boostTimer`, `novaOverdriveTimer`, `nitroBoostTimer`).
     - Active item box cooldowns, live projectiles, and deployed cryo mines.
4. **Instant Takeover**:
   - Player B's browser loads the track, spawns all 4 karts at their live positions, sets `racers[assignedSlot].controllerMode = "LOCAL_HUMAN"`, attaches the camera to `racers[assignedSlot]`, and begins driving immediately!
   - All other players receive a `SLOT_SWAP` event, hot-swap the 3D kart mesh on `racers[assignedSlot]` in `< 1ms`, and see a HUD banner: **`"PLAYER B REPLACED AI BOT IN SLOT #2!"`**.

---

## 5. Physics, Collisions & Item Synchronization

### 5.1 Asymmetric Mass Collisions ("The Juggernaut vs. Featherweight Law")
Per `AGENTS.md`, when Kart A and Kart B collide, cubic mass dominance ($\gamma = 3.0$) determines knockback:
$$\alpha_A = \frac{M_B^3}{M_A^3 + M_B^3}, \quad \alpha_B = \frac{M_A^3}{M_A^3 + M_B^3}$$
When $M_B - M_A \ge 40$ (or $M_B > 1.3 M_A$), Kart B is an **Unbudgeable Juggernaut** ($<3\%$ speed loss) while Kart A receives an outward bounce impulse, a vertical hop ($v_y = 4.5$), and a $0.35\text{s}$ yaw wobble stun.

**How this is synchronized over the network**:
- Each human player checks collisions locally at 60Hz for immediate responsiveness.
- Whenever a collision involving a remote kart occurs, a reliable **`COLLISION_IMPULSE_EVENT`** is transmitted containing the exact `knockVelocity`, `verticalVelocity`, `wobbleTimer`, and `AsymmetricCollisionReport`.
- The lighter kart's owner applies the authoritative impulse immediately so both screens experience the exact same Juggernaut launch and HUD banner.

### 5.2 Power-Ups & Item Boxes (`ItemManager.ts`)
- **Item Box Pickups**: Deterministic item box IDs (`box_row_col`) allow any kart picking up a box to broadcast `ITEM_BOX_PICKUP` (`boxId`, `racerId`), hiding the box and starting its respawn timer on all clients.
- **Power-Up Activation (`NITRO_CORE`, `NOVA_OVERDRIVE`, `CRYO_MINE`, `RICOCHET_DISC`, `PULSE_SEEKER`)**:
  - When any human or AI racer fires an item, a reliable `ITEM_ACTIVATE_EVENT` is broadcast with the caster's `slotIndex`, `PowerUpType`, and initial spawn position/heading so all clients spawn the exact projectile/mine/Nova Overdrive core and display the HUD announcement banner.
  - When a projectile or mine strikes a kart, `ITEM_HIT_EVENT` ensures the victim spins out (`triggerSpinOut`) consistently across all peers.

---

## 6. Automatic Host Migration (Mobile Sleep & Disconnect Protection)

Mobile browsers (iOS Safari, Android Chrome) pause `requestAnimationFrame` when a user switches apps or locks their phone. To prevent a sleeping Host from freezing the race:

1. **Ordered Peer Roster**: Every human player in the room has a known `(joinedAt, peerId)` tuple.
2. **Continuous World Replication**: Because the Host broadcasts the state of all 4 slots (including `AI` slots' `lap`, `checkpointsMask`, and `totalProgressDistance`) 25 times per second, every client always holds a live replica of the race state.
3. **1.5-Second Timeout & Promotion**:
   - Every client monitors `lastHostPacketTime`.
   - If the Host disconnects or stops ticking for `> 1,500 ms`, the old Host's slot is marked as `AI` (`controllerMode = "AI"`).
   - Among remaining active peers, the peer with the lowest `(joinedAt, peerId)` automatically sets `isHost = true`, begins stepping `computeAiInputs()` for all `AI` slots, and updates the Lobby Presence advertisement.

---

## 7. Supabase Configuration & Zero-Config Fallback

### Environment Variables (`.env.local`)
To connect to your Supabase project for global online play across any network:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key

# Optional: Custom TURN server for strict 5G/LTE symmetric NATs
# (Even without TURN, Supabase Realtime Broadcast automatically relays packets if WebRTC UDP is blocked!)
NEXT_PUBLIC_TURN_URL=turn:openrelay.metered.ca:80
NEXT_PUBLIC_TURN_USERNAME=openrelayproject
NEXT_PUBLIC_TURN_CREDENTIAL=openrelayproject
```

* **Zero Database Tables Required**: Gutsy Karts uses **Supabase Realtime Presence** and **Supabase Realtime Broadcast** (ephemeral in-memory channels on Supabase's edge network). You do **not** need to run SQL migrations or manage database tables!
* **Dual-Transport Resilience (WebRTC + Supabase Broadcast)**:
  - As soon as two peers join a room channel, they negotiate a direct **WebRTC `RTCDataChannel`** for lowest possible latency.
  - While the WebRTC handshake is negotiating—or if a mobile carrier blocks UDP completely—packets seamlessly route through **Supabase Realtime Broadcast** (`self: false`, WebSocket edge relay) so mobile players **never** fail to connect.
* **Offline & Unconfigured Fork Resilience (Zero Errors Guarantee)**:
  - If a developer forks or clones the repository and runs `npm run dev` **without** setting `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or when completely offline / when Supabase cannot be reached):
    1. **Single-player mode works 100% normally** with **zero console errors, zero failed network requests, and zero broken UI**.
    2. When Supabase env vars are absent, `MultiplayerManager` never attempts external network connections; instead, it silently activates a **Local Cross-Tab (`BroadcastChannel` + `RTCDataChannel`)** transport.
    3. This means anyone running a fresh fork locally can still play single-player uninterrupted *and* can even test multiplayer lobby discovery, mid-race AI bot takeover, and host migration across two local browser tabs with zero configuration!
    4. If Supabase env vars *are* provided but the client loses internet connectivity or the endpoint fails to connect, all errors are caught gracefully and the UI displays a calm status pill (`"Offline / Local Mode"`) without throwing runtime exceptions.

---

## 8. Codebase Implementation Map (Files & Key Methods)

Here is the complete reference of every file and method that powers the multiplayer system so you can easily navigate or extend it in the future:

### 1. [`src/types/game.ts`](file:///home/oleboi/gutsykarts/src/types/game.ts)
Defines the multiplayer state and wire-protocol types:
- `RacerControlMode`: `'LOCAL' | 'AI' | 'REMOTE'` — determines how each of the 4 racer slots is stepped during the 60Hz physics loop.
- `NetworkBackendStatus`: `'SUPABASE_ONLINE' | 'SUPABASE_CONNECTING' | 'LOCAL_CROSS_TAB' | 'OFFLINE_SINGLEPLAYER'` — tracks the current network transport state.
- `OnlinePlayerPresence` & `OnlineRoomSummary`: Lobby presence structures showing who is online, which rooms are active, human/AI slot counts, and whether a race is joinable mid-race (`raceElapsedMs`).
- `RoomPeerEntry`: Maps each slot (`0..3`) to a peer ID, player name, character ID, kart ID, and join timestamp (`joinedAt` is used for deterministic host migration).
- `KartNetState`: Compact 25Hz telemetry packet (`slotIndex`, `position`, `velocity`, `headingYaw`, `visualPitch`, `visualRoll`, `steerAngle`, `wheelSpinAccum`, `driftState`, `driftChargeTier`, `miniTurboTimer`, `hopTimer`, `knockbackWobbleTimer`, `nitroBoostTimer`, `novaOverdriveTimer`, `shieldActive`, `heldItem`, `lap`, `checkpointsMask`, `totalProgressDistance`, `finished`, `finishTimeMs`).
- `WelcomeSnapshotPayload` & `SlotTakeoverPayload`: Payloads sent when a player hot-joins an active race and takes over an AI bot slot.
- `NetCollisionImpulsePayload`, `NetItemActivatePayload`, `NetItemBoxPickupPayload`: Event-driven packets for Juggernaut collisions, item usage, and item box pickups.

### 2. [`src/game/network/MultiplayerManager.ts`](file:///home/oleboi/gutsykarts/src/game/network/MultiplayerManager.ts)
Self-contained networking engine managing lobby discovery, room signaling, WebRTC DataChannels, Broadcast fallback, and host migration:
- `initLobbyTransports()`:
  - Checks `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` (ignoring blank values or `.env.example` placeholders).
  - Always initializes a local `BroadcastChannel('gutsykarts:lobby:bc')` first so same-device multi-tab testing works immediately.
  - Only imports and initializes `@supabase/supabase-js` if valid credentials exist, wrapping all channel subscriptions and presence calls in `try / catch` blocks so unconfigured forks or offline browsers never throw runtime errors or spam network requests.
- `hostRoom(trackId, characterId, kartId)`:
  - Creates a new 4-slot room with the local player as Host in Slot `0` and AI bots filling Slots `1..3`, then joins the room channel (`gutsykarts:room:<roomId>`).
- `joinRoom(roomSummary, characterId, kartId)`:
  - Connects to an existing room's signaling channel and broadcasts `JOIN_REQUEST` to the Host so the joining player can take over an open AI bot slot (`1..3`).
- `handleJoinRequest()` (Host-side):
  - Finds the first AI-controlled slot (`1..3`) not already claimed by a human peer, assigns the joining player's `peerId`, `playerName`, `characterId`, and `kartId` to that slot, fires `onSlotTakeover` locally so the Host swaps the AI bot into a `REMOTE` human racer, and sends a `WELCOME_SNAPSHOT` + `SLOT_TAKEOVER` broadcast to all peers.
- `ensurePeerConnection(remotePeerId, polite)`:
  - Establishes a direct `RTCPeerConnection` between peers with two `RTCDataChannel`s:
    - `fast` (`ordered: false, maxRetransmits: 0`): Unreliable, unordered UDP-like channel for 25Hz kart state updates (`KART_STATE_BATCH` / `CLIENT_KART_STATE`).
    - `reliable` (`ordered: true`): Reliable channel for `WELCOME_SNAPSHOT`, `SLOT_TAKEOVER`, `COLLISION_IMPULSE`, `ITEM_ACTIVATE`, and `ITEM_BOX_PICKUP`.
  - If the WebRTC DataChannel is still connecting or blocked by a strict mobile carrier firewall, `sendRoomMessage()` automatically falls back to Supabase Realtime Broadcast (`channel.send({ type: 'broadcast' })`) or local `BroadcastChannel`.
- `checkHostMigrationAndLiveness()` & `triggerHostMigration()`:
  - Runs every `500ms`. If the current Host stops sending packets for `> 2,100ms` (or explicitly leaves/locks their phone), the old Host's slot reverts to `'AI'` control (`onSlotRevertToAi`) and the remaining human peer with the earliest `(joinedAt, peerId)` automatically promotes to Host (`isHost = true`) and takes over stepping the remaining AI bots.

### 3. [`src/game/physics/KartController.ts`](file:///home/oleboi/gutsykarts/src/game/physics/KartController.ts)
- `controlMode: RacerControlMode` (`'LOCAL' | 'AI' | 'REMOTE'`):
  - `'LOCAL'`: Driven by the local player's keyboard/touch inputs (`localSlotIndex` can be `0`, `1`, `2`, or `3` depending on which slot the player joined into).
  - `'AI'`: Driven by the Host's `computeAiInputs()` spline lookahead & obstacle avoidance.
  - `'REMOTE'`: Driven by another human player or the Host over the network; uses dead-reckoning + interpolation instead of local physics integration.
- `swapRacerIdentity(newCharacter, newKart, newPlayerName, newControlMode, newOwnerPeerId)`:
  - Called during mid-race AI takeover. Disposes the old procedural 3D `KartAssembly` mesh (`this.assembly.dispose()`) and calls `buildProceduralKart()` for the joining player's chosen character and kart, then copies the exact live `position`, `headingYaw`, `visualPitch`, `visualRoll`, `velocity`, `lap`, `checkpointsMask`, `totalProgressDistance`, and `heldItem` so the new player seamlessly takes over that racer in-flight.
- `updateRemoteInterpolation(dt)`:
  - Runs at 60Hz for `'REMOTE'` karts. Extrapolates position along the last known velocity vector (`deadReckonDt = min(ageSec, 0.12)`) and blends smoothly toward the target transform (`posBlend = min(1, dt * 16)`), while continuing to spin wheels, orient steering knuckles, and emit drift/exhaust/nitro particles locally.
- `applyNetworkCollisionImpulse(dvx, dvz, vyHop, wobbleDuration)`:
  - Applies an authoritative Juggernaut knockback impulse (`dvx`, `dvz`, vertical hop `vy`, and yaw wobble stun) when a collision is reported over the network.

### 4. [`src/game/items/ItemManager.ts`](file:///home/oleboi/gutsykarts/src/game/items/ItemManager.ts)
- `exportBoxRespawnTimers()` & `applyBoxRespawnTimers()`: Synchronizes active item box cooldown timers in the `WELCOME_SNAPSHOT` when a player hot-joins mid-race.
- `applyNetworkBoxPickup(boxIndex)`: Immediately triggers the item box break burst and respawn timer when a remote player picks up a box.
- `ensureNovaOverdriveCore(kart)`: Safely re-parents the orbiting Nova Overdrive core visual mesh if a kart's 3D assembly was rebuilt during a mid-race hot-swap.

### 5. [`src/components/RaceGame.tsx`](file:///home/oleboi/gutsykarts/src/components/RaceGame.tsx)
- **Online Multiplayer & Hot-Join Lobby Bar** (on the `SELECT` screen):
  - Displays the connection mode badge (`Supabase Realtime + WebRTC P2P`, `Local Cross-Tab Mode (No Supabase Keys Needed)`, or `Single-Player Mode (Offline-Safe)`).
  - Editable **Callsign** input saved to `localStorage`.
  - Shows **Players Online** badges and the **Live Open Races** list with **HOT-JOIN** buttons (replaces an AI bot mid-race) and **HOST ONLINE RACE**.
- **In-Race HUD Status & Live 4-Slot Standings**:
  - Top bar shows whether you are `HOSTING` or `CONNECTED`, human/AI count, and a `SHARE ROOM CODE` button.
  - Bottom-left standings panel shows all 4 slots sorted by race position with `YOU`, `ONLINE`, or `AI` badges.
  - Toast banner announces mid-race events (`"⚡ Alex hot-joined Slot #2 (replacing AI)!"`, `"👑 Host migrated — you are now the room Host!"`).

---

## 9. How to Test Locally Without Supabase (Cross-Tab Mode)

You can test the entire multiplayer flow right now on a single computer **before** configuring Supabase:

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open **Tab 1** at `http://localhost:3000`.
3. Click **ENTER GARAGE & LOBBY**. Notice the status pill says **`Local Cross-Tab Mode (No Supabase Keys Needed)`**.
4. In Tab 1, click **HOST ONLINE RACE (OTHERS CAN HOT-JOIN)**. The countdown will finish and Tab 1 will start racing against 3 AI bots.
5. Open **Tab 2** at `http://localhost:3000` (side-by-side window) and click **ENTER GARAGE & LOBBY**.
6. In Tab 2's **Online Multiplayer & Hot-Join Lobby** panel, you will see Tab 1 appearing under **Players Online** and Tab 1's active race under **Live Open Races (Hot-Join Replaces AI Bot)** showing `1/4 HUMANS • 3 AI OPEN • RACING IN PROGRESS`.
7. Pick any character and kart in Tab 2 and click **HOT-JOIN** on Tab 1's room.
8. **Observe Mid-Race AI Takeover**:
   - Tab 2 immediately spawns directly into Slot #2 at the exact position, velocity, and lap where the AI bot was driving!
   - Both tabs display a toast notification and update the bottom-left 4-Slot Standings badge from `AI` to `ONLINE` / `YOU`.
   - Try ramming each other with a Heavyweight vs. Featherweight kart to see the Juggernaut knockback sync across both windows, or close Tab 1 to watch Tab 2 automatically promote itself to Host (`👑 Host migrated`)!

---

## 10. Step-by-Step Supabase Project Setup Guide

Setting up Supabase for global internet & mobile play takes less than 3 minutes and works completely within the **Supabase Free Tier** ($0/month). Because Gutsy Karts uses ephemeral **Supabase Realtime Presence & Broadcast**, **you do NOT need to create any SQL database tables or schemas**.

### Step 1: Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Choose your organization, give the project a name (e.g., `gutsy-karts`), generate any database password, and pick the region closest to you/your players.
4. Click **Create new project** and wait ~60 seconds for provisioning to finish.

### Step 2: Copy Your Project URL and Anon Public Key
1. In your Supabase project dashboard, look at the left sidebar and click **Project Settings** (the gear icon ⚙️ at the bottom) -> **API** (or click the **Connect** button at the top bar).
2. Copy two values:
   - **Project URL**: Looks like `https://abcdefghijklmnop.supabase.co`
   - **Project API Keys -> `anon` `public`**: Looks like a long `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` token (or `sb_publishable_...` key).
   > **Note**: Never use the `service_role` secret key in `.env.local`—only use the `anon` / `publishable` public key!

### Step 3: Create `.env.local` in Your Project Root
1. In the `/home/oleboi/gutsykarts` directory, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Paste your Supabase URL and Anon Key into `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```
3. Restart your Next.js dev server (`npm run dev`).
4. Open the game and enter the Garage & Lobby—the status badge in the **Online Multiplayer & Hot-Join Lobby** header will now light up green with **`Supabase Realtime + WebRTC P2P`**!

### Step 4: (Optional) Deploying for Mobile Devices
To play across phones, tablets, and laptops over Wi-Fi or 5G/LTE:
1. Deploy the Next.js app to **Vercel** (or Netlify / Cloudflare Pages).
2. In your hosting dashboard's **Environment Variables** settings, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Open the deployed URL on your phone and on your PC—both devices will discover each other in real time via Supabase Presence and race together via WebRTC P2P + Supabase Broadcast fallback!

---

## 11. Dedicated Server / Spectator Host Mode (4 Open Slots & 24/7 Auto-Loop)

Gutsy Karts includes a built-in **Dedicated Server / Spectator Host Mode** directly in the web client so you can leave a spare computer, laptop, or browser tab running an always-on public race room where **all 4 racer slots (`#1`–`#4`) are open for human players**.

### How It Works Under the Hood
- **Zero-Player Host (`localSlotIndex = -1`)**:
  - Normally, a Host drives Slot `#1` (`LOCAL_HUMAN`) and runs 3 AI bots (`Slots #2–#4`).
  - In **Dedicated Server Mode**, the Host sets `localSlotIndex = -1` and initializes **all 4 slots (`#1`–`#4`) as `"AI"` bots** (`0/4 HUMANS • 4 AI OPEN`).
  - Up to **4 remote human players** can hot-join and take over all 4 slots while the Dedicated Host simulates AI (when `< 4` humans are present), arbitrates item pickups/hazards, and broadcasts authoritative `25Hz` `WORLD_TICK` snapshots.
- **Step Out to Spectate / Jump In & Drive On the Fly**:
  - **Step Out Mid-Race**: If you are currently hosting and driving a kart, click **`STEP OUT TO SPECTATE`** in the top-left multiplayer HUD bar. Your kart immediately hands its steering wheel to an `"AI"` bot at its exact current position, velocity, and lap, switches your view to the **Spectator TV Camera**, and broadcasts a `SLOT_TAKEOVER` (`controlMode: "AI"`) so a 4th human player can hot-join your slot!
  - **Jump In Mid-Race**: While spectating as the Host, if at least 1 slot is currently driven by an AI bot (`aiCount > 0`), click **`JUMP IN & DRIVE`** in the top bar (or in the bottom Spectator TV bar) to seamlessly take over an AI slot (`controlMode: "LOCAL_HUMAN"`) using your selected character and kart.
- **Spectator TV Camera & Live Telemetry**:
  - When spectating (`localSlotIndex = -1`), a **Dedicated Spectator Server TV Bar** appears at the bottom of the screen:
    - **`AUTO-DIRECTOR (LEADER)`**: Automatically tracks whichever racer is currently in **1st Place**.
    - **`#1` / `#2` / `#3` / `#4` Camera Buttons**: Click any slot button (or press keys `1`–`4`, `Tab`, or click any row in the bottom-left 4-Slot Standings table) to lock the chase camera onto that specific racer.
    - All HUD gauges (Speedometer, Surface Indicator, Drift Boost Meter, Held Item Slot, Lap Counter, and Rank) dynamically bind to the currently spectated kart.
- **Unattended 24/7 Cup Auto-Loop (`preserveExistingRoom`)**:
  - When a race finishes in Dedicated Server mode, the Podium screen shows a **10-second auto-advance countdown** (`DEDICATED SERVER AUTO-ADVANCING TO NEXT RACE IN Xs...`) with a toggleable **`24/7 AUTO-LOOP ON`** button.
  - When the timer reaches `0`, the server automatically advances to the next track in the Cup (and wraps back to Track 1 after the final track of a Cup) while **preserving the existing online Room ID and all connected human peers** (`preserveExistingRoom: true`).
  - Connected human players automatically receive a fresh `WELCOME_SNAPSHOT` for the new track and transition straight into the next race together without having to rejoin from the lobby.
- **Background Tab Keep-Alive (`25Hz`)**:
  - Browsers normally pause `requestAnimationFrame` when a window is minimized or hidden behind another app.
  - When hosting an online room, [`RaceGame.tsx`](file:///home/oleboi/gutsykarts/src/components/RaceGame.tsx) runs a fallback `40ms` (`25Hz`) background timer (`bgServerKeepAliveInterval`) whenever `document.visibilityState === "hidden"` or the render loop hasn't stepped in `>95ms`. This ensures physics simulation, AI bots, and `25Hz` `WORLD_TICK` network broadcasts keep running smoothly even if your dedicated server window is minimized on your other computer.

### How to Run a Dedicated Server on Your Second Computer
1. Open the game (either `http://localhost:3000` with `.env.local` configured, or your live production URL) on your spare computer.
2. Click **ENTER GARAGE & LOBBY**, set your server callsign (e.g., `GUTSY-DEDICATED-1`), and pick a Cup.
3. Click the purple **`DEDICATED SERVER (4 SLOTS)`** button in the Online Multiplayer panel.
4. That's it! Your server will launch into Track 1 with **4 open slots**, broadcast itself with a **`DEDICATED SERVER`** badge in the global lobby, and continuously cycle through the Cup 24/7 as players drop in and out.

