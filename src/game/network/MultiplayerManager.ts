import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  CustomTrackDefinition,
  KartNetState,
  NetCollisionImpulsePayload,
  NetItemActivatePayload,
  NetItemBoxPickupPayload,
  NetworkBackendStatus,
  OnlinePlayerPresence,
  OnlineRoomSummary,
  RoomPeerEntry,
  SlotTakeoverPayload,
  WelcomeSnapshotPayload,
} from "@/src/types/game";

export type RoomWireMessage =
  | {
      type: "JOIN_REQUEST";
      senderId: string;
      targetHostId: string;
      playerName: string;
      characterId: string;
      kartId: string;
      joinedAt: number;
    }
  | {
      type: "WELCOME_SNAPSHOT";
      senderId: string;
      targetPeerId: string;
      payload: WelcomeSnapshotPayload;
    }
  | {
      type: "SLOT_TAKEOVER";
      senderId: string;
      payload: SlotTakeoverPayload;
    }
  | {
      type: "HOST_WORLD_TICK";
      senderId: string;
      seq: number;
      racePhase: "COUNTDOWN" | "RACING" | "FINISHED";
      countdownRemaining: number;
      elapsedRaceMs: number;
      slots: KartNetState[];
      peers: RoomPeerEntry[];
    }
  | {
      type: "CLIENT_KART_TICK";
      senderId: string;
      seq: number;
      slot: KartNetState;
    }
  | {
      type: "CLIENT_READY";
      senderId: string;
      slotIndex: number;
    }
  | {
      type: "CLAIM_AI_SLOT";
      senderId: string;
      targetHostId: string;
      playerName: string;
      characterId: string;
      kartId: string;
      preferredSlotIndex?: number;
    }
  | {
      type: "STEP_OUT_SPECTATE";
      senderId: string;
      slotIndex: number;
    }
  | {
      type: "COLLISION_IMPULSE";
      senderId: string;
      eventId: string;
      payload: NetCollisionImpulsePayload;
    }
  | {
      type: "ITEM_ACTIVATE";
      senderId: string;
      eventId: string;
      payload: NetItemActivatePayload;
    }
  | {
      type: "ITEM_BOX_PICKUP";
      senderId: string;
      eventId: string;
      payload: NetItemBoxPickupPayload;
    }
  | {
      type: "PEER_LEAVE";
      senderId: string;
      slotIndex: number;
    }
  | {
      type: "HOST_MIGRATED";
      senderId: string;
      newHostPeerId: string;
      newHostName: string;
      oldHostPeerId: string;
      oldHostSlotIndex: number;
      peers: RoomPeerEntry[];
    }
  | {
      type: "WEBRTC_SIGNAL";
      senderId: string;
      targetPeerId: string;
      signalType: "offer" | "answer" | "ice";
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };

interface PeerRtcBundle {
  peerId: string;
  pc: RTCPeerConnection;
  fastChannel: RTCDataChannel | null;
  reliableChannel: RTCDataChannel | null;
  isConnected: boolean;
}

export interface MultiplayerCallbacks {
  onLobbyUpdated?: (
    players: OnlinePlayerPresence[],
    rooms: OnlineRoomSummary[],
    backendStatus: NetworkBackendStatus
  ) => void;
  onJoinRequest?: (req: {
    peerId: string;
    playerName: string;
    characterId: string;
    kartId: string;
    joinedAt: number;
  }) => void;
  onClaimAiSlot?: (req: {
    peerId: string;
    playerName: string;
    characterId: string;
    kartId: string;
    preferredSlotIndex?: number;
  }) => void;
  onClientStepOut?: (peerId: string, slotIndex: number) => void;
  onWelcomeSnapshot?: (snapshot: WelcomeSnapshotPayload) => void;
  onSlotTakeover?: (takeover: SlotTakeoverPayload) => void;
  onHostWorldTick?: (tick: {
    senderId: string;
    racePhase: "COUNTDOWN" | "RACING" | "FINISHED";
    countdownRemaining: number;
    elapsedRaceMs: number;
    slots: KartNetState[];
    peers: RoomPeerEntry[];
  }) => void;
  onClientKartTick?: (slot: KartNetState, senderId: string) => void;
  onClientReady?: (peerId: string, slotIndex: number) => void;
  onCollisionImpulse?: (payload: NetCollisionImpulsePayload) => void;
  onItemActivate?: (payload: NetItemActivatePayload) => void;
  onItemBoxPickup?: (payload: NetItemBoxPickupPayload) => void;
  onPeerLeave?: (peerId: string, slotIndex: number) => void;
  onHostMigrated?: (info: {
    newHostPeerId: string;
    newHostName: string;
    oldHostPeerId: string;
    oldHostSlotIndex: number;
    peers: RoomPeerEntry[];
  }) => void;
}

function generatePeerId(): string {
  if (typeof window !== "undefined") {
    try {
      const existing = window.sessionStorage.getItem("gutsy_karts_peer_id");
      if (existing) return existing;
      const created = `peer_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
      window.sessionStorage.setItem("gutsy_karts_peer_id", created);
      return created;
    } catch {
      // Ignore sessionStorage errors in restricted iframes
    }
  }
  return `peer_${Math.random().toString(36).slice(2, 10)}`;
}

export function loadOrCreatePlayerName(): string {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem("gutsy_karts_player_name");
      if (saved && saved.trim().length > 0) return saved.trim().slice(0, 18);
      const callsigns = [
        "SuburbiaAce",
        "CulDeSacKing",
        "TurboSkater",
        "ArcadeDrifter",
        "NeonCruiser",
        "SparkPlug",
        "GritRacer",
      ];
      const pick = callsigns[Math.floor(Math.random() * callsigns.length)];
      const generated = `${pick}${Math.floor(10 + Math.random() * 89)}`;
      window.localStorage.setItem("gutsy_karts_player_name", generated);
      return generated;
    } catch {
      // Ignore storage errors
    }
  }
  return "GutsyRacer";
}

export class MultiplayerManager {
  public readonly peerId: string;
  public playerName: string;
  public characterId: string;
  public kartId: string;

  public backendStatus: NetworkBackendStatus = "LOCAL_FALLBACK";
  public activeRoomId: string | null = null;
  public isHost = false;
  public isDedicatedServer = false;
  public localSlotIndex = 0;
  public hostPeerId: string | null = null;
  public hostName = "";
  public roomPeers: RoomPeerEntry[] = [];

  private callbacks: MultiplayerCallbacks;
  private supabase: SupabaseClient | null = null;
  private supabaseLobbyChannel: RealtimeChannel | null = null;
  private supabaseRoomChannel: RealtimeChannel | null = null;

  private localLobbyBus: BroadcastChannel | null = null;
  private localRoomBus: BroadcastChannel | null = null;

  private rtcPeers = new Map<string, PeerRtcBundle>();
  private processedEventIds = new Set<string>();
  private lastHostSeq = -1;
  private lastClientSeqByPeer = new Map<string, number>();
  private lastPeerActivityTime = new Map<string, number>();
  private outgoingSeq = 1;

  private onlinePlayersMap = new Map<string, OnlinePlayerPresence>();
  private openRoomsMap = new Map<string, OnlineRoomSummary>();
  private currentRoomSummary: OnlineRoomSummary | null = null;

  private lobbyHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastSupabaseLobbyBroadcastAt = 0;
  private lastSupabaseRelayTickAt = 0;
  private lastHostPacketTime = 0;
  private hostMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(
    initialCharacterId: string,
    initialKartId: string,
    callbacks: MultiplayerCallbacks
  ) {
    this.peerId = generatePeerId();
    this.playerName = loadOrCreatePlayerName();
    this.characterId = initialCharacterId;
    this.kartId = initialKartId;
    this.callbacks = callbacks;

    this.initLobbyTransports();
  }

  public setCallbacks(callbacks: MultiplayerCallbacks): void {
    this.callbacks = callbacks;
  }

  public setPlayerIdentity(
    playerName: string,
    characterId: string,
    kartId: string
  ): void {
    const trimmed = playerName.trim().slice(0, 18);
    const nextName = trimmed.length > 0 ? trimmed : this.playerName;
    const changed =
      nextName !== this.playerName ||
      characterId !== this.characterId ||
      kartId !== this.kartId;

    if (trimmed.length > 0) {
      this.playerName = trimmed;
      try {
        window.localStorage.setItem("gutsy_karts_player_name", trimmed);
      } catch {
        // Ignore storage errors
      }
    }
    this.characterId = characterId;
    this.kartId = kartId;
    if (changed) {
      this.broadcastLobbyPresence(true);
    }
  }

  private getIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
    ];
    try {
      const turnUrl = process.env.NEXT_PUBLIC_TURN_URL?.trim();
      const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
      const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();
      if (turnUrl) {
        servers.push({
          urls: turnUrl,
          username: turnUser || undefined,
          credential: turnCred || undefined,
        });
      }
    } catch {
      // Ignore env read errors
    }
    return servers;
  }

  private initLobbyTransports(): void {
    if (typeof window === "undefined") return;

    // 1. Always initialize zero-config Local Cross-Tab BroadcastChannel (never fails offline!)
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.localLobbyBus = new BroadcastChannel("gutsykarts_lobby_v1");
        this.localLobbyBus.onmessage = (ev) => {
          if (this.disposed || !ev.data) return;
          this.handleLobbyBusPayload(ev.data);
        };
      }
    } catch {
      // BroadcastChannel unavailable in some legacy environments; ignore cleanly
    }

    // 2. Check if Supabase Realtime is configured via environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

    const hasValidSupabaseConfig =
      (supabaseUrl.startsWith("https://") || supabaseUrl.startsWith("http://")) &&
      !supabaseUrl.includes("your-project-id") &&
      supabaseKey.length > 15 &&
      supabaseKey !== "your-public-anon-key";

    if (hasValidSupabaseConfig) {
      try {
        this.backendStatus = "CONNECTING";
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: {
            params: { eventsPerSecond: 40 },
          },
        });

        const channel = this.supabase.channel("gutsykarts:lobby", {
          config: {
            presence: { key: this.peerId },
            broadcast: { self: false },
          },
        });

        channel
          .on("presence", { event: "sync" }, () => {
            if (this.disposed) return;
            try {
              const state = channel.presenceState<OnlinePlayerPresence>();
              const now = Date.now();
              for (const [key, presences] of Object.entries(state)) {
                if (presences && presences.length > 0) {
                  const latest = presences[presences.length - 1];
                  this.onlinePlayersMap.set(key, {
                    ...latest,
                    peerId: key,
                    updatedAt: now,
                  });
                }
              }
              this.pruneAndNotifyLobby();
            } catch {
              // Ignore malformed presence state
            }
          })
          .on("presence", { event: "join" }, ({ key }) => {
            if (this.disposed || !key || key === this.peerId) return;
            // When a new player enters the lobby while we are hosting a room, announce our room so they see it immediately
            if (this.isHost && this.activeRoomId) {
              this.broadcastLobbyPresence(true);
            }
          })
          .on("presence", { event: "leave" }, ({ key }) => {
            if (this.disposed || !key || key === this.peerId) return;
            this.onlinePlayersMap.delete(key);
            for (const [roomId, room] of this.openRoomsMap.entries()) {
              if (room.hostPeerId === key) {
                this.openRoomsMap.delete(roomId);
              }
            }
            this.pruneAndNotifyLobby();
          })
          .on("broadcast", { event: "lobby_bus" }, ({ payload }) => {
            if (this.disposed || !payload) return;
            this.handleLobbyBusPayload(payload);
          })
          .subscribe(async (status) => {
            if (this.disposed) return;
            if (status === "SUBSCRIBED") {
              this.backendStatus = "SUPABASE_ONLINE";
              try {
                await channel.track(this.buildLocalPresence());
              } catch {
                // Ignore track error
              }
              this.broadcastLobbyPresence(true);
              this.pruneAndNotifyLobby();
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              // Fail gracefully to Local Fallback without console errors
              this.backendStatus = "LOCAL_FALLBACK";
              this.pruneAndNotifyLobby();
            }
          });

        this.supabaseLobbyChannel = channel;
      } catch {
        this.backendStatus = "LOCAL_FALLBACK";
      }
    } else {
      this.backendStatus = "LOCAL_FALLBACK";
    }

    // Seed our own presence immediately
    this.onlinePlayersMap.set(this.peerId, this.buildLocalPresence());
    this.broadcastLobbyPresence(true);
    this.pruneAndNotifyLobby();

    // Periodic heartbeat (every 2.5s locally; throttled to every 8s on Supabase) to keep presence & open rooms fresh without wasting Realtime quota
    this.lobbyHeartbeatTimer = setInterval(() => {
      if (this.disposed) return;
      this.broadcastLobbyPresence(false);
      this.pruneAndNotifyLobby();
    }, 2500);
  }

  private buildLocalPresence(): OnlinePlayerPresence {
    return {
      peerId: this.peerId,
      playerName: this.playerName,
      characterId: this.characterId,
      kartId: this.kartId,
      status: this.activeRoomId
        ? this.isHost
          ? this.isDedicatedServer
            ? "DEDICATED_HOST"
            : "HOSTING"
          : "RACING"
        : "LOBBY",
      roomId: this.activeRoomId,
      roomTrackName: this.currentRoomSummary?.trackName,
      updatedAt: Date.now(),
    };
  }

  public updateHostedRoomSummary(summary: Omit<OnlineRoomSummary, "roomId" | "hostPeerId" | "hostName" | "updatedAt">): void {
    if (!this.activeRoomId || !this.isHost) return;
    const prev = this.currentRoomSummary;
    const prevSlotsSig = prev
      ? prev.slotSummaries
          .map((s) => `${s.slotIndex}:${s.isHuman ? 1 : 0}:${s.playerName}:${s.characterId}:${s.kartId}`)
          .join("|")
      : "";
    const nextSlotsSig = summary.slotSummaries
      .map((s) => `${s.slotIndex}:${s.isHuman ? 1 : 0}:${s.playerName}:${s.characterId}:${s.kartId}`)
      .join("|");

    const hasMeaningfulChange =
      !prev ||
      prev.cupId !== summary.cupId ||
      prev.trackIdx !== summary.trackIdx ||
      prev.trackName !== summary.trackName ||
      prev.racePhase !== summary.racePhase ||
      prev.currentLap !== summary.currentLap ||
      prev.humanCount !== summary.humanCount ||
      prev.aiDifficulty !== summary.aiDifficulty ||
      prev.isDedicatedServer !== this.isDedicatedServer ||
      prevSlotsSig !== nextSlotsSig;

    const fullSummary: OnlineRoomSummary = {
      ...summary,
      isDedicatedServer: this.isDedicatedServer,
      roomId: this.activeRoomId,
      hostPeerId: this.peerId,
      hostName: this.playerName,
      updatedAt: Date.now(),
    };
    this.currentRoomSummary = fullSummary;
    this.openRoomsMap.set(this.activeRoomId, fullSummary);
    this.broadcastLobbyPresence(hasMeaningfulChange);
    this.pruneAndNotifyLobby();
  }

  public setHostSpectatorMode(isDedicated: boolean, newSlotIndex: number): void {
    if (!this.activeRoomId || !this.isHost) return;
    this.isDedicatedServer = isDedicated;
    this.localSlotIndex = newSlotIndex;

    if (isDedicated || newSlotIndex < 0) {
      this.roomPeers = this.roomPeers.filter((p) => p.peerId !== this.peerId);
    } else {
      const others = this.roomPeers.filter(
        (p) => p.peerId !== this.peerId && p.slotIndex !== newSlotIndex
      );
      others.push({
        peerId: this.peerId,
        playerName: this.playerName,
        characterId: this.characterId,
        kartId: this.kartId,
        slotIndex: newSlotIndex,
        joinedAt: Date.now(),
      });
      others.sort(
        (a, b) => a.joinedAt - b.joinedAt || a.peerId.localeCompare(b.peerId)
      );
      this.roomPeers = others;
    }

    this.broadcastLobbyPresence(true);
    this.pruneAndNotifyLobby();
  }

  private broadcastLobbyPresence(forceSupabase = false): void {
    const now = Date.now();
    const presence = this.buildLocalPresence();
    this.onlinePlayersMap.set(this.peerId, presence);

    let roomToAnnounce: OnlineRoomSummary | null = null;
    if (this.isHost && this.activeRoomId && this.currentRoomSummary) {
      roomToAnnounce = {
        ...this.currentRoomSummary,
        isDedicatedServer: this.isDedicatedServer,
        hostPeerId: this.peerId,
        hostName: this.playerName,
        updatedAt: now,
      };
      this.openRoomsMap.set(this.activeRoomId, roomToAnnounce);
    }

    const packet = {
      kind: "LOBBY_HEARTBEAT",
      presence,
      room: roomToAnnounce,
    };

    try {
      this.localLobbyBus?.postMessage(packet);
    } catch {
      // Ignore local postMessage errors
    }

    if (
      this.supabaseLobbyChannel &&
      this.backendStatus === "SUPABASE_ONLINE" &&
      (forceSupabase || now - this.lastSupabaseLobbyBroadcastAt >= 8000)
    ) {
      this.lastSupabaseLobbyBroadcastAt = now;
      try {
        this.supabaseLobbyChannel
          .send({
            type: "broadcast",
            event: "lobby_bus",
            payload: packet,
          })
          .catch(() => {});
      } catch {
        // Ignore broadcast errors
      }
    }
  }

  private handleLobbyBusPayload(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as {
      kind?: string;
      presence?: OnlinePlayerPresence;
      room?: OnlineRoomSummary | null;
      closedRoomId?: string;
    };

    const now = Date.now();
    if (msg.kind === "LOBBY_HEARTBEAT") {
      if (msg.presence && msg.presence.peerId) {
        this.lastPeerActivityTime.set(msg.presence.peerId, now);
        this.onlinePlayersMap.set(msg.presence.peerId, {
          ...msg.presence,
          updatedAt: now,
        });
      }
      if (msg.room && msg.room.roomId) {
        this.openRoomsMap.set(msg.room.roomId, {
          ...msg.room,
          updatedAt: now,
        });
      }
      this.pruneAndNotifyLobby();
    } else if (msg.kind === "ROOM_CLOSED" && msg.closedRoomId) {
      this.openRoomsMap.delete(msg.closedRoomId);
      this.pruneAndNotifyLobby();
    }
  }

  private pruneAndNotifyLobby(): void {
    const now = Date.now();
    // Always keep local player fresh
    this.onlinePlayersMap.set(this.peerId, this.buildLocalPresence());

    for (const [peerId, p] of this.onlinePlayersMap.entries()) {
      if (peerId !== this.peerId && now - p.updatedAt > 22000) {
        this.onlinePlayersMap.delete(peerId);
      }
    }

    for (const [roomId, r] of this.openRoomsMap.entries()) {
      if (
        !(this.isHost && this.activeRoomId === roomId) &&
        now - r.updatedAt > 22000
      ) {
        this.openRoomsMap.delete(roomId);
      }
    }

    // Host-side peer inactivity watchdog: if a connected player locks their phone or drops offline (> 7.0s silent), replace them with AI immediately
    if (this.isHost && this.activeRoomId) {
      const timedOutPeers = this.roomPeers.filter((p) => {
        if (p.peerId === this.peerId) return false;
        const lastSeen = this.lastPeerActivityTime.get(p.peerId) ?? p.joinedAt;
        return now - lastSeen > 7000;
      });

      for (const stalePeer of timedOutPeers) {
        this.roomPeers = this.roomPeers.filter(
          (p) => p.peerId !== stalePeer.peerId
        );
        this.lastPeerActivityTime.delete(stalePeer.peerId);
        this.lastClientSeqByPeer.delete(stalePeer.peerId);
        const rtc = this.rtcPeers.get(stalePeer.peerId);
        if (rtc) {
          try {
            rtc.pc.close();
          } catch {
            // Ignore
          }
          this.rtcPeers.delete(stalePeer.peerId);
        }
        this.sendRoomMessage(
          {
            type: "PEER_LEAVE",
            senderId: stalePeer.peerId,
            slotIndex: stalePeer.slotIndex,
          },
          true
        );
        this.callbacks.onPeerLeave?.(stalePeer.peerId, stalePeer.slotIndex);
      }
    }

    const players = Array.from(this.onlinePlayersMap.values()).sort((a, b) =>
      a.peerId === this.peerId ? -1 : b.peerId === this.peerId ? 1 : a.playerName.localeCompare(b.playerName)
    );
    const rooms = Array.from(this.openRoomsMap.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );

    this.callbacks.onLobbyUpdated?.(players, rooms, this.backendStatus);
  }

  // ==========================================================================
  // ROOM SESSION MANAGEMENT (HOSTING, DEDICATED SERVER & HOT-JOINING)
  // ==========================================================================

  public hostNewRoom(params: {
    cupId: string;
    cupName?: string;
    trackIdx: number;
    trackDef: CustomTrackDefinition;
    isCustomTrack?: boolean;
    aiDifficulty: OnlineRoomSummary["aiDifficulty"];
    totalLaps: number;
    slotSummaries: OnlineRoomSummary["slotSummaries"];
    isDedicatedServer?: boolean;
    preserveExistingRoom?: boolean;
  }): string {
    const dedicated = Boolean(params.isDedicatedServer);
    const keepExisting =
      Boolean(params.preserveExistingRoom) &&
      Boolean(this.activeRoomId) &&
      this.isHost;

    if (!keepExisting) {
      this.leaveCurrentRoom(false);
    }

    const roomId =
      keepExisting && this.activeRoomId
        ? this.activeRoomId
        : `room_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    this.activeRoomId = roomId;
    this.isHost = true;
    this.isDedicatedServer = dedicated;
    this.localSlotIndex = dedicated ? -1 : 0;
    this.hostPeerId = this.peerId;
    this.hostName = this.playerName;

    if (keepExisting) {
      const remotePeers = this.roomPeers.filter(
        (p) => p.peerId !== this.peerId
      );
      if (!dedicated) {
        remotePeers.unshift({
          peerId: this.peerId,
          playerName: this.playerName,
          characterId: this.characterId,
          kartId: this.kartId,
          slotIndex: 0,
          joinedAt: Date.now() - 10000,
        });
      }
      this.roomPeers = remotePeers;
    } else {
      this.roomPeers = dedicated
        ? []
        : [
            {
              peerId: this.peerId,
              playerName: this.playerName,
              characterId: this.characterId,
              kartId: this.kartId,
              slotIndex: 0,
              joinedAt: Date.now(),
            },
          ];
    }

    const humanCount = params.slotSummaries.filter((s) => s.isHuman).length;
    const aiSlotCount = 4 - humanCount;

    this.currentRoomSummary = {
      roomId,
      hostPeerId: this.peerId,
      hostName: this.playerName,
      isDedicatedServer: dedicated,
      cupId: params.cupId,
      cupName: params.cupName,
      trackIdx: params.trackIdx,
      trackName: params.trackDef.name,
      isCustomTrack: Boolean(
        params.isCustomTrack ?? params.trackDef.isUserModified
      ),
      racePhase: "COUNTDOWN",
      currentLap: 1,
      totalLaps: params.totalLaps,
      humanCount,
      maxSlots: 4,
      aiSlotCount,
      aiDifficulty: params.aiDifficulty,
      slotSummaries: params.slotSummaries,
      updatedAt: Date.now(),
    };

    this.openRoomsMap.set(roomId, this.currentRoomSummary);
    if (!keepExisting) {
      this.connectRoomChannels(roomId);
    }
    this.broadcastLobbyPresence(true);
    this.pruneAndNotifyLobby();
    return roomId;
  }

  public joinExistingRoom(room: OnlineRoomSummary): void {
    this.leaveCurrentRoom(false);

    this.activeRoomId = room.roomId;
    this.isHost = false;
    this.isDedicatedServer = false;
    this.localSlotIndex = -1;
    this.hostPeerId = room.hostPeerId;
    this.hostName = room.hostName;
    this.lastHostPacketTime = Date.now();

    const joinAt = Date.now();
    const sendJoinRequest = () => {
      if (!this.activeRoomId || this.isHost) return;
      this.sendRoomMessage(
        {
          type: "JOIN_REQUEST",
          senderId: this.peerId,
          targetHostId: this.hostPeerId ?? room.hostPeerId,
          playerName: this.playerName,
          characterId: this.characterId,
          kartId: this.kartId,
          joinedAt: joinAt,
        },
        true
      );
    };

    this.connectRoomChannels(room.roomId, sendJoinRequest);

    // Send immediately and retry in case Supabase room channel was still subscribing
    sendJoinRequest();
    setTimeout(sendJoinRequest, 250);
    setTimeout(sendJoinRequest, 750);
    setTimeout(sendJoinRequest, 1500);

    // Initiate WebRTC connection toward the Host
    this.ensureRtcPeer(room.hostPeerId, true);

    // Start Host Migration Watchdog
    this.startHostMigrationMonitor();
    this.broadcastLobbyPresence(true);
  }

  public leaveCurrentRoom(notifyPeers = true): void {
    if (!this.activeRoomId) return;
    const leavingRoomId = this.activeRoomId;

    if (notifyPeers) {
      const remotePeerCount = this.roomPeers.filter(
        (p) => p.peerId !== this.peerId
      ).length;
      if (!this.isHost || remotePeerCount > 0) {
        this.sendRoomMessage(
          {
            type: "PEER_LEAVE",
            senderId: this.peerId,
            slotIndex: this.localSlotIndex,
          },
          true
        );
      }

      if (this.isHost && remotePeerCount === 0) {
        const closePacket = {
          kind: "ROOM_CLOSED",
          closedRoomId: leavingRoomId,
        };

        try {
          this.localLobbyBus?.postMessage(closePacket);
        } catch {
          // Ignore
        }
        if (
          this.supabaseLobbyChannel &&
          this.backendStatus === "SUPABASE_ONLINE"
        ) {
          try {
            this.supabaseLobbyChannel
              .send({
                type: "broadcast",
                event: "lobby_bus",
                payload: closePacket,
              })
              .catch(() => {});
          } catch {
            // Ignore
          }
        }
        this.openRoomsMap.delete(leavingRoomId);
      }
    }

    if (this.hostMonitorTimer) {
      clearInterval(this.hostMonitorTimer);
      this.hostMonitorTimer = null;
    }

    for (const bundle of this.rtcPeers.values()) {
      try {
        bundle.fastChannel?.close();
        bundle.reliableChannel?.close();
        bundle.pc.close();
      } catch {
        // Ignore close errors
      }
    }
    this.rtcPeers.clear();

    if (this.localRoomBus) {
      try {
        this.localRoomBus.close();
      } catch {
        // Ignore
      }
      this.localRoomBus = null;
    }

    if (this.supabase && this.supabaseRoomChannel) {
      try {
        this.supabase.removeChannel(this.supabaseRoomChannel).catch(() => {});
      } catch {
        // Ignore
      }
      this.supabaseRoomChannel = null;
    }

    this.activeRoomId = null;
    this.isHost = false;
    this.isDedicatedServer = false;
    this.localSlotIndex = 0;
    this.hostPeerId = null;
    this.currentRoomSummary = null;
    this.roomPeers = [];
    this.lastHostSeq = -1;
    this.lastClientSeqByPeer.clear();

    this.broadcastLobbyPresence(true);
    this.pruneAndNotifyLobby();
  }

  private connectRoomChannels(roomId: string, onSubscribed?: () => void): void {
    // 1. Local Cross-Tab Room Bus (Zero-latency local fallback)
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.localRoomBus = new BroadcastChannel(`gutsykarts_room_${roomId}`);
        this.localRoomBus.onmessage = (ev) => {
          if (this.disposed || !ev.data) return;
          this.handleIncomingRoomMessage(ev.data as RoomWireMessage);
        };
      }
    } catch {
      // Ignore
    }

    // 2. Supabase Room Channel (for WebRTC Signaling + Mobile Relay Fallback)
    if (this.supabase && this.backendStatus === "SUPABASE_ONLINE") {
      try {
        const roomChannel = this.supabase.channel(`gutsykarts:room:${roomId}`, {
          config: {
            broadcast: { self: false },
          },
        });

        roomChannel
          .on("broadcast", { event: "room_msg" }, ({ payload }) => {
            if (this.disposed || !payload) return;
            this.handleIncomingRoomMessage(payload as RoomWireMessage);
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && !this.disposed) {
              onSubscribed?.();
            }
          });

        this.supabaseRoomChannel = roomChannel;
      } catch {
        // Ignore channel creation error; local bus + existing channels remain safe
      }
    }
  }

  // ==========================================================================
  // WEBRTC P2P DATACHANNELS WITH AUTOMATIC RELAY FALLBACK
  // ==========================================================================

  private ensureRtcPeer(remotePeerId: string, initiator: boolean): PeerRtcBundle | null {
    if (
      typeof window === "undefined" ||
      typeof RTCPeerConnection === "undefined" ||
      remotePeerId === this.peerId
    ) {
      return null;
    }

    const existing = this.rtcPeers.get(remotePeerId);
    if (existing) return existing;

    try {
      const pc = new RTCPeerConnection({
        iceServers: this.getIceServers(),
      });

      const bundle: PeerRtcBundle = {
        peerId: remotePeerId,
        pc,
        fastChannel: null,
        reliableChannel: null,
        isConnected: false,
      };

      this.rtcPeers.set(remotePeerId, bundle);

      const attachChannelHandlers = (ch: RTCDataChannel, isReliable: boolean) => {
        ch.onopen = () => {
          bundle.isConnected = true;
        };
        ch.onclose = () => {
          bundle.isConnected =
            bundle.fastChannel?.readyState === "open" ||
            bundle.reliableChannel?.readyState === "open";
        };
        ch.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data) as RoomWireMessage;
            this.handleIncomingRoomMessage(parsed);
          } catch {
            // Ignore malformed JSON
          }
        };
        if (isReliable) {
          bundle.reliableChannel = ch;
        } else {
          bundle.fastChannel = ch;
        }
      };

      if (initiator) {
        const fast = pc.createDataChannel("fast", {
          ordered: false,
          maxRetransmits: 0,
        });
        const reliable = pc.createDataChannel("reliable", {
          ordered: true,
        });
        attachChannelHandlers(fast, false);
        attachChannelHandlers(reliable, true);

        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              this.sendSignalingMessage({
                type: "WEBRTC_SIGNAL",
                senderId: this.peerId,
                targetPeerId: remotePeerId,
                signalType: "offer",
                sdp: pc.localDescription,
              });
            }
          })
          .catch(() => {});
      } else {
        pc.ondatachannel = (ev) => {
          attachChannelHandlers(
            ev.channel,
            ev.channel.label === "reliable"
          );
        };
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          this.sendSignalingMessage({
            type: "WEBRTC_SIGNAL",
            senderId: this.peerId,
            targetPeerId: remotePeerId,
            signalType: "ice",
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      return bundle;
    } catch {
      return null;
    }
  }

  private handleWebRtcSignal(msg: Extract<RoomWireMessage, { type: "WEBRTC_SIGNAL" }>): void {
    if (msg.targetPeerId !== this.peerId) return;
    const bundle = this.ensureRtcPeer(msg.senderId, false);
    if (!bundle) return;

    const { pc } = bundle;
    if (msg.signalType === "offer" && msg.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          if (pc.localDescription) {
            this.sendSignalingMessage({
              type: "WEBRTC_SIGNAL",
              senderId: this.peerId,
              targetPeerId: msg.senderId,
              signalType: "answer",
              sdp: pc.localDescription,
            });
          }
        })
        .catch(() => {});
    } else if (msg.signalType === "answer" && msg.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(
        () => {}
      );
    } else if (msg.signalType === "ice" && msg.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
    }
  }

  private sendSignalingMessage(msg: RoomWireMessage): void {
    try {
      this.localRoomBus?.postMessage(msg);
    } catch {
      // Ignore
    }
    if (this.supabaseRoomChannel && this.backendStatus === "SUPABASE_ONLINE") {
      try {
        this.supabaseRoomChannel
          .send({
            type: "broadcast",
            event: "room_msg",
            payload: msg,
          })
          .catch(() => {});
      } catch {
        // Ignore
      }
    }
  }

  public hasRemoteRoomPeers(): boolean {
    if (!this.activeRoomId) return false;
    if (this.isHost) {
      return this.roomPeers.some((p) => p.peerId !== this.peerId);
    }
    return Boolean(this.hostPeerId && this.hostPeerId !== this.peerId);
  }

  public sendRoomMessage(msg: RoomWireMessage, reliable = false): void {
    if (!this.activeRoomId) return;

    // 1. Always post to Local Cross-Tab BroadcastChannel (zero network overhead)
    try {
      this.localRoomBus?.postMessage(msg);
    } catch {
      // Ignore
    }

    const remotePeerIds = this.isHost
      ? this.roomPeers
          .filter((p) => p.peerId !== this.peerId)
          .map((p) => p.peerId)
      : this.hostPeerId && this.hostPeerId !== this.peerId
      ? [this.hostPeerId]
      : [];

    const isMembershipControl =
      msg.type === "JOIN_REQUEST" ||
      msg.type === "WELCOME_SNAPSHOT" ||
      msg.type === "CLAIM_AI_SLOT" ||
      msg.type === "SLOT_TAKEOVER" ||
      msg.type === "STEP_OUT_SPECTATE" ||
      msg.type === "PEER_LEAVE" ||
      msg.type === "HOST_MIGRATED";

    // Never send room traffic over WebRTC or Supabase when no remote peers are in the room
    if (remotePeerIds.length === 0 && !isMembershipControl) {
      return;
    }
    if (this.isHost && remotePeerIds.length === 0 && msg.type === "PEER_LEAVE") {
      return;
    }

    const serialized = JSON.stringify(msg);
    let allPeersReachedViaWebRtc = remotePeerIds.length > 0;

    for (const remotePeerId of remotePeerIds) {
      const bundle = this.rtcPeers.get(remotePeerId);
      const ch = bundle
        ? reliable
          ? bundle.reliableChannel
          : bundle.fastChannel
        : null;
      if (ch && ch.readyState === "open") {
        try {
          ch.send(serialized);
        } catch {
          allPeersReachedViaWebRtc = false;
        }
      } else {
        allPeersReachedViaWebRtc = false;
      }
    }

    // Only use Supabase Realtime if WebRTC could not reach all remote peers, or for membership/handshaking control events
    if (
      (isMembershipControl || !allPeersReachedViaWebRtc) &&
      this.supabaseRoomChannel &&
      this.backendStatus === "SUPABASE_ONLINE"
    ) {
      if (
        msg.type === "HOST_WORLD_TICK" ||
        msg.type === "CLIENT_KART_TICK"
      ) {
        const now = Date.now();
        if (now - this.lastSupabaseRelayTickAt < 100) {
          return;
        }
        this.lastSupabaseRelayTickAt = now;
      }

      try {
        this.supabaseRoomChannel
          .send({
            type: "broadcast",
            event: "room_msg",
            payload: msg,
          })
          .catch(() => {});
      } catch {
        // Ignore
      }
    }
  }

  private handleIncomingRoomMessage(msg: RoomWireMessage): void {
    if (!msg || !msg.type || msg.senderId === this.peerId) return;

    this.lastPeerActivityTime.set(msg.senderId, Date.now());

    if (msg.type === "WEBRTC_SIGNAL") {
      this.handleWebRtcSignal(msg);
      return;
    }

    if (msg.type === "JOIN_REQUEST") {
      if (this.isHost && msg.targetHostId === this.peerId) {
        this.ensureRtcPeer(msg.senderId, false);
        this.callbacks.onJoinRequest?.({
          peerId: msg.senderId,
          playerName: msg.playerName,
          characterId: msg.characterId,
          kartId: msg.kartId,
          joinedAt: msg.joinedAt,
        });
      }
      return;
    }

    if (msg.type === "WELCOME_SNAPSHOT") {
      if (msg.targetPeerId === this.peerId) {
        this.lastHostPacketTime = Date.now();
        this.hostPeerId = msg.payload.hostPeerId;
        this.localSlotIndex = msg.payload.assignedSlotIndex;
        this.roomPeers = msg.payload.peers;
        this.callbacks.onWelcomeSnapshot?.(msg.payload);
      }
      return;
    }

    if (msg.type === "CLAIM_AI_SLOT") {
      if (this.isHost && msg.targetHostId === this.peerId) {
        this.ensureRtcPeer(msg.senderId, false);
        this.callbacks.onClaimAiSlot?.({
          peerId: msg.senderId,
          playerName: msg.playerName,
          characterId: msg.characterId,
          kartId: msg.kartId,
          preferredSlotIndex: msg.preferredSlotIndex,
        });
      }
      return;
    }

    if (msg.type === "STEP_OUT_SPECTATE") {
      if (this.isHost) {
        this.callbacks.onClientStepOut?.(msg.senderId, msg.slotIndex);
      }
      return;
    }

    if (msg.type === "SLOT_TAKEOVER") {
      this.lastHostPacketTime = Date.now();
      this.roomPeers = msg.payload.peers;
      if (
        msg.payload.ownerPeerId === this.peerId &&
        msg.payload.controlMode === "HUMAN"
      ) {
        this.localSlotIndex = msg.payload.slotIndex;
      } else if (
        msg.payload.slotIndex === this.localSlotIndex &&
        msg.payload.controlMode === "AI"
      ) {
        this.localSlotIndex = -1;
      }
      // Establish WebRTC mesh with newly joined peer if needed
      for (const p of this.roomPeers) {
        if (p.peerId !== this.peerId && !this.rtcPeers.has(p.peerId)) {
          this.ensureRtcPeer(p.peerId, this.peerId < p.peerId);
        }
      }
      this.callbacks.onSlotTakeover?.(msg.payload);
      return;
    }

    if (msg.type === "HOST_WORLD_TICK") {
      if (msg.seq <= this.lastHostSeq && msg.senderId === this.hostPeerId) {
        return;
      }
      this.lastHostSeq = msg.seq;
      this.lastHostPacketTime = Date.now();
      this.hostPeerId = msg.senderId;
      this.roomPeers = msg.peers;
      this.callbacks.onHostWorldTick?.(msg);
      return;
    }

    if (msg.type === "CLIENT_KART_TICK") {
      const prevSeq = this.lastClientSeqByPeer.get(msg.senderId) ?? -1;
      if (msg.seq <= prevSeq) return;
      this.lastClientSeqByPeer.set(msg.senderId, msg.seq);
      this.callbacks.onClientKartTick?.(msg.slot, msg.senderId);
      return;
    }

    if (msg.type === "CLIENT_READY") {
      this.callbacks.onClientReady?.(msg.senderId, msg.slotIndex);
      return;
    }

    if (msg.type === "COLLISION_IMPULSE") {
      if (this.processedEventIds.has(msg.eventId)) return;
      this.processedEventIds.add(msg.eventId);
      this.callbacks.onCollisionImpulse?.(msg.payload);
      return;
    }

    if (msg.type === "ITEM_ACTIVATE") {
      if (this.processedEventIds.has(msg.eventId)) return;
      this.processedEventIds.add(msg.eventId);
      this.callbacks.onItemActivate?.(msg.payload);
      return;
    }

    if (msg.type === "ITEM_BOX_PICKUP") {
      if (this.processedEventIds.has(msg.eventId)) return;
      this.processedEventIds.add(msg.eventId);
      this.callbacks.onItemBoxPickup?.(msg.payload);
      return;
    }

    if (msg.type === "PEER_LEAVE") {
      this.roomPeers = this.roomPeers.filter((p) => p.peerId !== msg.senderId);
      const rtc = this.rtcPeers.get(msg.senderId);
      if (rtc) {
        try {
          rtc.pc.close();
        } catch {
          // Ignore
        }
        this.rtcPeers.delete(msg.senderId);
      }

      if (msg.senderId === this.hostPeerId && !this.isHost) {
        this.triggerHostMigration(msg.senderId, msg.slotIndex);
      } else {
        this.callbacks.onPeerLeave?.(msg.senderId, msg.slotIndex);
      }
      return;
    }

    if (msg.type === "HOST_MIGRATED") {
      this.lastHostPacketTime = Date.now();
      this.hostPeerId = msg.newHostPeerId;
      this.hostName = msg.newHostName;
      this.isHost = msg.newHostPeerId === this.peerId;
      this.roomPeers = msg.peers;
      this.callbacks.onHostMigrated?.({
        newHostPeerId: msg.newHostPeerId,
        newHostName: msg.newHostName,
        oldHostPeerId: msg.oldHostPeerId,
        oldHostSlotIndex: msg.oldHostSlotIndex,
        peers: msg.peers,
      });
    }
  }

  // ==========================================================================
  // AUTOMATIC HOST MIGRATION (WHEN MOBILE HOST BACKGROUNDS OR DISCONNECTS)
  // ==========================================================================

  private startHostMigrationMonitor(): void {
    if (this.hostMonitorTimer) {
      clearInterval(this.hostMonitorTimer);
    }
    this.hostMonitorTimer = setInterval(() => {
      if (this.disposed || !this.activeRoomId || this.isHost) return;
      const elapsedSinceHost = Date.now() - this.lastHostPacketTime;
      if (elapsedSinceHost > 5500 && this.hostPeerId) {
        const oldHostEntry = this.roomPeers.find(
          (p) => p.peerId === this.hostPeerId
        );
        this.triggerHostMigration(
          this.hostPeerId,
          oldHostEntry?.slotIndex ?? 0
        );
      }
    }, 500);
  }

  public triggerHostMigration(
    oldHostPeerId: string,
    oldHostSlotIndex: number
  ): void {
    if (!this.activeRoomId) return;

    const remainingPeers = this.roomPeers
      .filter((p) => p.peerId !== oldHostPeerId)
      .sort((a, b) => a.joinedAt - b.joinedAt || a.peerId.localeCompare(b.peerId));

    if (remainingPeers.length === 0) {
      remainingPeers.push({
        peerId: this.peerId,
        playerName: this.playerName,
        characterId: this.characterId,
        kartId: this.kartId,
        slotIndex: this.localSlotIndex,
        joinedAt: Date.now(),
      });
    }

    this.roomPeers = remainingPeers;
    const nextHost = remainingPeers[0];
    this.hostPeerId = nextHost.peerId;
    this.hostName = nextHost.playerName;
    this.isHost = nextHost.peerId === this.peerId;
    this.lastHostPacketTime = Date.now();

    if (this.isHost) {
      if (this.hostMonitorTimer) {
        clearInterval(this.hostMonitorTimer);
        this.hostMonitorTimer = null;
      }

      this.sendRoomMessage(
        {
          type: "HOST_MIGRATED",
          senderId: this.peerId,
          newHostPeerId: this.peerId,
          newHostName: this.playerName,
          oldHostPeerId,
          oldHostSlotIndex,
          peers: this.roomPeers,
        },
        true
      );
      this.broadcastLobbyPresence(true);
    }

    this.callbacks.onHostMigrated?.({
      newHostPeerId: nextHost.peerId,
      newHostName: nextHost.playerName,
      oldHostPeerId,
      oldHostSlotIndex,
      peers: this.roomPeers,
    });
  }

  // ==========================================================================
  // HIGH-FREQUENCY TICK & RELIABLE EVENT HELPERS
  // ==========================================================================

  public broadcastHostWorldTick(params: {
    racePhase: "COUNTDOWN" | "RACING" | "FINISHED";
    countdownRemaining: number;
    elapsedRaceMs: number;
    slots: KartNetState[];
  }): void {
    if (!this.activeRoomId || !this.isHost || !this.hasRemoteRoomPeers()) return;
    this.sendRoomMessage(
      {
        type: "HOST_WORLD_TICK",
        senderId: this.peerId,
        seq: this.outgoingSeq++,
        racePhase: params.racePhase,
        countdownRemaining: params.countdownRemaining,
        elapsedRaceMs: params.elapsedRaceMs,
        slots: params.slots,
        peers: this.roomPeers,
      },
      false
    );
  }

  public broadcastClientKartTick(slot: KartNetState): void {
    if (!this.activeRoomId || this.isHost || !this.hasRemoteRoomPeers()) return;
    this.sendRoomMessage(
      {
        type: "CLIENT_KART_TICK",
        senderId: this.peerId,
        seq: this.outgoingSeq++,
        slot,
      },
      false
    );
  }

  public broadcastClientReady(slotIndex: number): void {
    if (!this.activeRoomId || !this.hasRemoteRoomPeers()) return;
    this.sendRoomMessage(
      {
        type: "CLIENT_READY",
        senderId: this.peerId,
        slotIndex,
      },
      true
    );
  }

  public requestClaimAiSlot(preferredSlotIndex?: number): void {
    if (!this.activeRoomId || this.isHost || !this.hostPeerId) return;
    this.sendRoomMessage(
      {
        type: "CLAIM_AI_SLOT",
        senderId: this.peerId,
        targetHostId: this.hostPeerId,
        playerName: this.playerName,
        characterId: this.characterId,
        kartId: this.kartId,
        preferredSlotIndex,
      },
      true
    );
  }

  public requestStepOutToSpectate(slotIndex: number): void {
    if (!this.activeRoomId || this.isHost) return;
    this.localSlotIndex = -1;
    this.sendRoomMessage(
      {
        type: "STEP_OUT_SPECTATE",
        senderId: this.peerId,
        slotIndex,
      },
      true
    );
  }

  public broadcastCollisionImpulse(payload: NetCollisionImpulsePayload): void {
    if (!this.activeRoomId || !this.hasRemoteRoomPeers()) return;
    const eventId = `col_${this.peerId}_${this.outgoingSeq++}`;
    this.processedEventIds.add(eventId);
    this.sendRoomMessage(
      {
        type: "COLLISION_IMPULSE",
        senderId: this.peerId,
        eventId,
        payload,
      },
      true
    );
  }

  public broadcastItemActivate(payload: NetItemActivatePayload): void {
    if (!this.activeRoomId || !this.hasRemoteRoomPeers()) return;
    const eventId = `item_${this.peerId}_${this.outgoingSeq++}`;
    this.processedEventIds.add(eventId);
    this.sendRoomMessage(
      {
        type: "ITEM_ACTIVATE",
        senderId: this.peerId,
        eventId,
        payload,
      },
      true
    );
  }

  public broadcastItemBoxPickup(payload: NetItemBoxPickupPayload): void {
    if (!this.activeRoomId || !this.hasRemoteRoomPeers()) return;
    const eventId = `box_${this.peerId}_${this.outgoingSeq++}`;
    this.processedEventIds.add(eventId);
    this.sendRoomMessage(
      {
        type: "ITEM_BOX_PICKUP",
        senderId: this.peerId,
        eventId,
        payload,
      },
      true
    );
  }

  public getTransportDescription(): string {
    let webrtcOpenCount = 0;
    for (const b of this.rtcPeers.values()) {
      if (b.isConnected) webrtcOpenCount++;
    }
    if (this.backendStatus === "SUPABASE_ONLINE") {
      return webrtcOpenCount > 0
        ? `Supabase + WebRTC P2P (${webrtcOpenCount} Direct)`
        : "Supabase Realtime Relay";
    }
    return webrtcOpenCount > 0
      ? `Local P2P (${webrtcOpenCount} Direct)`
      : "Local Cross-Tab Mode";
  }

  public dispose(): void {
    this.disposed = true;
    this.leaveCurrentRoom(true);
    if (this.lobbyHeartbeatTimer) {
      clearInterval(this.lobbyHeartbeatTimer);
      this.lobbyHeartbeatTimer = null;
    }
    if (this.localLobbyBus) {
      try {
        this.localLobbyBus.close();
      } catch {
        // Ignore
      }
      this.localLobbyBus = null;
    }
    if (this.supabase && this.supabaseLobbyChannel) {
      try {
        this.supabase.removeChannel(this.supabaseLobbyChannel).catch(() => {});
      } catch {
        // Ignore
      }
      this.supabaseLobbyChannel = null;
    }
  }
}
