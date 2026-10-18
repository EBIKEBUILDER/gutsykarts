"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Color4,
  Engine,
  FreeCamera,
  Scene,
  Vector3,
} from "@babylonjs/core";
import {
  Activity,
  Award,
  Brain,
  Camera,
  ChevronRight,
  Compass,
  Crown,
  Download,
  Eye,
  FastForward,
  Flame,
  Gamepad2,
  Gauge,
  LogOut,
  Map,
  Medal,
  Monitor,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Weight,
  Wifi,
  Zap,
} from "lucide-react";
import {
  AiDifficulty,
  AsymmetricCollisionReport,
  CameraMode,
  ControlInputState,
  CupStandingEntry,
  CustomTrackDefinition,
  GrandPrixCupDefinition,
  HudTelemetry,
  NetworkBackendStatus,
  OnlinePlayerPresence,
  OnlineRoomSummary,
  PowerUpType,
  RacerStanding,
  RacerTrackTimeRecord,
  TrackTimingRecord,
  WelcomeSnapshotPayload,
} from "@/src/types/game";
import {
  BUILD_INFO_STAMP,
  CHARACTER_ROSTER,
  KART_CHASSIS_CATALOG,
  POWER_UP_CATALOG,
  resolveRacerStats,
} from "@/src/game/data/roster";
import {
  buildProceduralTrack,
  BuiltTrack,
  createDefaultCupsCatalog,
  createDefaultTrackDefinition,
  createNewCustomCup,
  createNewTrackForCup,
  getOfficialDefaultTrack,
  isBuiltinCupId,
  loadSavedCupsCatalog,
  saveCupsCatalog,
  saveTrackDefinition,
} from "@/src/game/world/TrackBuilder";
import { KartController } from "@/src/game/physics/KartController";
import {
  PHYSICS_CONSTANTS,
  resolveAsymmetricKartCollision,
} from "@/src/game/physics/KartPhysics";
import { globalAiBrain } from "@/src/game/ai/AiBrainTrainer";
import { ItemManager } from "@/src/game/items/ItemManager";
import {
  TouchControlCallbacks,
  VirtualJoystick,
} from "@/src/components/VirtualJoystick";
import { TrackEditor } from "@/src/components/TrackEditor";
import { SoundtrackManager } from "@/src/game/audio/SoundtrackManager";
import { MultiplayerManager } from "@/src/game/network/MultiplayerManager";

const TOTAL_LAPS = 3;
const TRACK_RECORDS_STORAGE_KEY = "gutsy_karts_track_records_v1";

function loadSavedTrackRecords(): Record<string, TrackTimingRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRACK_RECORDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TrackTimingRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveTrackRecords(records: Record<string, TrackTimingRecord>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TRACK_RECORDS_STORAGE_KEY,
      JSON.stringify(records)
    );
  } catch {
    // Ignore storage quota errors
  }
}

declare global {
  interface Window {
    __GUTSY_KARTS_DEBUG__?: {
      getState: () => {
        telemetry: HudTelemetry;
        player: {
          name: string;
          slotIndex: number;
          controlMode: string;
          mass: number;
          effectiveMass: number;
          speed: number;
          lateralSpeed: number;
          maxSpeed: number;
          surface: string;
          distToCenter: number;
          grounded: boolean;
          verticalVelocity: number;
          driftState: string;
          driftDirection: number;
          driftChargeSeconds: number;
          driftChargeSubState: number;
          miniTurboTier: number;
          prolongedRocketBoostActive: boolean;
          heldItem: PowerUpType | null;
          novaOverdriveTimer: number;
          nitroBoostTimer: number;
        } | null;
        lastCollision: AsymmetricCollisionReport | null;
      };
      teleportPlayerToOffRoad: () => void;
      teleportPlayerToPavement: () => void;
      simulateHopDriftCharge: (chargeSec: number, dir?: -1 | 1) => void;
      simulateManualDriftPumps?: (cycles: 1 | 2, dir?: -1 | 1) => void;
      releaseDriftNow: () => void;
      simulateJuggernautCollision: () => AsymmetricCollisionReport | null;
      grantPlayerPowerUp: (item: PowerUpType) => void;
      triggerPlayerPowerUp: () => void;
      simulateMidRaceHotJoinTakeover?: (
        joinerName: string,
        characterId: string,
        kartId: string
      ) => {
        replacedSlotIndex: number;
        inheritedLap: number;
        inheritedProgress: number;
        newCharacterId: string;
        newKartId: string;
        newMass: number;
      } | null;
    };
  }
}

export const RaceGame: React.FC = () => {
  const [screen, setScreen] = useState<"SELECT" | "EDITOR" | "RACE">("SELECT");
  const [cupsCatalog, setCupsCatalog] = useState<GrandPrixCupDefinition[]>(() =>
    createDefaultCupsCatalog()
  );
  const [selectedCupId, setSelectedCupId] = useState<string>("cul_de_sac_cup");
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number>(0);
  const [isCupSeriesActive, setIsCupSeriesActive] = useState<boolean>(true);
  const [cupStandings, setCupStandings] = useState<CupStandingEntry[]>([]);
  const cupPointsByCharRef = useRef<Record<string, number>>({});
  const [raceSessionKey, setRaceSessionKey] = useState<number>(0);

  // Online Multiplayer, Dedicated Server & Lobby Presence State
  const mpRef = useRef<MultiplayerManager | null>(null);
  const pendingWelcomeSnapshotRef = useRef<WelcomeSnapshotPayload | null>(null);
  const joinedTrackOverrideRef = useRef<CustomTrackDefinition | null>(null);
  const joinedCupOverrideRef = useRef<GrandPrixCupDefinition | null>(null);
  const [joinedCupOverride, setJoinedCupOverride] =
    useState<GrandPrixCupDefinition | null>(null);
  const [savedHostMapNotice, setSavedHostMapNotice] = useState<string | null>(
    null
  );
  const shouldHostOnlineRef = useRef<boolean>(false);
  const shouldHostDedicatedRef = useRef<boolean>(false);
  const preserveOnlineRoomRef = useRef<boolean>(false);

  // Spectator Camera & Dedicated Auto-Loop Refs
  const spectateSlotIndexRef = useRef<number>(0);
  const spectateAutoDirectorRef = useRef<boolean>(true);
  const autoAdvanceRacesRef = useRef<boolean>(true);
  const stepOutToSpectateActionRef = useRef<(() => void) | null>(null);
  const jumpInToDriveActionRef = useRef<((preferredSlot?: number) => void) | null>(null);

  const [playerCallsign, setPlayerCallsign] = useState<string>("GutsyRacer");
  const playerCallsignRef = useRef<string>(playerCallsign);
  playerCallsignRef.current = playerCallsign;
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerPresence[]>([]);
  const [openRooms, setOpenRooms] = useState<OnlineRoomSummary[]>([]);
  const [backendStatus, setBackendStatus] =
    useState<NetworkBackendStatus>("LOCAL_FALLBACK");
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  const activeCup = useMemo(
    () =>
      joinedCupOverride ??
      cupsCatalog.find((c) => c.id === selectedCupId) ??
      cupsCatalog[0],
    [joinedCupOverride, cupsCatalog, selectedCupId]
  );

  const trackDef = useMemo(
    () =>
      activeCup?.tracks[selectedTrackIdx] ??
      activeCup?.tracks[0] ??
      createDefaultTrackDefinition(),
    [activeCup, selectedTrackIdx]
  );

  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("MEDIUM");
  const aiDifficultyRef = useRef<AiDifficulty>("MEDIUM");
  aiDifficultyRef.current = aiDifficulty;

  const [showAiLab, setShowAiLab] = useState<boolean>(false);
  const [simSpeedMult, setSimSpeedMult] = useState<1 | 4 | 8 | 16>(1);
  const simSpeedMultRef = useRef<1 | 4 | 8 | 16>(1);
  simSpeedMultRef.current = simSpeedMult;

  const [autoRepeatTraining, setAutoRepeatTraining] = useState<boolean>(false);
  const autoRepeatTrainingRef = useRef<boolean>(false);
  autoRepeatTrainingRef.current = autoRepeatTraining;

  const allAiSimModeRef = useRef<boolean>(false);
  const [presetUpdateTick, setPresetUpdateTick] = useState<number>(0);
  const [copiedAiReport, setCopiedAiReport] = useState<boolean>(false);
  const [showBalanceGuide, setShowBalanceGuide] = useState<boolean>(false);
  const [showAiArchitectureGuide, setShowAiArchitectureGuide] =
    useState<boolean>(false);

  const [trackRecords, setTrackRecords] = useState<
    Record<string, TrackTimingRecord>
  >({});
  const trackRecordsRef = useRef<Record<string, TrackTimingRecord>>(trackRecords);
  trackRecordsRef.current = trackRecords;

  const [musicMuted, setMusicMuted] = useState<boolean>(false);
  const soundtrackRef = useRef<SoundtrackManager | null>(null);

  useEffect(() => {
    setCupsCatalog(loadSavedCupsCatalog());
    const loadedRecords = loadSavedTrackRecords();
    setTrackRecords(loadedRecords);
    trackRecordsRef.current = loadedRecords;
    globalAiBrain.hydrateFromStorage();
    setPresetUpdateTick((t) => t + 1);
    try {
      const savedDiff = window.localStorage.getItem("gutsy_karts_ai_difficulty");
      if (
        savedDiff === "EASY" ||
        savedDiff === "MEDIUM" ||
        savedDiff === "HARD" ||
        savedDiff === "SELF_LEARNING"
      ) {
        setAiDifficulty(savedDiff);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleSelectAiDifficulty = useCallback((next: AiDifficulty) => {
    setAiDifficulty(next);
    aiDifficultyRef.current = next;
    try {
      window.localStorage.setItem("gutsy_karts_ai_difficulty", next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const cycleAiDifficulty = useCallback(() => {
    const order: AiDifficulty[] = ["EASY", "MEDIUM", "HARD", "SELF_LEARNING"];
    const next = order[(order.indexOf(aiDifficultyRef.current) + 1) % order.length];
    handleSelectAiDifficulty(next);
  }, [handleSelectAiDifficulty]);

  // Save edited track into the active Cup & persist catalog to localStorage
  const handleUpdateTrackDef = useCallback(
    (next: CustomTrackDefinition) => {
      const stamped: CustomTrackDefinition = {
        ...next,
        isUserModified: true,
        updatedAt: Date.now(),
      };
      setCupsCatalog((prev) => {
        const updated = prev.map((cup) => {
          if (cup.id !== selectedCupId) return cup;
          const nextTracks = cup.tracks.map((t, idx) =>
            idx === selectedTrackIdx ? stamped : t
          );
          return { ...cup, tracks: nextTracks };
        });
        saveCupsCatalog(updated);
        return updated;
      });
      saveTrackDefinition(stamped);
    },
    [selectedCupId, selectedTrackIdx]
  );

  const handleSelectCupAndTrack = useCallback(
    (cupId: string, trackIdx: number) => {
      setSelectedCupId(cupId);
      setSelectedTrackIdx(trackIdx);
    },
    []
  );

  const handleAddTrackToCup = useCallback((cupId: string) => {
    setCupsCatalog((prev) => {
      let addedIndex = 0;
      const updated = prev.map((cup) => {
        if (cup.id !== cupId) return cup;
        addedIndex = cup.tracks.length;
        const newTrack = createNewTrackForCup(cupId, cup.tracks.length + 1);
        return {
          ...cup,
          tracks: [...cup.tracks, newTrack],
        };
      });
      saveCupsCatalog(updated);
      setSelectedCupId(cupId);
      setSelectedTrackIdx(addedIndex);
      return updated;
    });
  }, []);

  const handleAddCustomCup = useCallback(() => {
    setCupsCatalog((prev) => {
      const customCount =
        prev.filter((c) => !isBuiltinCupId(c.id)).length + 1;
      const newCup = createNewCustomCup(
        customCount,
        playerCallsignRef.current.trim() || undefined
      );
      const updated = [...prev, newCup];
      saveCupsCatalog(updated);
      setSelectedCupId(newCup.id);
      setSelectedTrackIdx(0);
      return updated;
    });
  }, []);

  const handleUpdateCupMeta = useCallback(
    (
      cupId: string,
      patch: { name?: string; subtitle?: string; badgeColor?: string }
    ) => {
      setCupsCatalog((prev) => {
        const updated = prev.map((cup) =>
          cup.id === cupId
            ? { ...cup, ...patch, updatedAt: Date.now() }
            : cup
        );
        saveCupsCatalog(updated);
        return updated;
      });
    },
    []
  );

  const handleDeleteCustomCup = useCallback((cupId: string) => {
    if (isBuiltinCupId(cupId)) return;
    setCupsCatalog((prev) => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter((c) => c.id !== cupId);
      saveCupsCatalog(updated);
      const fallbackCup = updated[0];
      if (fallbackCup) {
        setSelectedCupId(fallbackCup.id);
        setSelectedTrackIdx(0);
      }
      return updated;
    });
  }, []);

  const handleDeleteTrackFromCup = useCallback(
    (cupId: string, trackIdx: number) => {
      setCupsCatalog((prev) => {
        const updated = prev.map((cup) => {
          if (cup.id !== cupId) return cup;
          if (cup.tracks.length <= 1) return cup;
          if (isBuiltinCupId(cupId) && trackIdx < 3) return cup;
          return {
            ...cup,
            tracks: cup.tracks.filter((_, idx) => idx !== trackIdx),
          };
        });
        saveCupsCatalog(updated);
        setSelectedTrackIdx((prevIdx) => Math.max(0, prevIdx - 1));
        return updated;
      });
    },
    []
  );

  const handleResetTrackToOfficial = useCallback(
    (cupId: string, trackIdx: number) => {
      const official = getOfficialDefaultTrack(cupId, trackIdx);
      if (!official) return;
      setCupsCatalog((prev) => {
        const updated = prev.map((cup) => {
          if (cup.id !== cupId) return cup;
          return {
            ...cup,
            tracks: cup.tracks.map((t, idx) =>
              idx === trackIdx ? official : t
            ),
          };
        });
        saveCupsCatalog(updated);
        return updated;
      });
      saveTrackDefinition(official);
    },
    []
  );

  const handleImportCupOrCatalog = useCallback(
    (
      result:
        | { kind: "CUP"; cup: GrandPrixCupDefinition }
        | { kind: "CATALOG"; cups: GrandPrixCupDefinition[] }
    ) => {
      if (result.kind === "CATALOG") {
        setCupsCatalog(result.cups);
        saveCupsCatalog(result.cups);
        if (result.cups[0]) {
          setSelectedCupId(result.cups[0].id);
          setSelectedTrackIdx(0);
        }
        return;
      }

      const importedCup = result.cup;
      setCupsCatalog((prev) => {
        const existsIdx = prev.findIndex((c) => c.id === importedCup.id);
        const updated =
          existsIdx >= 0
            ? prev.map((c, i) => (i === existsIdx ? importedCup : c))
            : [...prev, importedCup];
        saveCupsCatalog(updated);
        return updated;
      });
      setSelectedCupId(importedCup.id);
      setSelectedTrackIdx(0);
    },
    []
  );

  const handleCommitCatalogToRepoSuccess = useCallback(
    (committedCups: GrandPrixCupDefinition[]) => {
      setCupsCatalog(committedCups);
      saveCupsCatalog(committedCups);
    },
    []
  );

  const handleSaveHostTrackToStudio = useCallback(() => {
    const hostTrack = joinedTrackOverrideRef.current ?? trackDef;
    const hostCup = joinedCupOverrideRef.current;

    setCupsCatalog((prev) => {
      if (hostCup && !isBuiltinCupId(hostCup.id)) {
        const existsIdx = prev.findIndex((c) => c.id === hostCup.id);
        const savedCup: GrandPrixCupDefinition = {
          ...hostCup,
          isCustomCup: true,
          updatedAt: Date.now(),
        };
        const updated =
          existsIdx >= 0
            ? prev.map((c, i) => (i === existsIdx ? savedCup : c))
            : [...prev, savedCup];
        saveCupsCatalog(updated);
        setSavedHostMapNotice(`Saved Cup "${hostCup.name}" to your Studio!`);
        setTimeout(() => setSavedHostMapNotice(null), 3200);
        return updated;
      }

      const communityCupId = "saved_online_circuits_cup";
      const clonedTrack: CustomTrackDefinition = {
        ...hostTrack,
        id: `${hostTrack.id || "online_track"}_${Date.now()}`,
        cupId: communityCupId,
        isUserModified: true,
        updatedAt: Date.now(),
      };
      const existingCup = prev.find((c) => c.id === communityCupId);
      let updated: GrandPrixCupDefinition[];
      if (existingCup) {
        const alreadyHasSameName = existingCup.tracks.some(
          (t) => t.name === clonedTrack.name
        );
        const nextTracks = alreadyHasSameName
          ? existingCup.tracks.map((t) =>
              t.name === clonedTrack.name ? clonedTrack : t
            )
          : [...existingCup.tracks, clonedTrack];
        updated = prev.map((c) =>
          c.id === communityCupId ? { ...c, tracks: nextTracks } : c
        );
      } else {
        const newCommunityCup: GrandPrixCupDefinition = {
          id: communityCupId,
          name: "Saved Online Cup",
          subtitle: "Custom Circuits Saved from Multiplayer Hosts",
          badgeColor: "#10b981",
          tracks: [clonedTrack],
          isCustomCup: true,
          updatedAt: Date.now(),
        };
        updated = [...prev, newCommunityCup];
      }
      saveCupsCatalog(updated);
      setSavedHostMapNotice(`Saved "${hostTrack.name}" to Saved Online Cup!`);
      setTimeout(() => setSavedHostMapNotice(null), 3200);
      return updated;
    });
  }, [trackDef]);

  const getSavedAiSimSpeed = useCallback((): 1 | 4 | 8 | 16 => {
    try {
      const raw = window.localStorage.getItem("gutsy_karts_ai_sim_speed");
      if (raw === "16") return 16;
      if (raw === "8") return 8;
      if (raw === "4") return 4;
      return 1;
    } catch {
      return 1;
    }
  }, []);

  const startGrandPrixCupSeries = useCallback(
    (cupId: string, startTrackIndex = 0) => {
      allAiSimModeRef.current = false;
      setSimSpeedMult(1);
      simSpeedMultRef.current = 1;
      globalAiBrain.setItemsEnabled(true);
      if (mpRef.current?.activeRoomId && mpRef.current.isHost) {
        shouldHostOnlineRef.current = true;
        shouldHostDedicatedRef.current = mpRef.current.isDedicatedServer;
        preserveOnlineRoomRef.current = true;
      } else {
        mpRef.current?.leaveCurrentRoom(true);
        shouldHostOnlineRef.current = false;
        shouldHostDedicatedRef.current = false;
        preserveOnlineRoomRef.current = false;
      }
      pendingWelcomeSnapshotRef.current = null;
      joinedTrackOverrideRef.current = null;
      joinedCupOverrideRef.current = null;
      setJoinedCupOverride(null);
      cupPointsByCharRef.current = {};
      setCupStandings([]);
      setSelectedCupId(cupId);
      setSelectedTrackIdx(startTrackIndex);
      setIsCupSeriesActive(true);
      setRaceSessionKey((k) => k + 1);
      setScreen("RACE");
    },
    []
  );

  const startAiSelfTrainingSim = useCallback(
    (cupId = selectedCupId, startTrackIndex = selectedTrackIdx) => {
      mpRef.current?.leaveCurrentRoom(true);
      shouldHostOnlineRef.current = false;
      shouldHostDedicatedRef.current = false;
      preserveOnlineRoomRef.current = false;
      allAiSimModeRef.current = true;
      spectateAutoDirectorRef.current = true;
      autoRepeatTrainingRef.current = true;
      setAutoRepeatTraining(true);
      setShowAiLab(true);
      const preferredSpeed = getSavedAiSimSpeed();
      setSimSpeedMult(preferredSpeed);
      simSpeedMultRef.current = preferredSpeed;
      globalAiBrain.setItemsEnabled(true);
      globalAiBrain.setTrainingTrackMode("ROTATE_CUP");
      handleSelectAiDifficulty("SELF_LEARNING");
      pendingWelcomeSnapshotRef.current = null;
      joinedTrackOverrideRef.current = null;
      joinedCupOverrideRef.current = null;
      setJoinedCupOverride(null);
      cupPointsByCharRef.current = {};
      setCupStandings([]);
      setSelectedCupId(cupId);
      setSelectedTrackIdx(startTrackIndex);
      setIsCupSeriesActive(false);
      setRaceSessionKey((k) => k + 1);
      setScreen("RACE");
    },
    [
      selectedCupId,
      selectedTrackIdx,
      handleSelectAiDifficulty,
      getSavedAiSimSpeed,
    ]
  );

  const startHostedOnlineRace = useCallback(
    (cupId = selectedCupId, startTrackIndex = selectedTrackIdx) => {
      allAiSimModeRef.current = false;
      setSimSpeedMult(1);
      simSpeedMultRef.current = 1;
      shouldHostOnlineRef.current = true;
      shouldHostDedicatedRef.current = false;
      preserveOnlineRoomRef.current = false;
      pendingWelcomeSnapshotRef.current = null;
      joinedTrackOverrideRef.current = null;
      joinedCupOverrideRef.current = null;
      setJoinedCupOverride(null);
      cupPointsByCharRef.current = {};
      setCupStandings([]);
      setSelectedCupId(cupId);
      setSelectedTrackIdx(startTrackIndex);
      setIsCupSeriesActive(true);
      setRaceSessionKey((k) => k + 1);
      setScreen("RACE");
    },
    [selectedCupId, selectedTrackIdx]
  );

  const startDedicatedServerRoom = useCallback(
    (cupId = selectedCupId, startTrackIndex = selectedTrackIdx) => {
      allAiSimModeRef.current = true;
      setSimSpeedMult(1);
      simSpeedMultRef.current = 1;
      shouldHostOnlineRef.current = true;
      shouldHostDedicatedRef.current = true;
      preserveOnlineRoomRef.current = false;
      spectateAutoDirectorRef.current = true;
      autoAdvanceRacesRef.current = true;
      pendingWelcomeSnapshotRef.current = null;
      joinedTrackOverrideRef.current = null;
      joinedCupOverrideRef.current = null;
      setJoinedCupOverride(null);
      cupPointsByCharRef.current = {};
      setCupStandings([]);
      setSelectedCupId(cupId);
      setSelectedTrackIdx(startTrackIndex);
      setIsCupSeriesActive(true);
      setRaceSessionKey((k) => k + 1);
      setScreen("RACE");
    },
    [selectedCupId, selectedTrackIdx]
  );

  const advanceToNextTrackInCup = useCallback(() => {
    joinedTrackOverrideRef.current = null;
    pendingWelcomeSnapshotRef.current = null;
    if (mpRef.current?.activeRoomId && mpRef.current.isHost) {
      shouldHostOnlineRef.current = true;
      shouldHostDedicatedRef.current = mpRef.current.isDedicatedServer;
      preserveOnlineRoomRef.current = true;
    }
    const totalTracks = activeCup?.tracks.length ?? 1;
    setSelectedTrackIdx((prev) => {
      if (prev + 1 < totalTracks) {
        return prev + 1;
      }
      cupPointsByCharRef.current = {};
      setCupStandings([]);
      return 0;
    });
    setRaceSessionKey((k) => k + 1);
  }, [activeCup]);

  const advanceToNextTrackAcrossAllCups = useCallback(() => {
    joinedTrackOverrideRef.current = null;
    pendingWelcomeSnapshotRef.current = null;
    const totalTracks = activeCup?.tracks.length ?? 1;
    if (selectedTrackIdx + 1 < totalTracks) {
      setSelectedTrackIdx(selectedTrackIdx + 1);
    } else {
      const curCupIdx = cupsCatalog.findIndex((c) => c.id === activeCup?.id);
      const nextCup =
        cupsCatalog[
          (Math.max(0, curCupIdx) + 1) % Math.max(1, cupsCatalog.length)
        ];
      if (nextCup) {
        setSelectedCupId(nextCup.id);
      }
      cupPointsByCharRef.current = {};
      setCupStandings([]);
      setSelectedTrackIdx(0);
    }
    setRaceSessionKey((k) => k + 1);
  }, [activeCup, cupsCatalog, selectedTrackIdx]);


  const toggleMusicMute = useCallback(() => {
    setMusicMuted((prev) => {
      const next = !prev;
      soundtrackRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const [selectedCharId, setSelectedCharId] = useState<string>("aero_vance");
  const [selectedKartByChar, setSelectedKartByChar] = useState<
    Record<string, string>
  >({
    rex_ironclad: "behemoth_bruiser",
    aero_vance: "apex_striker",
    nyx_drift: "phantom_coupe",
    pip_spark: "bumblebee_buggy",
  });

  const selectedCharacter = useMemo(
    () =>
      CHARACTER_ROSTER.find((c) => c.id === selectedCharId) ??
      CHARACTER_ROSTER[0],
    [selectedCharId]
  );

  const activeKartId =
    selectedKartByChar[selectedCharacter.id] ?? selectedCharacter.defaultKartId;

  const resolvedPreviewStats = useMemo(
    () => resolveRacerStats(selectedCharacter.id, activeKartId),
    [selectedCharacter.id, activeKartId]
  );

  const handleLobbyUpdated = useCallback(
    (
      players: OnlinePlayerPresence[],
      rooms: OnlineRoomSummary[],
      status: NetworkBackendStatus
    ) => {
      setOnlinePlayers(players);
      setOpenRooms(rooms);
      setBackendStatus(status);
    },
    []
  );

  const handleWelcomeSnapshot = useCallback(
    (snapshot: WelcomeSnapshotPayload) => {
      pendingWelcomeSnapshotRef.current = snapshot;
      joinedTrackOverrideRef.current = snapshot.trackDef;
      if (snapshot.cupDef) {
        joinedCupOverrideRef.current = snapshot.cupDef;
        setJoinedCupOverride(snapshot.cupDef);
      }
      shouldHostOnlineRef.current = false;
      if (snapshot.assignedSlotIndex < 0) {
        spectateAutoDirectorRef.current = true;
      }
      setJoiningRoomId(null);
      if (snapshot.trackIdx === 0) {
        cupPointsByCharRef.current = {};
        setCupStandings([]);
      }
      setSelectedCupId(snapshot.cupId);
      setSelectedTrackIdx(snapshot.trackIdx);
      setIsCupSeriesActive(true);
      setRaceSessionKey((k) => k + 1);
      setScreen("RACE");
    },
    []
  );

  // Initialize MultiplayerManager once on client mount (100% safe offline / without env vars)
  useEffect(() => {
    const mp = new MultiplayerManager(selectedCharacter.id, activeKartId, {
      onLobbyUpdated: handleLobbyUpdated,
      onWelcomeSnapshot: handleWelcomeSnapshot,
    });
    mpRef.current = mp;
    setPlayerCallsign(mp.playerName);

    return () => {
      mp.dispose();
      mpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep player identity synced with MultiplayerManager when callsign, character, or kart changes
  useEffect(() => {
    mpRef.current?.setPlayerIdentity(
      playerCallsign,
      selectedCharacter.id,
      activeKartId
    );
  }, [playerCallsign, selectedCharacter.id, activeKartId]);

  const handleJoinOnlineRoom = useCallback(
    (room: OnlineRoomSummary) => {
      if (!mpRef.current) return;
      setJoiningRoomId(room.roomId);
      mpRef.current.setPlayerIdentity(
        playerCallsign,
        selectedCharacter.id,
        activeKartId
      );
      mpRef.current.joinExistingRoom(room);
    },
    [playerCallsign, selectedCharacter.id, activeKartId]
  );

  const handleLeaveOnlineRaceToMenu = useCallback(() => {
    mpRef.current?.leaveCurrentRoom(true);
    shouldHostOnlineRef.current = false;
    shouldHostDedicatedRef.current = false;
    preserveOnlineRoomRef.current = false;
    pendingWelcomeSnapshotRef.current = null;
    joinedTrackOverrideRef.current = null;
    joinedCupOverrideRef.current = null;
    setJoinedCupOverride(null);
    setJoiningRoomId(null);
    setScreen("SELECT");
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [miniMapMeta, setMiniMapMeta] = useState<{
    svgPath: string;
    viewBox: string;
    finishX: number;
    finishY: number;
    finishAngleDeg: number;
  }>({
    svgPath: "",
    viewBox: "-50 -160 220 290",
    finishX: 0,
    finishY: 0,
    finishAngleDeg: 0,
  });

  const [telemetry, setTelemetry] = useState<HudTelemetry>({
    racePhase: "COUNTDOWN",
    countdownValue: 3,
    elapsedRaceMs: 0,
    rank: 1,
    lap: 1,
    totalLaps: TOTAL_LAPS,
    speed: 0,
    maxSpeed: 43,
    surface: "PAVEMENT",
    distToCenter: 0,
    driftState: "NONE",
    driftDirection: 0,
    driftChargeSeconds: 0,
    miniTurboTier: 0,
    activeBoostLabel: null,
    heldItem: null,
    rouletteSpinning: false,
    roulettePreviewItem: null,
    novaOverdriveRemaining: 0,
    cameraMode: "CHASE",
    standings: [],
    lastCollisionBanner: null,
    lastItemBanner: null,
    wrongWay: false,
  });

  // Shared mutable input state read by 60Hz Babylon.js loop (avoids React re-renders)
  const keyboardStateRef = useRef<{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    shiftHeld: boolean;
    spaceHeld: boolean;
    driftHeld: boolean;
  }>({
    up: false,
    down: false,
    left: false,
    right: false,
    shiftHeld: false,
    spaceHeld: false,
    driftHeld: false,
  });

  const touchStateRef = useRef<{
    steer: number;
    throttle: number;
    brake: number;
    brakeButtonHeld: boolean;
    driftHeld: boolean;
  }>({
    steer: 0,
    throttle: 0,
    brake: 0,
    brakeButtonHeld: false,
    driftHeld: false,
  });

  const pendingEdgesRef = useRef<{
    hopJustPressed: boolean;
    useItemJustPressed: boolean;
    itemAimOverride: -1 | 0 | 1;
  }>({
    hopJustPressed: false,
    useItemJustPressed: false,
    itemAimOverride: 0,
  });

  const cameraModeRef = useRef<CameraMode>("CHASE");
  const telemetryRef = useRef<HudTelemetry>(telemetry);
  const lastCollisionReportRef = useRef<AsymmetricCollisionReport | null>(null);

  const cycleCameraMode = useCallback(() => {
    const order: CameraMode[] = ["CHASE", "DYNAMIC_WIDE", "HOOD"];
    const next = order[(order.indexOf(cameraModeRef.current) + 1) % order.length];
    cameraModeRef.current = next;
    setTelemetry((prev) => ({ ...prev, cameraMode: next }));
  }, []);

  const touchCallbacks = useMemo<TouchControlCallbacks>(
    () => ({
      onJoystickChange: (steer, throttle, brake) => {
        touchStateRef.current.steer = steer;
        touchStateRef.current.throttle = throttle;
        touchStateRef.current.brake = brake;
      },
      onJumpDriftStart: () => {
        if (!touchStateRef.current.driftHeld) {
          pendingEdgesRef.current.hopJustPressed = true;
        }
        touchStateRef.current.driftHeld = true;
      },
      onJumpDriftEnd: () => {
        touchStateRef.current.driftHeld = false;
      },
      onTriggerPowerUp: () => {
        pendingEdgesRef.current.useItemJustPressed = true;
      },
      onBrakeHoldChange: (held) => {
        touchStateRef.current.brakeButtonHeld = held;
      },
    }),
    []
  );

  // Main Babylon.js 3D Engine & 60Hz Simulation Loop
  useEffect(() => {
    if (screen !== "RACE") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.46, 0.72, 0.96, 1.0); // Vibrant suburban sky

    const effectiveTrackDef = joinedTrackOverrideRef.current ?? trackDef;

    // Build closed-loop Catmull-Rom spline track, curbs, terrain, obstacles, and props
    const track: BuiltTrack = buildProceduralTrack(scene, effectiveTrackDef);
    const startSample0 = track.samples[0];
    const finishAngleDeg = startSample0
      ? (Math.atan2(startSample0.tangent.x, startSample0.tangent.z) * 180) /
        Math.PI
      : 0;
    setMiniMapMeta({
      svgPath: track.miniMapSvgPath,
      viewBox: track.miniMapViewBox,
      finishX: startSample0 ? startSample0.position.x : 0,
      finishY: startSample0 ? -startSample0.position.z : 0,
      finishAngleDeg,
    });

    // Start lighthearted synthesized arcade racing soundtrack
    const bgm = new SoundtrackManager();
    bgm.setMuted(musicMuted);
    bgm.start();
    soundtrackRef.current = bgm;

    // Follow camera
    const camera = new FreeCamera(
      "raceCamera",
      new Vector3(0, 6.5, -14),
      scene
    );
    camera.fov = 0.88;
    camera.minZ = 0.3;
    camera.maxZ = 1200;

    const itemManager = new ItemManager(scene, track);

    // Banner state
    let collisionBanner: string | null = null;
    let collisionBannerTimer = 0;
    let itemBanner: string | null = null;
    let itemBannerTimer = 0;

    const pushItemBanner = (msg: string) => {
      itemBanner = msg;
      itemBannerTimer = 2.8;
    };

    // Race timing & online client map-load readiness state
    let countdownRemaining = 3.0;
    let racePhase: "COUNTDOWN" | "RACING" | "FINISHED" = "COUNTDOWN";
    let elapsedRaceMs = 0;
    let firstFinisherTimeMs: number | null = null;
    let postRaceAutoAdvanceTimer = 10.0;
    let autoAdvanceTriggered = false;
    let cupPointsAwardedForRace = false;
    let lastRecordedFinishCount = -1;
    const trackRecordKey =
      effectiveTrackDef.id || `${selectedCupId}_track_${selectedTrackIdx}`;
    globalAiBrain.resetEpisodeTelemetry(
      effectiveTrackDef.id || effectiveTrackDef.name || trackRecordKey
    );
    const baselineTrackRecord = trackRecordsRef.current[trackRecordKey];
    const baselineBestRaceMs = baselineTrackRecord?.bestRaceTimeMs ?? null;
    const baselineBestLapMs = baselineTrackRecord?.bestLapTimeMs ?? null;
    const racePointsBySlot: Record<string, number> = {};
    let lastHudSyncTime = 0;
    let lastNetTickTime = 0;
    let lastLobbySummaryTime = 0;
    let lastSimStepPerfTime = performance.now();
    const readyPeerIds = new Set<string>();
    let countdownReadyWaitSec = 0;

    const mp = mpRef.current;
    if (mp?.peerId) {
      readyPeerIds.add(mp.peerId);
    }
    const welcomeSnapshot = pendingWelcomeSnapshotRef.current;
    pendingWelcomeSnapshotRef.current = null;

    const racers: KartController[] = [];
    const gridLateral = [-4.6, 4.6, -4.6, 4.6];
    const gridBackOffset = [-3.5, -5.5, -10.5, -12.5];

    if (welcomeSnapshot && welcomeSnapshot.slots.length === 4) {
      // JOINED CLIENT INITIALIZATION: Load 3D environment with all 4 karts at their live track positions.
      // New joiners start in Spectator Mode (assignedSlotIndex === -1) watching the lead racer until they click to assume an AI racer!
      countdownRemaining = welcomeSnapshot.countdownRemaining;
      racePhase = welcomeSnapshot.racePhase;
      elapsedRaceMs = welcomeSnapshot.elapsedRaceMs;
      aiDifficultyRef.current = welcomeSnapshot.aiDifficulty;

      welcomeSnapshot.slots.forEach((slotState, idx) => {
        const peerAtSlot = welcomeSnapshot.peers?.find(
          (p) => p.slotIndex === idx
        );
        const isLocalHuman =
          welcomeSnapshot.assignedSlotIndex >= 0 &&
          idx === welcomeSnapshot.assignedSlotIndex;
        const isRemoteHuman =
          !isLocalHuman &&
          (slotState.controlMode === "HUMAN" || Boolean(peerAtSlot));
        const controlMode = isLocalHuman
          ? "LOCAL_HUMAN"
          : isRemoteHuman
          ? "REMOTE_HUMAN"
          : "AI";
        const effectiveCharId =
          peerAtSlot?.characterId || slotState.characterId;
        const effectiveKartId = peerAtSlot?.kartId || slotState.kartId;
        const stats = resolveRacerStats(effectiveCharId, effectiveKartId);
        const resolvedHumanName = isLocalHuman
          ? playerCallsignRef.current.trim() ||
            mp?.playerName ||
            peerAtSlot?.playerName ||
            slotState.playerName
          : peerAtSlot?.playerName || slotState.playerName;
        const effectiveName =
          controlMode !== "AI" && resolvedHumanName
            ? resolvedHumanName
            : stats.character.name;

        const controller = new KartController({
          scene,
          track,
          racerId: isLocalHuman ? "player" : `slot_${idx}_${effectiveCharId}`,
          stats,
          isPlayer: isLocalHuman,
          controlMode,
          ownerPeerId: peerAtSlot?.peerId ?? slotState.ownerPeerId,
          customDisplayName: effectiveName,
          spawnPosition: new Vector3(slotState.x, slotState.y, slotState.z),
          spawnYaw: slotState.headingYaw,
          aiSlotIndex: idx,
          aiDifficulty: welcomeSnapshot.aiDifficulty,
        });

        controller.applyNetState(
          {
            ...slotState,
            controlMode: controlMode === "AI" ? "AI" : "HUMAN",
            ownerPeerId: peerAtSlot?.peerId ?? slotState.ownerPeerId,
            playerName: effectiveName,
          },
          true
        );
        racers.push(controller);
      });

      itemManager.applyBoxRespawnTimers(welcomeSnapshot.boxRespawnTimers);

      const sortedOnLoad = [...racers].sort(
        (a, b) => b.totalProgressDistance - a.totalProgressDistance
      );
      if (welcomeSnapshot.assignedSlotIndex < 0) {
        spectateAutoDirectorRef.current = true;
        spectateSlotIndexRef.current = sortedOnLoad[0]?.slotIndex ?? 0;
        pushItemBanner(
          `SPECTATING LEAD RACER (${sortedOnLoad[0]?.name ?? "1st Place"}) — Click 'JOIN RACE & ASSUME AI' when ready!`
        );
      } else {
        spectateAutoDirectorRef.current = false;
        spectateSlotIndexRef.current = welcomeSnapshot.assignedSlotIndex;
        pushItemBanner(
          `READY IN SLOT #${welcomeSnapshot.assignedSlotIndex + 1} (Lap ${racers[welcomeSnapshot.assignedSlotIndex]?.lap ?? 1})!`
        );
      }

      // Signal to Host that our client has finished loading the 3D map and karts
      if (mp && mp.activeRoomId) {
        const assignedSlot = welcomeSnapshot.assignedSlotIndex;
        mp.broadcastClientReady(assignedSlot);
        setTimeout(() => mp.broadcastClientReady(assignedSlot), 180);
        setTimeout(() => mp.broadcastClientReady(assignedSlot), 500);
      }
    } else {
      // STANDARD STARTING GRID (Single-Player, Online Host, OR Dedicated Server)
      const isOnlineHost = Boolean(
        shouldHostOnlineRef.current || (mp?.activeRoomId && mp.isHost)
      );
      const isDedicatedHost = Boolean(
        shouldHostDedicatedRef.current ||
          (mp?.activeRoomId && mp.isHost && mp.isDedicatedServer)
      );
      const keepExistingRoom = Boolean(
        preserveOnlineRoomRef.current && mp?.activeRoomId && mp.isHost
      );
      const preservedRemotePeers =
        keepExistingRoom && mp
          ? mp.roomPeers.filter((p) => p.peerId !== mp.peerId)
          : [];

      const baseOrderedChars =
        allAiSimModeRef.current && !isOnlineHost
          ? [...CHARACTER_ROSTER]
          : [
              selectedCharacter,
              ...CHARACTER_ROSTER.filter((c) => c.id !== selectedCharacter.id),
            ];
      const gridRotationOffset =
        allAiSimModeRef.current && !isOnlineHost
          ? globalAiBrain.getEpisodesCompleted() % 4
          : 0;
      const orderedChars = baseOrderedChars.map(
        (_, i) => baseOrderedChars[(i + gridRotationOffset) % baseOrderedChars.length]
      );

      orderedChars.forEach((charProfile, idx) => {
        const remotePeerAtSlot = preservedRemotePeers.find(
          (p) => p.slotIndex === idx
        );
        const isLocalPlayer =
          idx === 0 &&
          !isDedicatedHost &&
          !allAiSimModeRef.current &&
          !remotePeerAtSlot;

        const charId = remotePeerAtSlot
          ? remotePeerAtSlot.characterId
          : charProfile.id;
        const kartId = remotePeerAtSlot
          ? remotePeerAtSlot.kartId
          : isLocalPlayer
          ? selectedKartByChar[charProfile.id] ?? charProfile.defaultKartId
          : charProfile.defaultKartId;
        const rawStats = resolveRacerStats(charId, kartId);
        const stats = !isOnlineHost
          ? globalAiBrain.applyAutoBalanceToStats(rawStats)
          : rawStats;

        const startSample = track.samples[0];
        const spawnPos = startSample.position
          .add(startSample.tangent.scale(gridBackOffset[idx]))
          .add(startSample.binormal.scale(gridLateral[idx]))
          .add(new Vector3(0, 0.12, 0));
        const spawnYaw = Math.atan2(
          startSample.tangent.x,
          startSample.tangent.z
        );

        const controlMode = remotePeerAtSlot
          ? "REMOTE_HUMAN"
          : isLocalPlayer
          ? "LOCAL_HUMAN"
          : "AI";

        const controller = new KartController({
          scene,
          track,
          racerId: isLocalPlayer ? "player" : `slot_${idx}_${charId}`,
          stats,
          isPlayer: isLocalPlayer,
          controlMode,
          ownerPeerId: remotePeerAtSlot
            ? remotePeerAtSlot.peerId
            : isLocalPlayer && isOnlineHost
            ? mp?.peerId ?? null
            : null,
          customDisplayName: remotePeerAtSlot
            ? remotePeerAtSlot.playerName
            : isLocalPlayer
            ? playerCallsignRef.current.trim() ||
              mp?.playerName ||
              stats.character.name
            : stats.character.name,
          spawnPosition: spawnPos,
          spawnYaw,
          aiSlotIndex: idx,
          aiDifficulty: aiDifficultyRef.current,
        });

        racers.push(controller);
      });

      if ((shouldHostOnlineRef.current || keepExistingRoom) && mp) {
        shouldHostOnlineRef.current = false;
        preserveOnlineRoomRef.current = false;
        mp.hostNewRoom({
          cupId: selectedCupId,
          cupName: activeCup?.name,
          trackIdx: selectedTrackIdx,
          trackDef: effectiveTrackDef,
          isCustomTrack: Boolean(
            effectiveTrackDef.isUserModified || activeCup?.isCustomCup
          ),
          aiDifficulty: aiDifficultyRef.current,
          totalLaps: TOTAL_LAPS,
          isDedicatedServer: isDedicatedHost,
          preserveExistingRoom: keepExistingRoom,
          slotSummaries: racers.map((r) => ({
            slotIndex: r.slotIndex,
            isHuman: r.controlMode !== "AI",
            playerName: r.name,
            characterId: r.stats.character.id,
            kartId: r.stats.kart.id,
          })),
        });

        // If transitioning to a new track in an existing room, push a fresh WELCOME_SNAPSHOT to all connected peers
        if (keepExistingRoom && preservedRemotePeers.length > 0 && mp.activeRoomId) {
          for (const remotePeer of preservedRemotePeers) {
            const nextTrackSnapshot: WelcomeSnapshotPayload = {
              roomId: mp.activeRoomId,
              hostPeerId: mp.peerId,
              assignedSlotIndex: remotePeer.slotIndex,
              cupId: selectedCupId,
              cupDef: activeCup,
              trackIdx: selectedTrackIdx,
              trackDef: effectiveTrackDef,
              aiDifficulty: aiDifficultyRef.current,
              racePhase,
              countdownRemaining,
              elapsedRaceMs,
              slots: racers.map((r) => r.exportNetState()),
              boxRespawnTimers: itemManager.exportBoxRespawnTimers(),
              peers: mp.roomPeers,
            };
            mp.sendRoomMessage(
              {
                type: "WELCOME_SNAPSHOT",
                senderId: mp.peerId,
                targetPeerId: remotePeer.peerId,
                payload: nextTrackSnapshot,
              },
              true
            );
          }
        }

        pushItemBanner(
          isDedicatedHost
            ? "DEDICATED SERVER LIVE: All 4 slots open for online players — Spectator & Auto-Loop active!"
            : "ONLINE ROOM LIVE: 3 AI Bots filling slots — players can hot-join anytime!"
        );
      }
    }

    const getLocalPlayerKart = (): KartController | null =>
      racers.find((r) => r.controlMode === "LOCAL_HUMAN") ?? null;

    const getFocusKart = (sortedList?: KartController[]): KartController => {
      const local = getLocalPlayerKart();
      if (local) return local;
      if (
        spectateAutoDirectorRef.current &&
        sortedList &&
        sortedList.length > 0
      ) {
        return sortedList[0];
      }
      return (
        racers[spectateSlotIndexRef.current] ??
        (sortedList && sortedList[0]) ??
        racers[0]
      );
    };

    const initialSortedRacers = [...racers].sort(
      (a, b) => b.totalProgressDistance - a.totalProgressDistance
    );
    const initialFocusKart = getFocusKart(initialSortedRacers);

    // Snap camera immediately behind initial focus kart on spawn / spectate
    camera.position.copyFrom(
      initialFocusKart.position
        .subtract(initialFocusKart.forwardVector.scale(8.8))
        .add(new Vector3(0, 3.9, 0))
    );
    camera.setTarget(
      initialFocusKart.position
        .add(initialFocusKart.forwardVector.scale(7.5))
        .add(new Vector3(0, 1.35, 0))
    );

    // Helper: Pick an open AI slot to assume (honors explicit preferredSlot, otherwise prefers a non-leader AI racer in the pack)
    const selectNonFirstPlaceAiSlot = (
      preferredCharId?: string,
      preferredSlot?: number
    ): KartController | null => {
      const aiCandidates = racers.filter((r) => r.controlMode === "AI");
      if (aiCandidates.length === 0) return null;

      if (preferredSlot !== undefined) {
        const explicitMatch = aiCandidates.find(
          (r) => r.slotIndex === preferredSlot
        );
        if (explicitMatch) return explicitMatch;
      }

      // Sort all racers by current progress to know live rankings accurately
      const byProgress = [...racers].sort(
        (a, b) => b.totalProgressDistance - a.totalProgressDistance
      );
      const leaderSlotIndex = byProgress[0]?.slotIndex ?? -1;

      const nonLeaderAi = aiCandidates.filter(
        (r) => r.slotIndex !== leaderSlotIndex && r.rank !== 1
      );
      const pool = nonLeaderAi.length > 0 ? nonLeaderAi : aiCandidates;

      if (preferredCharId) {
        const charMatch = pool.find(
          (r) => r.stats.character.id === preferredCharId
        );
        if (charMatch) return charMatch;
      }

      // Prefer an AI in the competitive pack (2nd or 3rd place) so the player is right in the action
      const sortedPool = [...pool].sort(
        (a, b) => b.totalProgressDistance - a.totalProgressDistance
      );
      return sortedPool[0] ?? pool[0];
    };

    // Helper: Prepare an AI kart to be seamlessly assumed in-place at its exact live track position, speed, and lap
    // (never resets to the start/finish line and never loses lap/checkpoint progress!)
    const prepareAssumedAiKartInPlace = (assumedKart: KartController): void => {
      assumedKart.knockVelocity.setAll(0);
      assumedKart.spinOutTimer = 0;
      assumedKart.wobbleTimer = 0;
      assumedKart.driftState = "NONE";
      assumedKart.driftDirection = 0;
      assumedKart.driftChargeSeconds = 0;
      assumedKart.driftChargeSubState = 0;
      assumedKart.miniTurboTier = 0;
      assumedKart.lateralSpeed = 0;

      assumedKart.closestTrack = track.queryClosestTrackPoint(
        assumedKart.position
      );
      assumedKart.distToCenter = assumedKart.closestTrack.horizontalDistance;

      // If the AI kart happened to be off-road when assumed, place it cleanly onto the asphalt at its exact spline progress
      if (assumedKart.distToCenter > track.roadHalfWidth * 0.85) {
        const safeSample = track.getPointAtNormalizedT(
          assumedKart.closestTrack.normalizedSplineT,
          0
        );
        assumedKart.position.copyFrom(
          safeSample.position.add(new Vector3(0, 0.12, 0))
        );
        assumedKart.headingYaw = Math.atan2(
          safeSample.tangent.x,
          safeSample.tangent.z
        );
        assumedKart.closestTrack = track.queryClosestTrackPoint(
          assumedKart.position
        );
        assumedKart.distToCenter = assumedKart.closestTrack.horizontalDistance;
      }

      if (racePhase === "RACING" && !assumedKart.finished) {
        assumedKart.forwardSpeed = Math.max(
          assumedKart.forwardSpeed,
          assumedKart.stats.topSpeed * 0.84
        );
        assumedKart.velocity = assumedKart.forwardVector.scale(
          assumedKart.forwardSpeed
        );
      }

      const t = assumedKart.closestTrack.normalizedSplineT;
      assumedKart.lastNormalizedT = t;
      if (t >= 0.7) {
        assumedKart.checkpointsMask |= 7;
      } else if (t >= 0.45) {
        assumedKart.checkpointsMask |= 3;
      } else if (t >= 0.2) {
        assumedKart.checkpointsMask |= 1;
      }
      const completedLaps = assumedKart.finished
        ? TOTAL_LAPS
        : Math.max(0, assumedKart.lap - 1);
      assumedKart.totalProgressDistance =
        completedLaps * track.totalTrackLength +
        assumedKart.closestTrack.distanceAlongTrack;

      assumedKart.assembly.kartRoot.position.copyFrom(assumedKart.position);
      assumedKart.assembly.kartRoot.rotation.y = assumedKart.headingYaw;
    };

    // Allow Host, Client, OR Offline Single-Player to step out of their kart mid-race into Spectator / 4-AI Training Mode
    stepOutToSpectateActionRef.current = () => {
      const currentLocal = getLocalPlayerKart();
      if (!currentLocal) return;
      const freedSlot = currentLocal.slotIndex;
      currentLocal.controlMode = "AI";
      currentLocal.isPlayer = false;
      currentLocal.ownerPeerId = null;
      currentLocal.name = currentLocal.stats.character.name;
      currentLocal.assembly.updateNameplate(currentLocal.name, false);

      allAiSimModeRef.current = true;
      spectateSlotIndexRef.current = freedSlot;
      spectateAutoDirectorRef.current = true;

      if (!mp || !mp.activeRoomId) {
        const savedSpeed = getSavedAiSimSpeed();
        setSimSpeedMult(savedSpeed);
        simSpeedMultRef.current = savedSpeed;
        pushItemBanner(
          `4-AI Simulation Mode Active — AI took over Slot #${freedSlot + 1} (${currentLocal.name})!`
        );
        return;
      }

      if (mp.isHost) {
        shouldHostDedicatedRef.current = true;
        mp.setHostSpectatorMode(true, -1);

        const bannerMsg = `Host stepped out to Spectator Mode — AI Bot took over Slot #${freedSlot + 1} (All 4 slots open)!`;
        mp.sendRoomMessage(
          {
            type: "SLOT_TAKEOVER",
            senderId: mp.peerId,
            payload: {
              roomId: mp.activeRoomId,
              slotIndex: freedSlot,
              controlMode: "AI",
              ownerPeerId: null,
              playerName: currentLocal.name,
              characterId: currentLocal.stats.character.id,
              kartId: currentLocal.stats.kart.id,
              peers: mp.roomPeers,
              bannerMessage: bannerMsg,
              slotState: currentLocal.exportNetState(),
            },
          },
          true
        );
        pushItemBanner(bannerMsg);
      } else {
        mp.requestStepOutToSpectate(freedSlot);
        pushItemBanner(
          `Stepped out to Spectator Mode — AI Bot took over Slot #${freedSlot + 1}!`
        );
      }
    };

    // Allow Spectating Player (Offline, Client, OR Host) to click a button when ready to join in and assume the role of an AI racer in-place!
    jumpInToDriveActionRef.current = (preferredSlot?: number) => {
      if (getLocalPlayerKart()) return;

      // If the player manually selected a specific AI racer on the spectator camera, prefer assuming that AI racer
      const watchedSlot = !spectateAutoDirectorRef.current
        ? spectateSlotIndexRef.current
        : undefined;
      const effectivePreferredSlot =
        preferredSlot !== undefined
          ? preferredSlot
          : watchedSlot !== undefined &&
            racers[watchedSlot]?.controlMode === "AI"
          ? watchedSlot
          : undefined;

      const chosenKartId =
        selectedKartByChar[selectedCharacter.id] ??
        selectedCharacter.defaultKartId;
      const liveCallsign =
        playerCallsignRef.current.trim() || mp?.playerName || "Racer";

      if (!mp || !mp.activeRoomId) {
        const targetAi =
          selectNonFirstPlaceAiSlot(
            selectedCharacter.id,
            effectivePreferredSlot
          ) ?? racers[0];
        if (!targetAi) return;
        const newStats = resolveRacerStats(selectedCharacter.id, chosenKartId);
        targetAi.swapRacerIdentity({
          newStats,
          newDisplayName: liveCallsign,
          newControlMode: "LOCAL_HUMAN",
          ownerPeerId: null,
        });
        prepareAssumedAiKartInPlace(targetAi);
        allAiSimModeRef.current = false;
        setSimSpeedMult(1);
        simSpeedMultRef.current = 1;
        spectateAutoDirectorRef.current = false;
        spectateSlotIndexRef.current = targetAi.slotIndex;
        pushItemBanner(
          `${liveCallsign} took the wheel in Slot #${targetAi.slotIndex + 1} (Lap ${targetAi.lap})!`
        );
        return;
      }

      mp.setPlayerIdentity(liveCallsign, selectedCharacter.id, chosenKartId);

      if (mp.isHost) {
        const targetAi = selectNonFirstPlaceAiSlot(
          selectedCharacter.id,
          effectivePreferredSlot
        );

        if (!targetAi) {
          pushItemBanner(
            "All 4 racer slots are currently occupied by online human players!"
          );
          return;
        }

        const takenSlot = targetAi.slotIndex;
        const newStats = resolveRacerStats(selectedCharacter.id, chosenKartId);

        targetAi.swapRacerIdentity({
          newStats,
          newDisplayName: liveCallsign,
          newControlMode: "LOCAL_HUMAN",
          ownerPeerId: mp.peerId,
        });
        prepareAssumedAiKartInPlace(targetAi);

        allAiSimModeRef.current = false;
        shouldHostDedicatedRef.current = false;
        spectateAutoDirectorRef.current = false;
        spectateSlotIndexRef.current = takenSlot;
        mp.setHostSpectatorMode(false, takenSlot);

        const bannerMsg = `${liveCallsign} assumed AI Racer in Slot #${takenSlot + 1} (Lap ${targetAi.lap})!`;
        mp.sendRoomMessage(
          {
            type: "SLOT_TAKEOVER",
            senderId: mp.peerId,
            payload: {
              roomId: mp.activeRoomId,
              slotIndex: takenSlot,
              controlMode: "HUMAN",
              ownerPeerId: mp.peerId,
              playerName: liveCallsign,
              characterId: selectedCharacter.id,
              kartId: chosenKartId,
              peers: mp.roomPeers,
              bannerMessage: bannerMsg,
              slotState: targetAi.exportNetState(),
            },
          },
          true
        );
        pushItemBanner(bannerMsg);
      } else {
        // Spectating Client: Request to claim an AI racer from the Host in-place!
        const hasOpenAi = racers.some((r) => r.controlMode === "AI");
        if (!hasOpenAi) {
          pushItemBanner(
            "All 4 racer slots are currently occupied by online human players!"
          );
          return;
        }

        const sendClaim = () => {
          if (getLocalPlayerKart() || !mp.activeRoomId || mp.isHost) return;
          mp.requestClaimAiSlot(effectivePreferredSlot);
        };
        sendClaim();
        setTimeout(sendClaim, 220);
        setTimeout(sendClaim, 550);
        pushItemBanner("Assuming AI Racer — Taking the wheel in-place...");
      }
    };

    // Host helper: When a player joins the room from the lobby, load them into Spectator Mode (assignedSlotIndex = -1)
    // so their 3D environment finishes loading and they spectate the lead racer before clicking to assume an AI racer!
    const handleHostWelcomeJoiningSpectator = (req: {
      peerId: string;
      playerName: string;
      characterId: string;
      kartId: string;
      joinedAt: number;
    }) => {
      if (!mp || !mp.isHost || !mp.activeRoomId) return;

      const existingRacer = racers.find((r) => r.ownerPeerId === req.peerId);
      const assignedSlot = existingRacer ? existingRacer.slotIndex : -1;

      const updatedPeers = mp.roomPeers.filter((p) => p.peerId !== req.peerId);
      updatedPeers.push({
        peerId: req.peerId,
        playerName: req.playerName,
        characterId: req.characterId,
        kartId: req.kartId,
        slotIndex: assignedSlot,
        joinedAt: req.joinedAt,
      });
      updatedPeers.sort(
        (a, b) => a.joinedAt - b.joinedAt || a.peerId.localeCompare(b.peerId)
      );
      mp.roomPeers = updatedPeers;

      const snapshot: WelcomeSnapshotPayload = {
        roomId: mp.activeRoomId,
        hostPeerId: mp.peerId,
        assignedSlotIndex: assignedSlot,
        cupId: selectedCupId,
        cupDef: activeCup,
        trackIdx: selectedTrackIdx,
        trackDef: effectiveTrackDef,
        aiDifficulty: aiDifficultyRef.current,
        racePhase,
        countdownRemaining,
        elapsedRaceMs,
        slots: racers.map((r) => r.exportNetState()),
        boxRespawnTimers: itemManager.exportBoxRespawnTimers(),
        peers: updatedPeers,
      };

      mp.sendRoomMessage(
        {
          type: "WELCOME_SNAPSHOT",
          senderId: mp.peerId,
          targetPeerId: req.peerId,
          payload: snapshot,
        },
        true
      );
    };

    // Host helper: Process a spectating player clicking the button to assume an AI racer in-place!
    const handleHostClaimAiSlotForClient = (req: {
      peerId: string;
      playerName: string;
      characterId: string;
      kartId: string;
      preferredSlotIndex?: number;
    }) => {
      if (!mp || !mp.isHost || !mp.activeRoomId) return null;

      // Check if peer already claimed a slot (e.g. duplicate retry packet)
      const alreadyAssigned = racers.find((r) => r.ownerPeerId === req.peerId);
      const isNewAssignment = !alreadyAssigned;
      const targetRacer =
        alreadyAssigned ??
        selectNonFirstPlaceAiSlot(req.characterId, req.preferredSlotIndex);

      if (!targetRacer) return null;

      const assignedSlot = targetRacer.slotIndex;
      const newStats = resolveRacerStats(req.characterId, req.kartId);

      targetRacer.swapRacerIdentity({
        newStats,
        newDisplayName: req.playerName,
        newControlMode: "REMOTE_HUMAN",
        ownerPeerId: req.peerId,
      });

      if (isNewAssignment) {
        prepareAssumedAiKartInPlace(targetRacer);
      }

      const existingPeerEntry = mp.roomPeers.find(
        (p) => p.peerId === req.peerId
      );
      const updatedPeers = mp.roomPeers.filter((p) => p.peerId !== req.peerId);
      updatedPeers.push({
        peerId: req.peerId,
        playerName: req.playerName,
        characterId: req.characterId,
        kartId: req.kartId,
        slotIndex: assignedSlot,
        joinedAt: existingPeerEntry?.joinedAt ?? Date.now(),
      });
      updatedPeers.sort(
        (a, b) => a.joinedAt - b.joinedAt || a.peerId.localeCompare(b.peerId)
      );
      mp.roomPeers = updatedPeers;

      const liveSlotState = targetRacer.exportNetState();
      const bannerMsg = `${req.playerName} assumed AI Racer in Slot #${assignedSlot + 1} (Lap ${targetRacer.lap})!`;
      mp.sendRoomMessage(
        {
          type: "SLOT_TAKEOVER",
          senderId: mp.peerId,
          payload: {
            roomId: mp.activeRoomId,
            slotIndex: assignedSlot,
            controlMode: "HUMAN",
            ownerPeerId: req.peerId,
            playerName: req.playerName,
            characterId: req.characterId,
            kartId: req.kartId,
            peers: updatedPeers,
            bannerMessage: bannerMsg,
            slotState: liveSlotState,
          },
        },
        true
      );

      pushItemBanner(bannerMsg);
      return {
        replacedSlotIndex: assignedSlot,
        inheritedLap: targetRacer.lap,
        inheritedProgress: Number(targetRacer.totalProgressDistance.toFixed(1)),
        newCharacterId: newStats.character.id,
        newKartId: newStats.kart.id,
        newMass: newStats.baseMass,
      };
    };

    // Wire live multiplayer callbacks for this race session
    if (mp) {
      mp.setCallbacks({
        onLobbyUpdated: handleLobbyUpdated,
        onWelcomeSnapshot: handleWelcomeSnapshot,
        onJoinRequest: (req) => {
          handleHostWelcomeJoiningSpectator(req);
        },
        onClaimAiSlot: (req) => {
          handleHostClaimAiSlotForClient(req);
        },
        onClientStepOut: (peerId, slotIndex) => {
          if (!mp.isHost || !mp.activeRoomId) return;
          const r =
            racers.find((k) => k.ownerPeerId === peerId) ?? racers[slotIndex];
          if (!r || r.controlMode === "LOCAL_HUMAN") return;
          const freedSlot = r.slotIndex;
          const prevName = r.name;
          r.controlMode = "AI";
          r.isPlayer = false;
          r.ownerPeerId = null;
          r.name = r.stats.character.name;
          r.assembly.updateNameplate(r.name, false);

          mp.roomPeers = mp.roomPeers.map((p) =>
            p.peerId === peerId ? { ...p, slotIndex: -1 } : p
          );
          const bannerMsg = `${prevName} stepped out to Spectate — AI Bot took over Slot #${freedSlot + 1}!`;
          mp.sendRoomMessage(
            {
              type: "SLOT_TAKEOVER",
              senderId: mp.peerId,
              payload: {
                roomId: mp.activeRoomId,
                slotIndex: freedSlot,
                controlMode: "AI",
                ownerPeerId: null,
                playerName: r.name,
                characterId: r.stats.character.id,
                kartId: r.stats.kart.id,
                peers: mp.roomPeers,
                bannerMessage: bannerMsg,
                slotState: r.exportNetState(),
              },
            },
            true
          );
          pushItemBanner(bannerMsg);
        },
        onClientReady: (peerId) => {
          readyPeerIds.add(peerId);
        },
        onSlotTakeover: (takeover) => {
          const r = racers[takeover.slotIndex];
          if (!r) return;

          const isForLocalPlayer =
            Boolean(mp.peerId) &&
            takeover.ownerPeerId === mp.peerId &&
            takeover.controlMode === "HUMAN";

          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          if (!isForLocalPlayer && r.slotIndex === localSlot) {
            if (takeover.controlMode === "AI") {
              r.controlMode = "AI";
              r.isPlayer = false;
              r.ownerPeerId = null;
              r.name = r.stats.character.name;
              r.assembly.updateNameplate(r.name, false);
              spectateAutoDirectorRef.current = true;
            }
            return;
          }

          if (takeover.slotState) {
            r.applyNetState(takeover.slotState, true);
          }

          const newStats = resolveRacerStats(
            takeover.characterId,
            takeover.kartId
          );
          r.swapRacerIdentity({
            newStats,
            newDisplayName: takeover.playerName,
            newControlMode: isForLocalPlayer
              ? "LOCAL_HUMAN"
              : takeover.controlMode === "AI"
              ? "AI"
              : "REMOTE_HUMAN",
            ownerPeerId: takeover.ownerPeerId,
          });

          if (isForLocalPlayer) {
            prepareAssumedAiKartInPlace(r);
            spectateAutoDirectorRef.current = false;
            spectateSlotIndexRef.current = r.slotIndex;
            mp.localSlotIndex = r.slotIndex;
          }

          pushItemBanner(takeover.bannerMessage);
        },
        onHostWorldTick: (tick) => {
          racePhase = tick.racePhase;
          countdownRemaining = tick.countdownRemaining;
          if (Math.abs(tick.elapsedRaceMs - elapsedRaceMs) > 120) {
            elapsedRaceMs = tick.elapsedRaceMs;
          }

          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          for (const slotState of tick.slots) {
            if (slotState.slotIndex === localSlot) continue;
            const r = racers[slotState.slotIndex];
            if (!r) continue;

            const peerEntry = tick.peers?.find(
              (p) => p.slotIndex === slotState.slotIndex
            );
            const effectivePeerId =
              peerEntry?.peerId ?? slotState.ownerPeerId ?? null;
            const isOwnedByUs =
              Boolean(mp.peerId) &&
              effectivePeerId === mp.peerId &&
              (slotState.controlMode === "HUMAN" || Boolean(peerEntry));

            const effectiveControlMode = isOwnedByUs
              ? "LOCAL_HUMAN"
              : slotState.controlMode === "HUMAN" || Boolean(peerEntry)
              ? "REMOTE_HUMAN"
              : "AI";
            const effectiveName =
              peerEntry?.playerName || slotState.playerName || r.name;
            const effectiveCharId =
              peerEntry?.characterId || slotState.characterId;
            const effectiveKartId = peerEntry?.kartId || slotState.kartId;

            if (isOwnedByUs && r.controlMode !== "LOCAL_HUMAN") {
              r.applyNetState(
                {
                  ...slotState,
                  playerName: effectiveName,
                  controlMode: "HUMAN",
                  ownerPeerId: mp.peerId,
                },
                true
              );
              const syncedStats = resolveRacerStats(
                effectiveCharId,
                effectiveKartId
              );
              r.swapRacerIdentity({
                newStats: syncedStats,
                newDisplayName: effectiveName,
                newControlMode: "LOCAL_HUMAN",
                ownerPeerId: mp.peerId,
              });
              prepareAssumedAiKartInPlace(r);
              spectateAutoDirectorRef.current = false;
              spectateSlotIndexRef.current = r.slotIndex;
              mp.localSlotIndex = r.slotIndex;
              continue;
            }

            // Always sync identity, player name, and human/AI status for all remote slots
            if (
              r.stats.character.id !== effectiveCharId ||
              r.stats.kart.id !== effectiveKartId ||
              r.name !== effectiveName ||
              r.controlMode !== effectiveControlMode
            ) {
              const syncedStats = resolveRacerStats(
                effectiveCharId,
                effectiveKartId
              );
              r.swapRacerIdentity({
                newStats: syncedStats,
                newDisplayName: effectiveName,
                newControlMode: effectiveControlMode,
                ownerPeerId: effectivePeerId,
              });
            }

            // Apply kinematic state from Host for AI slots, Host's own slot, or any remote slot
            if (
              effectiveControlMode === "AI" ||
              effectivePeerId === tick.senderId ||
              slotState.ownerPeerId === tick.senderId
            ) {
              r.applyNetState(
                {
                  ...slotState,
                  playerName: effectiveName,
                  controlMode: effectiveControlMode === "AI" ? "AI" : "HUMAN",
                  ownerPeerId: effectivePeerId,
                },
                false
              );
            }
          }
        },
        onClientKartTick: (slotState, senderId) => {
          readyPeerIds.add(senderId);
          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          if (slotState.slotIndex === localSlot) return;
          const r = racers[slotState.slotIndex];
          if (!r) return;
          if (
            r.stats.character.id !== slotState.characterId ||
            r.stats.kart.id !== slotState.kartId ||
            r.name !== slotState.playerName ||
            r.controlMode !== "REMOTE_HUMAN"
          ) {
            const syncedStats = resolveRacerStats(
              slotState.characterId,
              slotState.kartId
            );
            r.swapRacerIdentity({
              newStats: syncedStats,
              newDisplayName: slotState.playerName,
              newControlMode: "REMOTE_HUMAN",
              ownerPeerId: senderId,
            });
          }
          r.applyNetState(
            {
              ...slotState,
              controlMode: "HUMAN",
              ownerPeerId: senderId,
            },
            false
          );
        },
        onCollisionImpulse: (payload) => {
          const localKart = getLocalPlayerKart();
          if (localKart && payload.targetSlotIndex === localKart.slotIndex) {
            localKart.applyNetworkCollisionImpulse(payload);
            lastCollisionReportRef.current = payload.report;
            if (payload.report.isJuggernautOverride) {
              collisionBanner = `JUGGERNAUT IMPACT: ${payload.report.heavyName} (${payload.report.heavyMass}kg) launched ${payload.report.lightName} (${payload.report.lightMass}kg)!`;
              collisionBannerTimer = 3.0;
            }
          }
        },
        onItemActivate: (payload) => {
          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          const caster = racers[payload.slotIndex];
          if (caster && caster.slotIndex !== localSlot) {
            itemManager.activatePowerUp(
              caster,
              payload.item,
              racers,
              pushItemBanner
            );
          }
        },
        onItemBoxPickup: (payload) => {
          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          const collector = racers[payload.slotIndex];
          if (collector && collector.slotIndex !== localSlot) {
            itemManager.applyNetworkBoxPickup(
              payload.boxId,
              collector,
              payload.awardedItem
            );
          }
        },
        onPeerLeave: (peerId, slotIndex) => {
          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          const r =
            racers.find((k) => k.ownerPeerId === peerId) ??
            (slotIndex >= 0 ? racers[slotIndex] : undefined);
          if (r && r.slotIndex !== localSlot) {
            const prevName = r.name;
            r.controlMode = "AI";
            r.isPlayer = false;
            r.ownerPeerId = null;
            r.name = r.stats.character.name;
            r.assembly.updateNameplate(r.name, false);
            pushItemBanner(
              `${prevName} disconnected — AI Bot took over Slot #${r.slotIndex + 1}!`
            );
          }
        },
        onHostMigrated: (info) => {
          const localSlot = getLocalPlayerKart()?.slotIndex ?? -1;
          const oldHostKart =
            info.oldHostSlotIndex >= 0 ? racers[info.oldHostSlotIndex] : null;
          if (oldHostKart && oldHostKart.slotIndex !== localSlot) {
            oldHostKart.controlMode = "AI";
            oldHostKart.isPlayer = false;
            oldHostKart.ownerPeerId = null;
            oldHostKart.name = oldHostKart.stats.character.name;
            oldHostKart.assembly.updateNameplate(oldHostKart.name, false);
          }
          pushItemBanner(
            info.oldHostSlotIndex >= 0
              ? `HOST MIGRATED: ${info.newHostName} is now Host (Slot #${info.oldHostSlotIndex + 1} -> AI Bot)!`
              : `HOST MIGRATED: ${info.newHostName} is now Host!`
          );
        },
      });
    }

    // Keyboard listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const code = e.code;

      // Spectator camera hotkeys when in Dedicated / Spectator Mode
      if (!getLocalPlayerKart()) {
        if (code === "Digit1") {
          spectateAutoDirectorRef.current = false;
          spectateSlotIndexRef.current = 0;
        } else if (code === "Digit2") {
          spectateAutoDirectorRef.current = false;
          spectateSlotIndexRef.current = 1;
        } else if (code === "Digit3") {
          spectateAutoDirectorRef.current = false;
          spectateSlotIndexRef.current = 2;
        } else if (code === "Digit4") {
          spectateAutoDirectorRef.current = false;
          spectateSlotIndexRef.current = 3;
        } else if (code === "Tab") {
          e.preventDefault();
          spectateAutoDirectorRef.current = false;
          spectateSlotIndexRef.current =
            (spectateSlotIndexRef.current + 1) % 4;
        }
      }

      if (code === "KeyW" || code === "ArrowUp") keyboardStateRef.current.up = true;
      if (code === "KeyS" || code === "ArrowDown") keyboardStateRef.current.down = true;
      if (code === "KeyA" || code === "ArrowLeft") keyboardStateRef.current.left = true;
      if (code === "KeyD" || code === "ArrowRight") keyboardStateRef.current.right = true;
      if (code === "ShiftLeft" || code === "ShiftRight" || code === "Space") {
        e.preventDefault();
        if (code === "Space") {
          keyboardStateRef.current.spaceHeld = true;
        } else {
          keyboardStateRef.current.shiftHeld = true;
        }
        pendingEdgesRef.current.hopJustPressed = true;
        keyboardStateRef.current.driftHeld =
          keyboardStateRef.current.shiftHeld ||
          keyboardStateRef.current.spaceHeld;
      }
      if (code === "KeyE" || code === "Enter") {
        e.preventDefault();
        pendingEdgesRef.current.useItemJustPressed = true;
      }
      if (code === "KeyF") {
        e.preventDefault();
        pendingEdgesRef.current.itemAimOverride = 1;
        pendingEdgesRef.current.useItemJustPressed = true;
      }
      if (code === "KeyQ") {
        e.preventDefault();
        pendingEdgesRef.current.itemAimOverride = -1;
        pendingEdgesRef.current.useItemJustPressed = true;
      }
      if (code === "KeyC") {
        cycleCameraMode();
      }
      if (code === "KeyM") {
        toggleMusicMute();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === "KeyW" || code === "ArrowUp") keyboardStateRef.current.up = false;
      if (code === "KeyS" || code === "ArrowDown") keyboardStateRef.current.down = false;
      if (code === "KeyA" || code === "ArrowLeft") keyboardStateRef.current.left = false;
      if (code === "KeyD" || code === "ArrowRight") keyboardStateRef.current.right = false;
      if (code === "ShiftLeft" || code === "ShiftRight" || code === "Space") {
        if (code === "Space") {
          keyboardStateRef.current.spaceHeld = false;
        } else {
          keyboardStateRef.current.shiftHeld = false;
        }
        keyboardStateRef.current.driftHeld =
          keyboardStateRef.current.shiftHeld ||
          keyboardStateRef.current.spaceHeld;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Expose deterministic diagnostic & browser verification API
    window.__GUTSY_KARTS_DEBUG__ = {
      getState: () => {
        const refKart = getFocusKart(racers);
        return {
          telemetry: telemetryRef.current,
          player: {
            name: refKart.name,
            slotIndex: refKart.slotIndex,
            controlMode: refKart.controlMode,
            mass: refKart.stats.baseMass,
            effectiveMass: refKart.effectiveMass,
            speed: Number(refKart.forwardSpeed.toFixed(2)),
            lateralSpeed: Number(refKart.lateralSpeed.toFixed(2)),
            maxSpeed: refKart.stats.topSpeed,
            surface: refKart.surface,
            distToCenter: Number(refKart.distToCenter.toFixed(2)),
            grounded: refKart.grounded,
            verticalVelocity: Number(refKart.verticalVelocity.toFixed(2)),
            driftState: refKart.driftState,
            driftDirection: refKart.driftDirection,
            driftChargeSeconds: Number(refKart.driftChargeSeconds.toFixed(2)),
            driftChargeSubState: refKart.driftChargeSubState,
            miniTurboTier: refKart.miniTurboTier,
            prolongedRocketBoostActive: refKart.prolongedRocketBoostActive,
            heldItem: refKart.heldItem,
            novaOverdriveTimer: Number(refKart.novaOverdriveTimer.toFixed(2)),
            nitroBoostTimer: Number(refKart.nitroBoostTimer.toFixed(2)),
          },
          lastCollision: lastCollisionReportRef.current,
        };
      },
      teleportPlayerToOffRoad: () => {
        const refKart = getFocusKart(racers);
        countdownRemaining = 0;
        racePhase = "RACING";
        const sample = track.samples[12];
        refKart.position = sample.position
          .add(sample.binormal.scale(19.5))
          .add(new Vector3(0, 0.12, 0));
        refKart.headingYaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        refKart.forwardSpeed = refKart.stats.topSpeed * 0.95;
        refKart.lateralSpeed = 0;
        refKart.velocity = refKart.forwardVector.scale(refKart.forwardSpeed);
        refKart.nitroBoostTimer = 0;
        refKart.novaOverdriveTimer = 0;
        refKart.boostTimer = 0;
        refKart.prolongedRocketBoostActive = false;
      },
      teleportPlayerToPavement: () => {
        const refKart = getFocusKart(racers);
        countdownRemaining = 0;
        racePhase = "RACING";
        const sample = track.samples[4];
        refKart.position = sample.position.add(new Vector3(0, 0.12, 0));
        refKart.headingYaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        refKart.forwardSpeed = refKart.stats.topSpeed;
        refKart.lateralSpeed = 0;
        refKart.velocity = refKart.forwardVector.scale(refKart.forwardSpeed);
      },
      simulateHopDriftCharge: (chargeSec: number, dir: -1 | 1 = 1) => {
        const refKart = getFocusKart(racers);
        countdownRemaining = 0;
        racePhase = "RACING";
        refKart.forwardSpeed = refKart.stats.topSpeed * 0.92;
        refKart.lateralSpeed = 0;
        refKart.velocity = refKart.forwardVector.scale(refKart.forwardSpeed);
        refKart.grounded = true;
        refKart.driftDirection = dir;
        refKart.driftState = "DRIFT_ACTIVE";
        refKart.driftChargeSeconds = chargeSec;
        refKart.driftChargeSubState =
          chargeSec >= 1.0 ? 4 : chargeSec >= 0.45 ? 2 : 0;
        refKart.miniTurboTier =
          chargeSec >= 3.6 ? 3 : chargeSec >= 2.2 ? 2 : chargeSec >= 1.0 ? 1 : 0;
        touchStateRef.current.driftHeld = true;
        touchStateRef.current.steer = dir;
        touchStateRef.current.throttle = 1.0;
      },
      simulateManualDriftPumps: (cycles: 1 | 2, dir: -1 | 1 = 1) => {
        const refKart = getFocusKart(racers);
        countdownRemaining = 0;
        racePhase = "RACING";
        refKart.forwardSpeed = refKart.stats.topSpeed * 0.95;
        refKart.lateralSpeed = 0;
        refKart.velocity = refKart.forwardVector.scale(refKart.forwardSpeed);
        refKart.grounded = true;
        refKart.driftDirection = dir;
        refKart.driftState = "DRIFT_ACTIVE";
        refKart.driftChargeSeconds = 0.25;
        refKart.driftChargeSubState = cycles === 2 ? 4 : 2;
        refKart.miniTurboTier = 1;
        touchStateRef.current.driftHeld = true;
        touchStateRef.current.steer = dir;
        touchStateRef.current.throttle = 1.0;
      },
      releaseDriftNow: () => {
        touchStateRef.current.driftHeld = false;
        keyboardStateRef.current.shiftHeld = false;
        keyboardStateRef.current.spaceHeld = false;
        keyboardStateRef.current.driftHeld = false;
      },
      simulateJuggernautCollision: () => {
        countdownRemaining = 0;
        racePhase = "RACING";
        const rexKart =
          racers.find((r) => r.stats.character.id === "rex_ironclad") ?? racers[1];
        const pipKart =
          racers.find((r) => r.stats.character.id === "pip_spark") ?? racers[0];

        const sample = track.samples[18];
        const forward = sample.tangent.clone().normalize();
        rexKart.position = sample.position.add(new Vector3(0, 0.1, 0));
        rexKart.headingYaw = Math.atan2(forward.x, forward.z);
        rexKart.forwardSpeed = 32;
        rexKart.velocity = forward.scale(32);
        rexKart.collisionCooldown = 0;

        pipKart.position = rexKart.position.subtract(forward.scale(2.1));
        pipKart.headingYaw = rexKart.headingYaw;
        pipKart.forwardSpeed = 55;
        pipKart.velocity = forward.scale(55);
        pipKart.collisionCooldown = 0;

        const report = resolveAsymmetricKartCollision(pipKart, rexKart);
        if (report) {
          lastCollisionReportRef.current = report;
          collisionBanner = `JUGGERNAUT LAW: ${report.heavyName} (${report.heavyMass}kg, Δv ${report.heavySpeedDeltaPct}%) bounced ${report.lightName} (${report.lightMass}kg, α=${(report.alphaLight * 100).toFixed(1)}%)!`;
          collisionBannerTimer = 4.0;
        }
        return report;
      },
      grantPlayerPowerUp: (item: PowerUpType) => {
        const refKart = getFocusKart(racers);
        if (
          item === "LIL_SAUCER" &&
          !itemManager.canRacerAcquireLilSaucer(refKart, racers)
        ) {
          pushItemBanner(
            "Lil' Saucer UFO requires trailing behind at least one racer (Not in 1st Place)!"
          );
          return;
        }
        refKart.equipPowerUpImmediate(item);
      },
      triggerPlayerPowerUp: () => {
        pendingEdgesRef.current.useItemJustPressed = true;
      },
      simulateMidRaceHotJoinTakeover: (
        joinerName: string,
        characterId: string,
        kartId: string
      ) => {
        const aiTarget = selectNonFirstPlaceAiSlot();
        if (!aiTarget) return null;
        const newStats = resolveRacerStats(characterId, kartId);
        aiTarget.swapRacerIdentity({
          newStats,
          newDisplayName: joinerName,
          newControlMode: "REMOTE_HUMAN",
          ownerPeerId: `sim_${joinerName}`,
        });
        prepareAssumedAiKartInPlace(aiTarget);
        pushItemBanner(
          `${joinerName} assumed AI Racer in Slot #${aiTarget.slotIndex + 1} (Lap ${aiTarget.lap})!`
        );
        return {
          replacedSlotIndex: aiTarget.slotIndex,
          inheritedLap: aiTarget.lap,
          inheritedProgress: Number(aiTarget.totalProgressDistance.toFixed(1)),
          newCharacterId: aiTarget.stats.character.id,
          newKartId: aiTarget.stats.kart.id,
          newMass: aiTarget.stats.baseMass,
        };
      },
    };

    const stepSimulationFrame = (overrideDt?: number) => {
      lastSimStepPerfTime = performance.now();
      // Clamped delta time per AGENTS.md invariant: dt = Math.min(engine.getDeltaTime() / 1000, 0.05)
      const dt =
        overrideDt !== undefined
          ? Math.min(overrideDt, PHYSICS_CONSTANTS.MAX_DT)
          : Math.min(engine.getDeltaTime() / 1000, PHYSICS_CONSTANTS.MAX_DT);

      if (racePhase === "COUNTDOWN") {
        let waitingForRemotePeers = false;
        if (mp && mp.isHost && mp.activeRoomId) {
          const remotePeers = mp.roomPeers.filter(
            (p) => p.peerId !== mp.peerId
          );
          if (remotePeers.length > 0 && countdownReadyWaitSec < 8.0) {
            const allRemoteReady = remotePeers.every((p) =>
              readyPeerIds.has(p.peerId)
            );
            if (!allRemoteReady) {
              waitingForRemotePeers = true;
              countdownReadyWaitSec += dt;
            }
          }
        }
        if (!waitingForRemotePeers) {
          countdownRemaining -= dt;
          if (countdownRemaining <= 0) {
            countdownRemaining = 0;
            racePhase = "RACING";
          }
        }
      } else if (
        racePhase === "RACING" ||
        (racePhase === "FINISHED" && racers.some((r) => !r.finished))
      ) {
        elapsedRaceMs += dt * 1000;
      }

      if (collisionBannerTimer > 0) {
        collisionBannerTimer = Math.max(0, collisionBannerTimer - dt);
        if (collisionBannerTimer === 0) collisionBanner = null;
      }
      if (itemBannerTimer > 0) {
        itemBannerTimer = Math.max(0, itemBannerTimer - dt);
        if (itemBannerTimer === 0) itemBanner = null;
      }

      const localPlayerKart = getLocalPlayerKart();

      // Build combined Keyboard + Mobile Virtual Joystick input for Local Player (if driving)
      const kb = keyboardStateRef.current;
      const tc = touchStateRef.current;
      const kbSteer = (kb.right ? 1 : 0) - (kb.left ? 1 : 0);
      const combinedSteer =
        Math.abs(tc.steer) > 0.05 ? tc.steer : kbSteer;
      const combinedThrottle = Math.max(kb.up ? 1 : 0, tc.throttle);
      const combinedBrake = Math.max(
        kb.down ? 1 : 0,
        tc.brake,
        tc.brakeButtonHeld ? 1 : 0
      );
      const combinedDriftHeld = kb.driftHeld || tc.driftHeld;

      const itemsActiveForRace =
        Boolean(mp?.activeRoomId) || globalAiBrain.areItemsEnabled();
      const activeBoxes = itemsActiveForRace
        ? itemManager.getActiveItemBoxPositions()
        : [];

      const resolvedItemAimDir: -1 | 0 | 1 =
        pendingEdgesRef.current.itemAimOverride !== 0
          ? pendingEdgesRef.current.itemAimOverride
          : kb.down || tc.brake > 0.3 || tc.brakeButtonHeld
          ? -1
          : kb.up || tc.throttle > 0.3
          ? 1
          : 0;

      const playerInput: ControlInputState = localPlayerKart
        ? {
            throttle: localPlayerKart.finished ? 0.85 : combinedThrottle,
            brake: localPlayerKart.finished ? 0 : combinedBrake,
            steer: localPlayerKart.finished
              ? localPlayerKart.computeAiInputs(dt, activeBoxes, racers).steer
              : combinedSteer,
            driftHeld: localPlayerKart.finished ? false : combinedDriftHeld,
            hopJustPressed: pendingEdgesRef.current.hopJustPressed,
            useItemJustPressed: pendingEdgesRef.current.useItemJustPressed,
            itemAimDirection: resolvedItemAimDir,
          }
        : {
            throttle: 0,
            brake: 0,
            steer: 0,
            driftHeld: false,
            hopJustPressed: false,
            useItemJustPressed: false,
            itemAimDirection: 0,
          };

      // Clear one-shot rising edges
      pendingEdgesRef.current.hopJustPressed = false;
      pendingEdgesRef.current.useItemJustPressed = false;
      pendingEdgesRef.current.itemAimOverride = 0;

      const raceActive = racePhase !== "COUNTDOWN";
      const isOnlineSession = Boolean(mp?.activeRoomId);
      const isLocalHost = !isOnlineSession || Boolean(mp?.isHost);

      // Reference progress for AI rubber-banding: either local player or leading human/racer
      const rubberBandRefProgress =
        localPlayerKart?.totalProgressDistance ??
        Math.max(...racers.map((r) => r.totalProgressDistance));

      // Step all 4 karts according to their controlMode & authority
      for (const racer of racers) {
        racer.aiDifficulty = aiDifficultyRef.current;

        if (racer.controlMode === "LOCAL_HUMAN") {
          const input = !racer.finished
            ? playerInput
            : racer.computeAiInputs(dt, activeBoxes, racers);

          racer.update(
            dt,
            input,
            raceActive,
            elapsedRaceMs,
            TOTAL_LAPS,
            (caster, item) => {
              itemManager.activatePowerUp(caster, item, racers, pushItemBanner);
              if (isOnlineSession) {
                mp?.broadcastItemActivate({
                  slotIndex: caster.slotIndex,
                  item,
                });
              }
            },
            rubberBandRefProgress
          );
        } else if (racer.controlMode === "AI" && isLocalHost) {
          // Host (Single-Player, Normal Host, or Dedicated Server) runs full 60Hz AI thinking & physics
          const aiInput = racer.computeAiInputs(dt, activeBoxes, racers);
          racer.update(
            dt,
            aiInput,
            raceActive,
            elapsedRaceMs,
            TOTAL_LAPS,
            (caster, item) => {
              itemManager.activatePowerUp(caster, item, racers, pushItemBanner);
              if (isOnlineSession) {
                mp?.broadcastItemActivate({
                  slotIndex: caster.slotIndex,
                  item,
                });
              }
            },
            rubberBandRefProgress
          );
        } else {
          // Remote Human kart OR Client-replicated AI slot: 60Hz dead-reckoning + smooth interpolation
          racer.updateRemoteInterpolation(dt, elapsedRaceMs, TOTAL_LAPS);
        }
      }

      // Step Item Boxes, Orbiting Drones (Shield & Tri-Seeker), Homing Pulse Seekers, Ricochet Discs, and Cryo Mines
      // (Runs BEFORE resolveAsymmetricKartCollision so orbiting drones intercept & wipe out rival karts on contact!)
      if (itemsActiveForRace) {
        itemManager.update(
          dt,
          racers,
          pushItemBanner,
          (boxId, collector, awardedItem) => {
            if (
              isOnlineSession &&
              (collector.isPlayer ||
                (isLocalHost && collector.controlMode === "AI"))
            ) {
              mp?.broadcastItemBoxPickup({
                boxId,
                slotIndex: collector.slotIndex,
                awardedItem,
              });
            }
          }
        );
      }

      // Step Asymmetric Mass Collision Resolver between all pairs of karts
      if (raceActive) {
        for (let i = 0; i < racers.length; i++) {
          for (let j = i + 1; j < racers.length; j++) {
            const report = resolveAsymmetricKartCollision(racers[i], racers[j]);
            if (report) {
              lastCollisionReportRef.current = report;
              globalAiBrain.recordCollision(report);
              if (
                report.isJuggernautOverride &&
                (racers[i].isPlayer ||
                  racers[j].isPlayer ||
                  !localPlayerKart)
              ) {
                collisionBanner = `JUGGERNAUT IMPACT: ${report.heavyName} (${report.heavyMass}kg) launched ${report.lightName} (${report.lightMass}kg)!`;
                collisionBannerTimer = 3.0;
              }

              // Broadcast authoritative collision impulse when local player or Host-controlled AI collides with a remote kart
              if (isOnlineSession) {
                const lightKart =
                  racers[i].racerId === report.lightRacerId
                    ? racers[i]
                    : racers[j];
                const heavyKart =
                  lightKart === racers[i] ? racers[j] : racers[i];

                const weHaveAuthority =
                  racers[i].isPlayer ||
                  racers[j].isPlayer ||
                  (isLocalHost &&
                    (racers[i].controlMode === "AI" ||
                      racers[j].controlMode === "AI"));

                if (
                  weHaveAuthority &&
                  lightKart.controlMode === "REMOTE_HUMAN"
                ) {
                  mp?.broadcastCollisionImpulse({
                    targetSlotIndex: lightKart.slotIndex,
                    heavySlotIndex: heavyKart.slotIndex,
                    kx: lightKart.knockVelocity.x,
                    kz: lightKart.knockVelocity.z,
                    vx: lightKart.velocity.x,
                    vz: lightKart.velocity.z,
                    forwardSpeed: lightKart.forwardSpeed,
                    verticalVelocity: lightKart.verticalVelocity,
                    wobbleTimer: lightKart.wobbleTimer,
                    report,
                  });
                }
              }
            }
          }
        }
      }

      // Compute Live Race Standings (1st - 4th)
      const sorted = [...racers].sort((a, b) => {
        if (a.finished && b.finished) {
          return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
        }
        if (a.finished !== b.finished) {
          return a.finished ? -1 : 1;
        }
        return b.totalProgressDistance - a.totalProgressDistance;
      });

      sorted.forEach((racer, idx) => {
        racer.rank = idx + 1;
      });

      if (firstFinisherTimeMs === null && sorted[0]?.finished) {
        firstFinisherTimeMs = elapsedRaceMs;
      }

      const focusKart = getFocusKart(sorted);

      // 25Hz Network Tick Broadcast (every 40ms) when in an Online Room
      const now = performance.now();
      if (isOnlineSession && mp && now - lastNetTickTime >= 40) {
        lastNetTickTime = now;
        if (mp.isHost) {
          mp.broadcastHostWorldTick({
            racePhase,
            countdownRemaining,
            elapsedRaceMs,
            slots: racers.map((r) => r.exportNetState()),
          });
        } else if (localPlayerKart) {
          mp.broadcastClientKartTick(localPlayerKart.exportNetState());
        }
      }

      // Update Hosted Lobby Room Summary (or send Client Spectator Heartbeat) every 900ms
      if (isOnlineSession && mp && now - lastLobbySummaryTime >= 900) {
        lastLobbySummaryTime = now;
        if (mp.isHost) {
          const aiCount = racers.filter((r) => r.controlMode === "AI").length;
          const humanCount = 4 - aiCount;
          const leaderLap = Math.min(TOTAL_LAPS, sorted[0]?.lap ?? 1);
          mp.updateHostedRoomSummary({
            cupId: selectedCupId,
            trackIdx: selectedTrackIdx,
            trackName: effectiveTrackDef.name,
            racePhase,
            currentLap: leaderLap,
            totalLaps: TOTAL_LAPS,
            humanCount,
            maxSlots: 4,
            aiSlotCount: aiCount,
            aiDifficulty: aiDifficultyRef.current,
            slotSummaries: racers.map((r) => ({
              slotIndex: r.slotIndex,
              isHuman: r.controlMode !== "AI",
              playerName: r.name,
              characterId: r.stats.character.id,
              kartId: r.stats.kart.id,
            })),
          });
        } else if (!localPlayerKart) {
          // Keep spectating client presence fresh on the Host until they click to assume an AI racer
          mp.broadcastClientReady(-1);
        }
      }

      // Determine Race Completion (Normal Player Mode vs Dedicated / Spectator Mode)
      let shouldFinishRace = false;
      if (racePhase === "RACING") {
        if (localPlayerKart) {
          shouldFinishRace = localPlayerKart.finished;
        } else {
          // Dedicated Server / Spectator Mode: finish when all connected human racers finish (or 20s after leader finishes), or when leader finishes if 4 AI
          const humanRacers = racers.filter((r) => r.controlMode !== "AI");
          if (humanRacers.length > 0) {
            shouldFinishRace =
              humanRacers.every((r) => r.finished) ||
              (firstFinisherTimeMs !== null &&
                elapsedRaceMs - firstFinisherTimeMs >= 20000);
          } else {
            shouldFinishRace = Boolean(sorted[0]?.finished);
          }
        }
      }

      if (localPlayerKart) {
        const liveCallsign =
          playerCallsignRef.current.trim() || mp?.playerName;
        if (liveCallsign && localPlayerKart.name !== liveCallsign) {
          localPlayerKart.name = liveCallsign;
        }
      }

      if (shouldFinishRace && racePhase === "RACING") {
        racePhase = "FINISHED";
        postRaceAutoAdvanceTimer = 10.0;
      }

      const resolveRacerTimingSnapshots = (orderedRacers: KartController[]) => {
        const snapshots: Record<
          string,
          {
            finishTimeMs: number;
            lapTimesMs: number[];
            isProjectedTime: boolean;
          }
        > = {};

        let prevFinishTimeMs = Math.max(1000, elapsedRaceMs);

        for (const r of orderedRacers) {
          const completedLaps = r.lapTimesMs.filter(
            (ms: number) => Number.isFinite(ms) && ms > 500
          );
          if (r.finished && r.finishTimeMs !== null && completedLaps.length >= TOTAL_LAPS) {
            const officialLaps = completedLaps.slice(0, TOTAL_LAPS);
            const officialTotal = r.finishTimeMs;
            prevFinishTimeMs = Math.max(prevFinishTimeMs, officialTotal);
            snapshots[r.racerId] = {
              finishTimeMs: officialTotal,
              lapTimesMs: officialLaps,
              isProjectedTime: false,
            };
            continue;
          }

          // Project remaining lap(s) and total finish time from live pace and spline progress
          const coveredDist = Math.max(40, r.totalProgressDistance);
          const avgLapMs =
            completedLaps.length > 0
              ? completedLaps.reduce((a: number, b: number) => a + b, 0) /
                completedLaps.length
              : Math.max(
                  14000,
                  elapsedRaceMs /
                    Math.max(0.25, coveredDist / track.totalTrackLength)
                );

          const completedSum = completedLaps.reduce(
            (a: number, b: number) => a + b,
            0
          );
          const currentLapFrac = Math.max(
            0.05,
            Math.min(0.99, r.closestTrack.normalizedSplineT)
          );
          const elapsedInCurrentLap = Math.max(250, elapsedRaceMs - r.lapStartElapsedMs);
          const liveLapEstimate = Math.max(
            elapsedInCurrentLap + 350,
            Math.min(avgLapMs * 1.32, elapsedInCurrentLap / currentLapFrac)
          );

          const projectedLaps = [...completedLaps];
          while (projectedLaps.length < TOTAL_LAPS) {
            if (projectedLaps.length === completedLaps.length) {
              projectedLaps.push(Math.round(liveLapEstimate));
            } else {
              projectedLaps.push(Math.round(avgLapMs));
            }
          }

          const rawProjectedTotal = projectedLaps.reduce(
            (a: number, b: number) => a + b,
            0
          );
          const minRankTotal = prevFinishTimeMs + 320 + r.rank * 90;
          const finalTotal = Math.max(
            Math.round(rawProjectedTotal),
            Math.round(completedSum + elapsedInCurrentLap + 350),
            Math.round(minRankTotal)
          );

          // Adjust the final lap split so that the 3 lap splits sum cleanly to finalTotal
          const firstTwoSum = projectedLaps
            .slice(0, TOTAL_LAPS - 1)
            .reduce((a: number, b: number) => a + b, 0);
          projectedLaps[TOTAL_LAPS - 1] = Math.max(
            1000,
            finalTotal - firstTwoSum
          );

          prevFinishTimeMs = finalTotal;
          snapshots[r.racerId] = {
            finishTimeMs: finalTotal,
            lapTimesMs: projectedLaps.slice(0, TOTAL_LAPS),
            isProjectedTime: true,
          };
        }

        return snapshots;
      };

      const finishedCountNow = sorted.filter((r) => r.finished).length;

      if (
        racePhase === "FINISHED" &&
        (!cupPointsAwardedForRace || finishedCountNow !== lastRecordedFinishCount)
      ) {
        const isFirstFinishPass = !cupPointsAwardedForRace;
        cupPointsAwardedForRace = true;
        lastRecordedFinishCount = finishedCountNow;

        const timingSnapshots = resolveRacerTimingSnapshots(sorted);

        if (isFirstFinishPass) {
          const finishRanksByRacerId: Record<string, number> = {};
          const lapSplitsByRacerId: Record<string, number[]> = {};
          for (const r of sorted) {
            finishRanksByRacerId[r.racerId] = r.rank;
            const snap = timingSnapshots[r.racerId];
            if (snap) {
              lapSplitsByRacerId[r.racerId] = snap.lapTimesMs;
            }
          }
          globalAiBrain.evolveGenerationFromEpisode(
            aiDifficultyRef.current,
            finishRanksByRacerId,
            lapSplitsByRacerId
          );
          if (autoRepeatTrainingRef.current && !mp?.activeRoomId) {
            postRaceAutoAdvanceTimer = 1.6;
          }
        }

        // Persist and update per-track & per-racer timing records
        const prevTrackRec = trackRecordsRef.current[trackRecordKey];
        const nextRacerRecords: Record<string, RacerTrackTimeRecord> = {
          ...(prevTrackRec?.racerRecords ?? {}),
        };

        let nextBestRaceTimeMs = prevTrackRec?.bestRaceTimeMs ?? null;
        let nextBestRaceHolderName = prevTrackRec?.bestRaceHolderName ?? null;
        let nextBestRaceKartName = prevTrackRec?.bestRaceKartName ?? null;

        let nextBestLapTimeMs = prevTrackRec?.bestLapTimeMs ?? null;
        let nextBestLapHolderName = prevTrackRec?.bestLapHolderName ?? null;
        let nextBestLapKartName = prevTrackRec?.bestLapKartName ?? null;

        for (const r of sorted) {
          const snap = timingSnapshots[r.racerId];
          if (!snap) continue;
          const charId = r.stats.character.id;
          const validLaps = snap.lapTimesMs.filter((ms: number) => ms > 500);
          const racerBestLap =
            validLaps.length > 0 ? Math.min(...validLaps) : null;

          if (
            nextBestRaceTimeMs === null ||
            snap.finishTimeMs < nextBestRaceTimeMs
          ) {
            nextBestRaceTimeMs = snap.finishTimeMs;
            nextBestRaceHolderName = r.name;
            nextBestRaceKartName = r.stats.kart.name;
          }

          if (
            racerBestLap !== null &&
            (nextBestLapTimeMs === null || racerBestLap < nextBestLapTimeMs)
          ) {
            nextBestLapTimeMs = racerBestLap;
            nextBestLapHolderName = r.name;
            nextBestLapKartName = r.stats.kart.name;
          }

          const existingRacerRec = nextRacerRecords[charId];
          const isFasterRace =
            existingRacerRec?.bestRaceTimeMs == null ||
            snap.finishTimeMs < existingRacerRec.bestRaceTimeMs;
          const updatedBestRace = isFasterRace
            ? snap.finishTimeMs
            : existingRacerRec.bestRaceTimeMs;
          const updatedBestLap =
            racerBestLap !== null
              ? existingRacerRec?.bestLapTimeMs != null
                ? Math.min(existingRacerRec.bestLapTimeMs, racerBestLap)
                : racerBestLap
              : existingRacerRec?.bestLapTimeMs ?? null;

          nextRacerRecords[charId] = {
            characterId: charId,
            racerName: r.name,
            kartName: r.stats.kart.name,
            bestRaceTimeMs: updatedBestRace,
            bestLapTimeMs: updatedBestLap,
            bestLapSplitsMs: isFasterRace
              ? [...snap.lapTimesMs]
              : existingRacerRec?.bestLapSplitsMs ?? [...snap.lapTimesMs],
            updatedAt: Date.now(),
          };
        }

        if (nextBestRaceTimeMs !== null && nextBestLapTimeMs !== null) {
          const nextRecordObj: TrackTimingRecord = {
            trackId: trackRecordKey,
            trackName: effectiveTrackDef.name,
            bestRaceTimeMs: nextBestRaceTimeMs,
            bestRaceHolderName: nextBestRaceHolderName,
            bestRaceKartName: nextBestRaceKartName,
            bestLapTimeMs: nextBestLapTimeMs,
            bestLapHolderName: nextBestLapHolderName,
            bestLapKartName: nextBestLapKartName,
            racerRecords: nextRacerRecords,
          };
          const updatedAllRecords = {
            ...trackRecordsRef.current,
            [trackRecordKey]: nextRecordObj,
          };
          trackRecordsRef.current = updatedAllRecords;
          setTrackRecords(updatedAllRecords);
          saveTrackRecords(updatedAllRecords);
        }

        // Award Grand Prix Cup points by slot once per race: 1st = 4 pts, 2nd = 3 pts, 3rd = 2 pts, 4th = 1 pt
        const updatedStandings: CupStandingEntry[] = sorted
          .map((r): CupStandingEntry => {
            const slotKey = `slot_${r.slotIndex}`;
            const charId = r.stats.character.id;
            if (isFirstFinishPass) {
              const racePts = Math.max(1, 5 - r.rank);
              const prevPts = cupPointsByCharRef.current[slotKey] ?? 0;
              const nextTotal = prevPts + racePts;
              cupPointsByCharRef.current[slotKey] = nextTotal;
              racePointsBySlot[slotKey] = racePts;
            }
            const racePts = racePointsBySlot[slotKey] ?? Math.max(1, 5 - r.rank);
            const totalPts = cupPointsByCharRef.current[slotKey] ?? racePts;
            const snap = timingSnapshots[r.racerId];
            const validLaps = snap.lapTimesMs.filter((ms: number) => ms > 500);
            const bestLapMs =
              validLaps.length > 0 ? Math.min(...validLaps) : null;

            const isNewBestRace =
              snap.finishTimeMs === nextBestRaceTimeMs &&
              (baselineBestRaceMs === null || snap.finishTimeMs < baselineBestRaceMs);
            const isNewBestLap =
              bestLapMs !== null &&
              bestLapMs === nextBestLapTimeMs &&
              (baselineBestLapMs === null || bestLapMs < baselineBestLapMs);

            return {
              racerId: r.racerId,
              characterId: charId,
              characterName: r.stats.character.name,
              name: r.name,
              kartName: r.stats.kart.name,
              isPlayer: r.isPlayer,
              isRemoteHuman: r.controlMode === "REMOTE_HUMAN",
              slotIndex: r.slotIndex,
              controllerLabel:
                r.controlMode === "LOCAL_HUMAN"
                  ? "YOU"
                  : r.controlMode === "REMOTE_HUMAN"
                  ? "ONLINE"
                  : "AI",
              color: r.stats.character.colors.badge,
              mass: r.stats.baseMass,
              points: totalPts,
              lastRacePoints: racePts,
              lastRaceRank: r.rank,
              finishTimeMs: snap.finishTimeMs,
              lapTimesMs: snap.lapTimesMs,
              isProjectedTime: snap.isProjectedTime,
              isNewBestRace,
              isNewBestLap,
            };
          })
          .sort(
            (a, b) => b.points - a.points || a.lastRaceRank - b.lastRaceRank
          );

        setCupStandings(updatedStandings);
      }

      // Dedicated Server OR AI Self-Training Auto-Loop Countdown on Podium
      const isDedicatedOrAutoLoop =
        Boolean(mp?.activeRoomId && mp.isHost) &&
        (mp!.isDedicatedServer || autoAdvanceRacesRef.current);
      const isOfflineAiTrainingLoop =
        !mp?.activeRoomId && autoRepeatTrainingRef.current;

      if (
        racePhase === "FINISHED" &&
        (isDedicatedOrAutoLoop || isOfflineAiTrainingLoop) &&
        !autoAdvanceTriggered
      ) {
        postRaceAutoAdvanceTimer = Math.max(0, postRaceAutoAdvanceTimer - dt);
        if (postRaceAutoAdvanceTimer <= 0) {
          autoAdvanceTriggered = true;
          if (isOfflineAiTrainingLoop) {
            const loopMode = globalAiBrain.getTrainingTrackMode();
            if (loopMode === "ROTATE_CUP") {
              advanceToNextTrackInCup();
            } else if (loopMode === "ALL_CUPS") {
              advanceToNextTrackAcrossAllCups();
            } else {
              setRaceSessionKey((k) => k + 1);
            }
          } else {
            advanceToNextTrackInCup();
          }
        }
      }

      // Update Follow Camera around focusKart (Player Kart OR Spectated Racer)
      const camMode = cameraModeRef.current;
      const fwd = focusKart.forwardVector;
      const distBack =
        camMode === "HOOD" ? -0.9 : camMode === "DYNAMIC_WIDE" ? 12.2 : 8.8;
      const heightUp =
        camMode === "HOOD" ? 2.1 : camMode === "DYNAMIC_WIDE" ? 5.6 : 3.9;

      const shakeAmp =
        focusKart.cameraShakeTimer > 0
          ? (focusKart.surface === "CURB" ? 0.08 : 0.22) *
            Math.min(1, focusKart.cameraShakeTimer * 3)
          : 0;
      const shakeY =
        shakeAmp > 0 ? Math.sin(elapsedRaceMs * 0.09) * shakeAmp : 0;
      const shakeX =
        shakeAmp > 0 ? Math.cos(elapsedRaceMs * 0.075) * shakeAmp : 0;

      const kartPitch = focusKart.assembly.kartRoot.rotation.x;
      const slopeLookOffsetY =
        -Math.sin(kartPitch) * (camMode === "HOOD" ? 10.0 : 4.2);

      const desiredCamPos = focusKart.position
        .subtract(fwd.scale(distBack))
        .add(new Vector3(shakeX, heightUp + shakeY, 0));

      if (camMode !== "HOOD") {
        const camBackTrack = track.queryClosestTrackPoint(
          desiredCamPos,
          focusKart.closestTrack.sampleIndex
        );
        desiredCamPos.y = Math.max(
          desiredCamPos.y,
          camBackTrack.roadY + heightUp * 0.72 + shakeY
        );
      }

      if (camMode === "HOOD") {
        camera.position.copyFrom(desiredCamPos);
      } else {
        const horizBlend = Math.min(1, dt * 11);
        const vertBlend = Math.min(1, dt * 24);
        camera.position.x += (desiredCamPos.x - camera.position.x) * horizBlend;
        camera.position.z += (desiredCamPos.z - camera.position.z) * horizBlend;
        camera.position.y += (desiredCamPos.y - camera.position.y) * vertBlend;
      }

      const lookTarget = focusKart.position
        .add(fwd.scale(camMode === "HOOD" ? 18 : 7.5))
        .add(new Vector3(0, 1.35 + slopeLookOffsetY + shakeY * 0.5, 0));
      camera.setTarget(lookTarget);

      const targetFov =
        focusKart.boostTimer > 0 || focusKart.novaOverdriveTimer > 0
          ? 1.02
          : 0.88 + Math.max(0, focusKart.forwardSpeed / 180);
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);

      // Throttled React HUD state update (~12.5 Hz / every 80ms)
      if (now - lastHudSyncTime >= 80) {
        lastHudSyncTime = now;

        const finishTimingMap =
          racePhase === "FINISHED" ? resolveRacerTimingSnapshots(sorted) : null;

        const standingsSnapshot: RacerStanding[] = sorted.map((r) => {
          const resolvedTiming = finishTimingMap?.[r.racerId];
          return {
            racerId: r.racerId,
            characterId: r.stats.character.id,
            characterName: r.stats.character.name,
            name: r.name,
            kartName: r.stats.kart.name,
            isPlayer: r.isPlayer,
            isRemoteHuman: r.controlMode === "REMOTE_HUMAN",
            ownerPeerId: r.ownerPeerId,
            slotIndex: r.slotIndex,
            controllerLabel:
              r.controlMode === "LOCAL_HUMAN"
                ? "YOU"
                : r.controlMode === "REMOTE_HUMAN"
                ? "ONLINE"
                : "AI",
            mass: r.stats.baseMass,
            effectiveMass: r.effectiveMass,
            rank: r.rank,
            lap: Math.min(TOTAL_LAPS, r.lap),
            finished: r.finished,
            finishTimeMs: resolvedTiming
              ? resolvedTiming.finishTimeMs
              : r.finishTimeMs,
            lapTimesMs: resolvedTiming
              ? resolvedTiming.lapTimesMs
              : [...r.lapTimesMs],
            totalProgressDistance: Number(r.totalProgressDistance.toFixed(1)),
            normalizedSplineT: Number(
              r.closestTrack.normalizedSplineT.toFixed(3)
            ),
            worldX: Number(r.position.x.toFixed(1)),
            worldZ: Number(r.position.z.toFixed(1)),
            color: r.stats.character.colors.badge,
            archetypeClass: r.stats.character.archetypeClass,
          };
        });

        const aiSlotsCount = racers.filter((r) => r.controlMode === "AI").length;
        const humanSlotsCount = 4 - aiSlotsCount;
        const isSpectatingNow = !localPlayerKart;

        const nextTelemetry: HudTelemetry = {
          racePhase,
          countdownValue: Math.ceil(countdownRemaining),
          elapsedRaceMs: focusKart.finishTimeMs ?? elapsedRaceMs,
          rank: focusKart.rank,
          lap: Math.min(TOTAL_LAPS, focusKart.lap),
          totalLaps: TOTAL_LAPS,
          speed: Math.max(0, Math.round(focusKart.forwardSpeed * 2.2)),
          maxSpeed: Math.round(focusKart.stats.topSpeed * 2.2),
          surface: focusKart.surface,
          distToCenter: Number(focusKart.distToCenter.toFixed(2)),
          driftState: focusKart.driftState,
          driftDirection: focusKart.driftDirection,
          driftChargeSeconds: Number(
            focusKart.driftChargeSeconds.toFixed(2)
          ),
          driftChargeSubState: focusKart.driftChargeSubState,
          miniTurboTier: focusKart.miniTurboTier,
          prolongedRocketBoostActive: focusKart.prolongedRocketBoostActive,
          activeBoostLabel: focusKart.activeBoostLabel,
          heldItem: focusKart.heldItem,
          heldItemCharges: focusKart.heldItemCharges,
          orbitalShieldCharges: focusKart.orbitalShieldCharges,
          tripleSeekerCharges: focusKart.tripleSeekerCharges,
          tripleCryoMineCharges: focusKart.tripleCryoMineCharges,
          phaseCloakRemaining: Number(focusKart.phaseCloakTimer.toFixed(1)),
          empShrinkRemaining: Number(focusKart.empShrinkTimer.toFixed(1)),
          goldenOverclockRemaining: Number(
            focusKart.goldenOverclockTimer.toFixed(1)
          ),
          warpAutopilotRemaining: Number(
            focusKart.warpAutopilotTimer.toFixed(1)
          ),
          oilSquallRemaining: Number(focusKart.oilSquallTimer.toFixed(1)),
          rouletteSpinning: focusKart.rouletteTimer > 0,
          roulettePreviewItem: focusKart.roulettePreviewItem,
          novaOverdriveRemaining: Number(
            focusKart.novaOverdriveTimer.toFixed(1)
          ),
          cameraMode: cameraModeRef.current,
          standings: standingsSnapshot,
          lastCollisionBanner: collisionBanner,
          lastItemBanner: itemBanner,
          wrongWay: focusKart.wrongWay,
          spinOutActive: focusKart.spinOutTimer > 0,
          aiLab: globalAiBrain.getTelemetrySnapshot(aiDifficultyRef.current),
          multiplayer:
            isOnlineSession && mp && mp.activeRoomId
              ? {
                  active: true,
                  roomId: mp.activeRoomId,
                  isHost: mp.isHost,
                  isDedicatedServer: mp.isDedicatedServer,
                  isSpectating: isSpectatingNow,
                  spectatedSlotIndex: focusKart.slotIndex,
                  spectatedRacerName: focusKart.name,
                  spectateAutoDirector: spectateAutoDirectorRef.current,
                  autoAdvanceEnabled:
                    mp.isDedicatedServer || autoAdvanceRacesRef.current,
                  autoAdvanceSecondsLeft:
                    racePhase === "FINISHED" && isDedicatedOrAutoLoop
                      ? Math.ceil(postRaceAutoAdvanceTimer)
                      : null,
                  hostName: mp.hostName || mp.playerName,
                  localSlotIndex: localPlayerKart?.slotIndex ?? -1,
                  humanCount: humanSlotsCount,
                  aiCount: aiSlotsCount,
                  transportLabel: mp.getTransportDescription(),
                }
              : undefined,
        };

        const tempoMult =
          focusKart.novaOverdriveTimer > 0
            ? 1.12
            : focusKart.lap >= TOTAL_LAPS
            ? 1.07
            : 1.0;
        bgm.setTempoMultiplier(tempoMult);

        telemetryRef.current = nextTelemetry;
        setTelemetry(nextTelemetry);
      }
    };

    // Register 60Hz Physics & Render Observable (supports 1x / 4x / 8x AI simulation sub-stepping)
    const observer = scene.onBeforeRenderObservable.add(() => {
      const mult =
        !mp?.activeRoomId && simSpeedMultRef.current > 1
          ? simSpeedMultRef.current
          : 1;
      if (mult > 1) {
        for (let step = 0; step < mult; step++) {
          stepSimulationFrame(1 / 60);
        }
      } else {
        stepSimulationFrame();
      }
    });

    // Background Tab / Minimized Window Keep-Alive Ticker (25Hz) strictly for Dedicated Server hosts
    const isDedicatedServerHost = () =>
      Boolean(mp?.activeRoomId && mp.isHost && mp.isDedicatedServer);

    const bgServerKeepAliveInterval = setInterval(() => {
      const nowPerf = performance.now();
      const hiddenAllowed =
        document.visibilityState !== "hidden" || isDedicatedServerHost();
      if (!hiddenAllowed) return;

      if (
        document.visibilityState === "hidden" ||
        nowPerf - lastSimStepPerfTime > 95
      ) {
        const elapsedSec = Math.min(
          Math.max(0.016, (nowPerf - lastSimStepPerfTime) / 1000),
          PHYSICS_CONSTANTS.MAX_DT
        );
        stepSimulationFrame(elapsedSec);
      }
    }, 40);

    // Disconnect online human racers if they lock their phone or background/close the page so an AI Bot immediately takes their slot
    const disconnectOnlineHumanIfLocked = () => {
      if (mp?.activeRoomId && !isDedicatedServerHost()) {
        handleLeaveOnlineRaceToMenu();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        disconnectOnlineHumanIfLocked();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", disconnectOnlineHumanIfLocked);
    window.addEventListener("beforeunload", disconnectOnlineHumanIfLocked);

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(bgServerKeepAliveInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", disconnectOnlineHumanIfLocked);
      window.removeEventListener("beforeunload", disconnectOnlineHumanIfLocked);
      stepOutToSpectateActionRef.current = null;
      jumpInToDriveActionRef.current = null;
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      delete window.__GUTSY_KARTS_DEBUG__;
      scene.onBeforeRenderObservable.remove(observer);
      if (mp) {
        mp.setCallbacks({
          onLobbyUpdated: handleLobbyUpdated,
          onWelcomeSnapshot: handleWelcomeSnapshot,
        });
      }
      bgm.dispose();
      soundtrackRef.current = null;
      itemManager.dispose();
      for (const r of racers) r.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, [
    screen,
    selectedCharacter,
    selectedKartByChar,
    selectedCupId,
    selectedTrackIdx,
    activeCup,
    trackDef,
    raceSessionKey,
    cycleCameraMode,
    toggleMusicMute,
    handleLobbyUpdated,
    handleWelcomeSnapshot,
    advanceToNextTrackInCup,
    advanceToNextTrackAcrossAllCups,
    handleLeaveOnlineRaceToMenu,
  ]);



  const formatTime = (ms: number | null) => {
    if (ms === null || ms < 0) return "--:--.--";
    const totalSec = ms / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${hundredths
      .toString()
      .padStart(2, "0")}`;
  };
  const formatRaceTime = formatTime;

  const ordinalSuffix = (rank: number) => {
    if (rank === 1) return "1ST";
    if (rank === 2) return "2ND";
    if (rank === 3) return "3RD";
    return `${rank}TH`;
  };

  // SCREEN 0: 3D TERRAIN & CIRCUIT STUDIO (WITH CUP & MAP SWITCHER + MANUAL SAVE + UNDO/REDO)
  if (screen === "EDITOR") {
    return (
      <TrackEditor
        trackDef={trackDef}
        onChangeTrackDef={handleUpdateTrackDef}
        onBackToMenu={() => setScreen("SELECT")}
        onStartRaceWithTrack={(trackOverride) => {
          if (trackOverride) {
            handleUpdateTrackDef(trackOverride);
          }
          setIsCupSeriesActive(false);
          setRaceSessionKey((k) => k + 1);
          setScreen("RACE");
        }}
        cupsCatalog={cupsCatalog}
        activeCupId={selectedCupId}
        activeTrackIdx={selectedTrackIdx}
        onSelectCupAndTrack={handleSelectCupAndTrack}
        onAddTrackToCup={handleAddTrackToCup}
        onAddCustomCup={handleAddCustomCup}
        onUpdateCupMeta={handleUpdateCupMeta}
        onDeleteCustomCup={handleDeleteCustomCup}
        onDeleteTrackFromCup={handleDeleteTrackFromCup}
        onResetTrackToOfficial={handleResetTrackToOfficial}
        onImportCupOrCatalog={handleImportCupOrCatalog}
        onCommitCatalogToRepoSuccess={handleCommitCatalogToRepoSuccess}
      />
    );
  }

  // SCREEN 1: GRAND PRIX CUP, CIRCUIT, CHARACTER & KART SELECTOR
  if (screen === "SELECT") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex flex-col justify-between p-4 sm:p-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/15 pb-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 border border-amber-400/40 px-3 py-1 text-xs font-extrabold tracking-widest text-amber-300 uppercase">
                <Trophy className="w-3.5 h-3.5" /> Gutsy Karts Neighborhood Circuit
              </div>
              <h1 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight text-white">
                GUTSY KARTS <span className="text-amber-400">3D GP</span>
              </h1>
              <p className="mt-1 text-sm sm:text-base text-slate-300 max-w-2xl">
                Choose a{" "}
                <span className="text-amber-300 font-semibold">
                  Grand Prix Cup
                </span>{" "}
                to race through a multi-track championship series (4-3-2-1 points system), or open the{" "}
                <span className="text-emerald-300 font-semibold">
                  3D Terrain &amp; Circuit Studio
                </span>{" "}
                to sculpt tracks and manage Cup maps.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!joiningRoomId && !mpRef.current?.activeRoomId && (
                <button
                  type="button"
                  data-testid="open-track-editor-btn"
                  onClick={() => setScreen("EDITOR")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/15 px-4 py-3.5 text-xs sm:text-sm font-black tracking-wider text-emerald-200 uppercase hover:bg-emerald-500/25 transition cursor-pointer"
                >
                  <Map className="w-4 h-4 text-emerald-300" />
                  <span>3D CIRCUIT STUDIO</span>
                </button>
              )}

              <button
                type="button"
                data-testid="host-dedicated-server-btn"
                onClick={() => startDedicatedServerRoom(selectedCupId, selectedTrackIdx)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-fuchsia-400/70 bg-fuchsia-500/20 px-4 py-3.5 text-xs sm:text-sm font-black tracking-wider text-fuchsia-200 uppercase shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:bg-fuchsia-500/30 active:scale-95 transition cursor-pointer"
              >
                <Monitor className="w-4 h-4 text-fuchsia-300" />
                <span>DEDICATED SERVER (4 SLOTS)</span>
              </button>

              <button
                type="button"
                data-testid="host-online-race-btn"
                onClick={() => startHostedOnlineRace(selectedCupId, selectedTrackIdx)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-cyan-400/70 bg-cyan-500/20 px-4 py-3.5 text-xs sm:text-sm font-black tracking-wider text-cyan-200 uppercase shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:bg-cyan-500/30 active:scale-95 transition cursor-pointer"
              >
                <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
                <span>HOST &amp; PLAY ONLINE</span>
              </button>

              <button
                type="button"
                data-testid="start-grand-prix-btn"
                onClick={() => startGrandPrixCupSeries(selectedCupId, 0)}
                className="group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-6 py-3.5 text-sm sm:text-base font-black tracking-wider text-slate-950 uppercase shadow-[0_0_30px_rgba(245,158,11,0.5)] hover:brightness-110 active:scale-95 transition cursor-pointer"
              >
                <span>START {activeCup?.name.toUpperCase()}</span>
                <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* ONLINE MULTIPLAYER & DROP-IN AI REPLACEMENT LOBBY */}
          <div
            data-testid="multiplayer-lobby-panel"
            className="mt-5 rounded-3xl border border-cyan-400/35 bg-slate-900/85 p-4 sm:p-5 space-y-4 shadow-xl"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-cyan-300">
                    <Wifi className="w-4 h-4 text-cyan-400" /> PLAYER-HOSTED ONLINE MULTIPLAYER &amp; DEDICATED LOBBY
                  </span>
                  <span
                    data-testid="network-backend-badge"
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      backendStatus === "SUPABASE_ONLINE"
                        ? "bg-emerald-500/20 border border-emerald-400/50 text-emerald-300"
                        : "bg-cyan-500/20 border border-cyan-400/40 text-cyan-200"
                    }`}
                  >
                    {backendStatus === "SUPABASE_ONLINE"
                      ? "SUPABASE REALTIME + WEBRTC ONLINE"
                      : "OFFLINE-SAFE / LOCAL CROSS-TAB READY"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Host a race while driving, launch a{" "}
                  <strong className="text-fuchsia-300">
                    Dedicated Spectator Server (4 open player slots + auto-loop)
                  </strong>
                  , or join any active race below to{" "}
                  <strong className="text-amber-300">
                    immediately replace an AI bot mid-race
                  </strong>
                  !
                </p>
              </div>

              {/* Callsign Input & Online Player Counter */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/80 px-3 py-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    CALLSIGN:
                  </span>
                  <input
                    type="text"
                    data-testid="player-callsign-input"
                    value={playerCallsign}
                    maxLength={18}
                    onChange={(e) => setPlayerCallsign(e.target.value)}
                    className="w-28 sm:w-32 bg-transparent text-xs font-black text-amber-300 focus:outline-none"
                    placeholder="Your Callsign"
                  />
                </div>

                <div
                  data-testid="online-players-count"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-950/40 px-3 py-2 text-xs font-black text-cyan-200"
                >
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{onlinePlayers.length} ONLINE</span>
                </div>
              </div>
            </div>

            {/* Online Players Presence Strip */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                RACERS ONLINE:
              </span>
              {onlinePlayers.map((p) => {
                const isMe = p.peerId === mpRef.current?.peerId;
                return (
                  <span
                    key={p.peerId}
                    data-testid={`presence-pill-${p.peerId}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                      isMe
                        ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                        : "border-white/15 bg-slate-950/70 text-slate-200"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        p.status === "LOBBY"
                          ? "bg-emerald-400"
                          : p.status === "DEDICATED_HOST"
                          ? "bg-fuchsia-400 animate-pulse"
                          : "bg-amber-400 animate-pulse"
                      }`}
                    />
                    <span>
                      {p.playerName} {isMe ? "(YOU)" : ""}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">
                      •{" "}
                      {p.status === "DEDICATED_HOST"
                        ? "DEDICATED SERVER"
                        : p.status}
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Active Open Races (Joinable Mid-Race to Replace an AI Bot) */}
            <div data-testid="open-rooms-list" className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                ACTIVE PLAYER &amp; DEDICATED RACES ({openRooms.length} OPEN)
              </div>

              {openRooms.length === 0 ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-dashed border-white/15 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
                  <span>
                    No ongoing online races right now. Click{" "}
                    <strong className="text-cyan-300">HOST &amp; PLAY ONLINE</strong>{" "}
                    to race with 3 open AI slots, or{" "}
                    <strong className="text-fuchsia-300">
                      DEDICATED SERVER (4 SLOTS)
                    </strong>{" "}
                    to run a spectator server that 4 players can join!
                  </span>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startDedicatedServerRoom(selectedCupId, selectedTrackIdx)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-500/20 border border-fuchsia-400/50 px-3 py-1.5 text-[11px] font-black uppercase text-fuchsia-200 hover:bg-fuchsia-500/30 transition cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5" /> DEDICATED (4 SLOTS)
                    </button>
                    <button
                      type="button"
                      onClick={() => startHostedOnlineRace(selectedCupId, selectedTrackIdx)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 px-3 py-1.5 text-[11px] font-black uppercase text-cyan-200 hover:bg-cyan-500/30 transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" /> HOST {trackDef.name.toUpperCase()}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {openRooms.map((room) => {
                    const canHotJoin = room.aiSlotCount > 0 && room.racePhase !== "FINISHED";
                    const isJoiningThis = joiningRoomId === room.roomId;
                    return (
                      <div
                        key={room.roomId}
                        data-testid={`open-room-card-${room.roomId}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/40 bg-slate-950/80 p-3.5 shadow-md"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {room.isDedicatedServer && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/25 border border-fuchsia-400/50 px-2 py-0.5 text-[10px] font-black uppercase text-fuchsia-200">
                                <Monitor className="w-3 h-3" /> DEDICATED SERVER
                              </span>
                            )}
                            {room.isCustomTrack && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/25 border border-amber-400/50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200">
                                <Sparkles className="w-3 h-3" /> CUSTOM CIRCUIT
                              </span>
                            )}
                            <span className="rounded-md bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                              {room.racePhase === "COUNTDOWN"
                                ? "STARTING GRID"
                                : `LIVE • LAP ${room.currentLap}/${room.totalLaps}`}
                            </span>
                            <span className="text-xs font-black text-white">
                              {room.trackName}
                            </span>
                            {room.cupName && (
                              <span className="text-[10px] font-bold text-slate-400">
                                ({room.cupName})
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-300">
                            Host:{" "}
                            <strong className="text-amber-300">
                              {room.hostName}
                            </strong>{" "}
                            •{" "}
                            <span className="text-emerald-300 font-bold">
                              {room.humanCount}/4 Humans
                            </span>{" "}
                            •{" "}
                            <span className="text-cyan-300 font-bold">
                              {room.aiSlotCount} AI{" "}
                              {room.aiSlotCount === 1 ? "Bot" : "Bots"} Open
                            </span>
                          </div>
                          {room.slotSummaries && room.slotSummaries.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {room.slotSummaries.map((slot) => (
                                <span
                                  key={slot.slotIndex}
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    slot.isHuman
                                      ? "bg-cyan-500/20 border border-cyan-400/50 text-cyan-200"
                                      : "bg-slate-800/80 border border-white/10 text-slate-400"
                                  }`}
                                >
                                  <span>{slot.playerName}</span>
                                  <span
                                    className={`rounded px-1 text-[8px] font-black uppercase ${
                                      slot.isHuman
                                        ? "bg-cyan-400 text-slate-950"
                                        : "bg-slate-700 text-slate-300"
                                    }`}
                                  >
                                    {slot.isHuman ? "HUMAN" : "AI"}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          data-testid="join-room-btn"
                          disabled={!canHotJoin || isJoiningThis}
                          onClick={() => handleJoinOnlineRoom(room)}
                          className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition shrink-0 ${
                            canHotJoin
                              ? "bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-110 active:scale-95 cursor-pointer shadow-lg"
                              : "bg-slate-800 text-slate-500 cursor-not-allowed"
                          }`}
                        >
                          {isJoiningThis
                            ? "JOINING..."
                            : canHotJoin
                            ? "JOIN & REPLACE AI"
                            : "FULL (4/4)"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>


          {/* Grand Prix Cup & Multi-Track Series Selector */}
          <div className="mt-5 rounded-3xl border border-amber-400/30 bg-slate-900/80 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" /> GRAND PRIX CHAMPIONSHIP CUPS (1ST = 4 PTS • 2ND = 3 PTS • 3RD = 2 PTS • 4TH = 1 PT)
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Select a Cup to race its circuits sequentially for the Championship Podium, or click any individual track to practice or edit it.
                </p>
              </div>
              {activeCup && !joiningRoomId && !mpRef.current?.activeRoomId && (
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    data-testid="menu-new-cup-btn"
                    onClick={() => {
                      handleAddCustomCup();
                      setScreen("EDITOR");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-200 hover:bg-amber-500/25 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> NEW CUSTOM CUP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleAddTrackToCup(activeCup.id);
                      setScreen("EDITOR");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/25 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> ADD NEW TRACK TO {activeCup.name.toUpperCase()}
                  </button>
                </div>
              )}
            </div>

            {/* Cup Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cupsCatalog.map((cup) => {
                const isSelectedCup = cup.id === activeCup?.id;
                const isCustom = cup.isCustomCup || !isBuiltinCupId(cup.id);
                return (
                  <button
                    key={cup.id}
                    type="button"
                    data-testid={`select-cup-${cup.id}`}
                    onClick={() => {
                      setSelectedCupId(cup.id);
                      setSelectedTrackIdx(0);
                    }}
                    className={`rounded-2xl border-2 p-4 text-left transition cursor-pointer ${
                      isSelectedCup
                        ? "border-amber-400 bg-slate-950/90 shadow-[0_0_24px_rgba(251,191,36,0.25)]"
                        : "border-white/10 bg-slate-950/50 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{ backgroundColor: cup.badgeColor }}
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-950"
                        >
                          {cup.tracks.length} RACES
                        </span>
                        {isCustom && (
                          <span className="rounded-full bg-amber-500/20 border border-amber-400/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                            CUSTOM CUP
                          </span>
                        )}
                      </div>
                      <Trophy
                        className="w-4 h-4"
                        style={{ color: cup.badgeColor }}
                      />
                    </div>
                    <div className="mt-2 text-lg font-black text-white">
                      {cup.name}
                    </div>
                    <div className="text-xs text-slate-400">{cup.subtitle}</div>
                  </button>
                );
              })}
            </div>

            {/* Tracks in Selected Cup */}
            {activeCup && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-white/10">
                {activeCup.tracks.map((t, idx) => {
                  const isSelectedTrack = idx === selectedTrackIdx;
                  const savedRec = trackRecords[t.id || t.name];
                  return (
                    <div
                      key={t.id ?? idx}
                      data-testid={`cup-track-card-${idx}`}
                      onClick={() => setSelectedTrackIdx(idx)}
                      className={`flex flex-col justify-between rounded-2xl border p-3 transition cursor-pointer ${
                        isSelectedTrack
                          ? "border-cyan-400 bg-cyan-950/30"
                          : "border-white/10 bg-slate-950/60 hover:border-white/25"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                          <span className="text-amber-300">
                            RACE {idx + 1} OF {activeCup.tracks.length}
                          </span>
                          <span className="text-slate-400">
                            {t.boostPads.length} BOOSTS • {t.obstacles.length} HAZARDS
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1.5">
                          <span className="text-sm font-black text-white truncate">
                            {t.name}
                          </span>
                          {t.isUserModified && (
                            <span
                              title="Modified in local browser storage"
                              className="shrink-0 rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300"
                            >
                              LOCAL EDIT
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                        {savedRec && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-400/25 bg-slate-900/90 px-2 py-1 text-[10px] font-mono">
                            <span className="text-amber-300 font-bold">
                              BEST: {formatRaceTime(savedRec.bestRaceTimeMs)}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="text-cyan-300 font-bold">
                              LAP: {formatRaceTime(savedRec.bestLapTimeMs)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-center gap-1.5 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startGrandPrixCupSeries(activeCup.id, idx);
                          }}
                          className="flex-1 rounded-lg bg-amber-400/20 border border-amber-400/50 py-1 text-[10px] font-black uppercase text-amber-200 hover:bg-amber-400/30 cursor-pointer"
                        >
                          RACE FROM R{idx + 1}
                        </button>
                        {!joiningRoomId && !mpRef.current?.activeRoomId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTrackIdx(idx);
                              setScreen("EDITOR");
                            }}
                            className="rounded-lg bg-emerald-500/20 border border-emerald-400/50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-200 hover:bg-emerald-500/30 cursor-pointer"
                          >
                            EDIT 3D
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4-Tier AI Thinking, Difficulty & Self-Learning Selector */}
          <div className="mt-4 rounded-3xl border border-white/15 bg-slate-900/75 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> AI OPPONENT THINKING &amp; SELF-LEARNING MODEL
                </span>
                <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-black text-fuchsia-200">
                  GEN #{globalAiBrain.getTelemetrySnapshot(aiDifficulty).generation} • BEST FITNESS {globalAiBrain.getTelemetrySnapshot(aiDifficulty).championFitness.toFixed(1)}/100
                </span>
                <button
                  type="button"
                  data-testid="open-ai-architecture-btn"
                  onClick={() => setShowAiArchitectureGuide(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/45 bg-slate-900/90 px-2.5 py-0.5 text-[10px] font-extrabold text-fuchsia-200 hover:border-fuchsia-300 hover:bg-fuchsia-500/25 hover:text-white transition cursor-pointer"
                  title="View technical architecture of the (1+3) Elitist Neuro-Evolutionary AI Self-Learning system"
                >
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-fuchsia-400/25 text-[9px] font-black text-fuchsia-200 border border-fuchsia-300/50">
                    ?
                  </span>
                  <span>HOW AI SELF-LEARNING WORKS</span>
                </button>
              </div>
              <p className="mt-0.5 text-xs text-slate-300">
                {aiDifficulty === "EASY" &&
                  "EASY (Rookie): Full kart top speed unlocked, relaxed corner lines, conservative drift entry, and wide item scatter."}
                {aiDifficulty === "MEDIUM" &&
                  "MEDIUM (Challenger): Spirited apex cuts, hits ~75% of speed booster pads & ramps, charges Blue/Orange Mini-Turbos, and leads shots."}
                {aiDifficulty === "HARD" &&
                  "HARD (Pro Ace): High-speed pro racing! Cuts optimal inside apexes, holds drifts through grass shortcuts with boost, and uses predictive aiming."}
                {aiDifficulty === "SELF_LEARNING" &&
                  "SELF-LEARNING ((1+3) Elitist Evolution Strategy + Neural Residual Policy): 23-parameter genome (15 spline/drift-PD weights + 8-input tanh neural steering residual) scored at 60Hz with Orthogonal Latin-Square grid×brain rotation!"}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    {
                      id: "EASY" as AiDifficulty,
                      label: "EASY",
                      sub: globalAiBrain.getTelemetrySnapshot(aiDifficulty)
                        .useTrainedPresets.EASY
                        ? "Trained Dataset"
                        : "Beginner",
                      activeClass:
                        "border-emerald-400 bg-emerald-500/25 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.25)]",
                    },
                    {
                      id: "MEDIUM" as AiDifficulty,
                      label: "MEDIUM",
                      sub: globalAiBrain.getTelemetrySnapshot(aiDifficulty)
                        .useTrainedPresets.MEDIUM
                        ? "Trained Dataset"
                        : "Challenger",
                      activeClass:
                        "border-cyan-400 bg-cyan-500/25 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.25)]",
                    },
                    {
                      id: "HARD" as AiDifficulty,
                      label: "HARD",
                      sub: globalAiBrain.getTelemetrySnapshot(aiDifficulty)
                        .useTrainedPresets.HARD
                        ? "Trained Dataset"
                        : "Pro Ace",
                      activeClass:
                        "border-rose-400 bg-rose-500/25 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.3)]",
                    },
                    {
                      id: "SELF_LEARNING" as AiDifficulty,
                      label: "SELF LEARNING",
                      sub: `Gen #${globalAiBrain.getTelemetrySnapshot("SELF_LEARNING").generation}`,
                      activeClass:
                        "border-fuchsia-400 bg-fuchsia-500/25 text-fuchsia-200 shadow-[0_0_20px_rgba(217,70,239,0.35)]",
                    },
                  ] as const
                ).map((tier) => {
                  const active = aiDifficulty === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      data-testid={`ai-diff-${tier.id.toLowerCase()}`}
                      onClick={() => handleSelectAiDifficulty(tier.id)}
                      className={`rounded-2xl border-2 px-3.5 py-2 text-center transition cursor-pointer ${
                        active
                          ? tier.activeClass
                          : "border-white/10 bg-slate-950/60 text-slate-400 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-black tracking-wider uppercase flex items-center justify-center gap-1">
                        {tier.id === "SELF_LEARNING" && (
                          <Brain className="w-3.5 h-3.5 text-fuchsia-300" />
                        )}
                        <span>{tier.label}</span>
                      </div>
                      <div className="text-[10px] font-bold opacity-80">
                        {tier.sub}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-testid="launch-ai-training-sim-btn"
                onClick={() =>
                  startAiSelfTrainingSim(activeCup.id, selectedTrackIdx)
                }
                className="rounded-2xl border-2 border-fuchsia-400/70 bg-gradient-to-r from-fuchsia-600/35 to-indigo-600/35 px-4 py-2 text-left hover:from-fuchsia-500/45 hover:to-indigo-500/45 transition cursor-pointer shadow-[0_0_20px_rgba(217,70,239,0.25)]"
                title="Launch 4 AI racers in accelerated 8x auto-looping Self-Training Simulation mode with live path & telemetry analysis"
              >
                <div className="flex items-center gap-1.5 text-xs font-black uppercase text-fuchsia-200">
                  <FastForward className="w-3.5 h-3.5 text-fuchsia-300" />
                  <span>4-AI TRAINING SIM</span>
                </div>
                <div className="text-[10px] font-bold text-fuchsia-300/90">
                  Auto-Repeat + Path Lab
                </div>
              </button>
            </div>
          </div>

          {/* 4 Character Cards Header + ? Balance Guide Trigger */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-amber-300">
                DRIVER ROSTER &amp; ASYMMETRIC ARCHETYPES
              </span>
              <span className="text-xs text-slate-400">
                • 4 distinct driving styles tuned for equal ~25% win rate across all tracks
              </span>
            </div>
            <button
              type="button"
              data-testid="open-balance-guide-btn"
              onClick={() => setShowBalanceGuide(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-slate-900/85 px-3 py-1 text-[11px] font-extrabold text-cyan-200 hover:border-cyan-300 hover:bg-cyan-500/20 hover:text-white transition cursor-pointer shadow-sm"
              title="How our 4 asymmetric character archetypes are balanced for equal lap pace"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400/25 text-[10px] font-black text-cyan-200 border border-cyan-300/50">
                ?
              </span>
              <span>HOW ARCHETYPE BALANCE WORKS</span>
            </button>
          </div>

          {/* 4 Character Cards */}
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CHARACTER_ROSTER.map((char) => {
              const isSelected = char.id === selectedCharacter.id;
              const charKartId =
                selectedKartByChar[char.id] ?? char.defaultKartId;
              const stats = resolveRacerStats(char.id, charKartId);

              return (
                <div
                  key={char.id}
                  data-testid={`char-card-${char.id}`}
                  onClick={() => setSelectedCharId(char.id)}
                  className={`flex flex-col justify-between rounded-3xl border-2 p-5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-amber-400 bg-slate-900/90 shadow-[0_0_28px_rgba(251,191,36,0.3)] -translate-y-1"
                      : "border-white/15 bg-slate-900/55 hover:border-white/35 hover:bg-slate-900/75"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        style={{ backgroundColor: char.colors.badge }}
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-widest text-slate-950 uppercase"
                      >
                        {char.archetypeClass.replace("_", " ")}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-300">
                        <Weight className="w-3.5 h-3.5" /> {stats.baseMass} kg
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl font-black tracking-tight text-white">
                      {char.name}
                    </h2>
                    <p className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      {char.title}
                    </p>
                    <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                      {char.bio}
                    </p>

                    {/* Stat Bars */}
                    <div className="mt-4 space-y-2.5 text-xs">
                      <div>
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>MASS / JUGGERNAUT</span>
                          <span className="text-amber-300">
                            {stats.baseMass} kg
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500"
                            style={{
                              width: `${Math.min(100, (stats.baseMass / 250) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>TOP SPEED (PAVE / OFF)</span>
                          <span className="text-cyan-300">
                            {stats.topSpeed} / {stats.offRoadTopSpeed} u/s
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                            style={{
                              width: `${Math.min(100, (stats.topSpeed / 52) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>ACCELERATION</span>
                          <span className="text-emerald-300">
                            {stats.acceleration} u/s²
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                            style={{
                              width: `${Math.min(100, (stats.acceleration / 36) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>DRIFT &amp; HANDLING</span>
                          <span className="text-fuchsia-300">
                            {stats.handling} ({Math.round(stats.driftGrip * 100)}% grip)
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-purple-500"
                            style={{
                              width: `${Math.min(100, (stats.handling / 3.4) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>MINI-TURBO BOOST</span>
                          <span className="text-indigo-300">
                            +{Math.round(stats.miniTurboDurationBonus * 100)}% spd • {stats.miniTurboDurationSec.toFixed(2)}s
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500"
                            style={{
                              width: `${Math.min(100, ((stats.miniTurboDurationBonus + 0.02) / 0.18) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Swappable Kart Chassis Selector */}
                  <div
                    className="mt-5 pt-4 border-t border-white/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                      CHASSIS LOADOUT ({char.availableKartIds.length} UNLOCKED)
                    </label>
                    <select
                      data-testid={`kart-select-${char.id}`}
                      value={charKartId}
                      onChange={(e) => {
                        setSelectedCharId(char.id);
                        setSelectedKartByChar((prev) => ({
                          ...prev,
                          [char.id]: e.target.value,
                        }));
                      }}
                      className="mt-1.5 w-full rounded-xl border border-white/20 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                    >
                      {char.availableKartIds.map((kId) => {
                        const k = KART_CHASSIS_CATALOG[kId];
                        if (!k) return null;
                        return (
                          <option key={k.id} value={k.id}>
                            {k.name} ({k.bodyStyle})
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400 line-clamp-2">
                      {stats.kart.tagline}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Controls & Physics Reference Footer */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 rounded-3xl border border-white/15 bg-slate-900/60 p-5 text-xs">
            <div className="flex items-start gap-3">
              <Gauge className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-white uppercase tracking-wider">
                  Desktop & Mobile Controls
                </h3>
                <p className="mt-1 text-slate-300">
                  <strong className="text-white">Desktop:</strong> WASD / Arrows to drive,{" "}
                  <strong className="text-amber-300">Space / Shift</strong> to Jump & Hold to Drift,{" "}
                  <strong className="text-emerald-300">E / Enter</strong> for Power-Up,{" "}
                  <strong className="text-cyan-300">C</strong> for Camera.{" "}
                  <strong className="text-white">Mobile:</strong> Bottom-left Virtual Joystick + Bottom-right Jump/Drift & Item buttons.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Flame className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-white uppercase tracking-wider">
                  Hop-to-Drift & 3-Stage Sparks
                </h3>
                <p className="mt-1 text-slate-300">
                  Tap <strong className="text-amber-300">Jump</strong> to hop (vy = 6.5). Hold Jump while steering to lock a ±22° drift slip angle! Charge{" "}
                  <span className="text-cyan-300 font-bold">1.0s Blue (+25%)</span>,{" "}
                  <span className="text-orange-300 font-bold">2.2s Orange (+40%)</span>, or{" "}
                  <span className="text-fuchsia-300 font-bold">3.6s Purple Ultra (+55%)</span>!
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-white uppercase tracking-wider">
                  The Juggernaut Mass Law (γ = 3.0)
                </h3>
                <p className="mt-1 text-slate-300">
                  Selected:{" "}
                  <strong className="text-amber-300">
                    {resolvedPreviewStats.character.name} ({resolvedPreviewStats.baseMass} kg)
                  </strong>{" "}
                  in <strong className="text-white">{resolvedPreviewStats.kart.name}</strong>. Heavyweights (220 kg) suffer &lt;3% velocity loss when rammed by Featherweights (50 kg)!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN 2: IN-RACE 3D CANVAS, HUD, SVG MINI-MAP & MOBILE TOUCH CONTROLS
  const displayItem = telemetry.rouletteSpinning
    ? telemetry.roulettePreviewItem
    : telemetry.heldItem;
  const heldItemMeta = displayItem ? POWER_UP_CATALOG[displayItem] : null;

  const manualPumpProgress =
    telemetry.driftState === "DRIFT_ACTIVE"
      ? ((telemetry.driftChargeSubState ?? 0) / 4) * 75
      : 0;
  const driftChargeProgress = Math.min(
    100,
    Math.max(
      manualPumpProgress,
      (telemetry.driftChargeSeconds / PHYSICS_CONSTANTS.TIER3_THRESHOLD_SEC) * 100
    )
  );

  const totalCupTracks = activeCup?.tracks.length ?? 1;
  const hasNextTrackInCup =
    isCupSeriesActive && selectedTrackIdx + 1 < totalCupTracks;
  const nextTrackInCup = hasNextTrackInCup
    ? activeCup?.tracks[selectedTrackIdx + 1]
    : null;

  const currentCupIndex = cupsCatalog.findIndex((c) => c.id === activeCup?.id);
  const nextCup =
    currentCupIndex >= 0 && currentCupIndex + 1 < cupsCatalog.length
      ? cupsCatalog[currentCupIndex + 1]
      : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      {/* 3D Babylon.js Canvas */}
      <canvas
        ref={canvasRef}
        data-testid="race-canvas"
        className="h-full w-full block outline-none touch-none"
      />

      {/* TOP-LEFT HUD: Rank, Lap Counter, Cup Track Indicator, Race Timer & Camera Button */}
      <div className="pointer-events-none fixed top-3 left-3 sm:top-5 sm:left-5 z-20 flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-slate-950/80 px-4 py-2.5 backdrop-blur-md shadow-xl">
          <div className="flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-3 py-1 text-slate-950">
            <span className="text-[10px] font-black uppercase tracking-widest leading-none">
              POS
            </span>
            <span
              data-testid="hud-rank"
              className="text-2xl sm:text-3xl font-black leading-none"
            >
              {ordinalSuffix(telemetry.rank)}
            </span>
          </div>

          <div className="border-r border-white/15 pr-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
              {activeCup?.name} • R{selectedTrackIdx + 1}/{totalCupTracks}
            </div>
            <div
              data-testid="hud-lap"
              className="text-lg sm:text-xl font-black text-white"
            >
              LAP {telemetry.lap}/{telemetry.totalLaps}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate max-w-[130px]">
              {(joinedTrackOverrideRef.current ?? trackDef).name}
            </div>
            <div className="font-mono text-sm sm:text-base font-bold text-cyan-300">
              {formatTime(telemetry.elapsedRaceMs)}
            </div>
          </div>
        </div>

        {/* Live Online Room Status Pill (Shown when in an Online Race or Dedicated Server) */}
        {telemetry.multiplayer?.active && (
          <div
            data-testid="hud-multiplayer-bar"
            className={`pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold shadow-lg ${
              telemetry.multiplayer.isDedicatedServer
                ? "border-fuchsia-400/60 bg-slate-950/90 text-fuchsia-200"
                : "border-cyan-400/50 bg-slate-950/90 text-cyan-200"
            }`}
          >
            {telemetry.multiplayer.isDedicatedServer ? (
              <Monitor className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            )}
            <span className="font-black uppercase text-white">
              {telemetry.multiplayer.isDedicatedServer
                ? "DEDICATED SERVER"
                : telemetry.multiplayer.isHost
                ? "HOSTING"
                : "ONLINE"}
            </span>
            <span className="text-emerald-300 font-black">
              {telemetry.multiplayer.humanCount}/4 HUMANS
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-amber-300 font-black">
              {telemetry.multiplayer.aiCount} AI{" "}
              {telemetry.multiplayer.aiCount === 1 ? "BOT" : "BOTS"}
            </span>

            {/* Player / Host Toggle: Step Out to Spectate (AI Takes Wheel) OR Join Race & Assume AI Racer */}
            {!telemetry.multiplayer.isSpectating && (
              <button
                type="button"
                data-testid="step-out-spectate-btn"
                onClick={() => stepOutToSpectateActionRef.current?.()}
                className="ml-1 inline-flex items-center gap-1 rounded-lg bg-fuchsia-500/25 border border-fuchsia-400/50 px-2 py-0.5 text-[10px] font-black uppercase text-fuchsia-200 hover:bg-fuchsia-500/35 cursor-pointer"
                title="Stop driving and let an AI bot take your kart while you spectate the live race"
              >
                <Eye className="w-3 h-3" /> STEP OUT TO SPECTATE
              </button>
            )}

            {telemetry.multiplayer.isSpectating &&
              telemetry.multiplayer.aiCount > 0 && (
                <button
                  type="button"
                  data-testid="jump-in-drive-btn"
                  onClick={() => jumpInToDriveActionRef.current?.()}
                  className="ml-1 inline-flex items-center gap-1 rounded-lg bg-emerald-500/30 border border-emerald-400/60 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-100 hover:bg-emerald-500/45 cursor-pointer shadow"
                  title="Assume the role of an AI racer in-place and join the live race"
                >
                  <Gamepad2 className="w-3 h-3" /> JOIN RACE &amp; ASSUME AI
                </button>
              )}

            {!telemetry.multiplayer.isHost && (
              <button
                type="button"
                data-testid="save-host-track-btn"
                onClick={handleSaveHostTrackToStudio}
                className="ml-1 inline-flex items-center gap-1 rounded-lg bg-amber-500/25 border border-amber-400/50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200 hover:bg-amber-500/35 cursor-pointer"
                title="Save a copy of the Host's custom circuit into your local 3D Circuit Studio catalog"
              >
                <Download className="w-3 h-3" />{" "}
                {savedHostMapNotice ? "SAVED TO STUDIO!" : "SAVE HOST MAP"}
              </button>
            )}

            <button
              type="button"
              onClick={handleLeaveOnlineRaceToMenu}
              className="ml-1 inline-flex items-center gap-1 rounded-lg bg-rose-500/20 border border-rose-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-rose-200 hover:bg-rose-500/30 cursor-pointer"
            >
              <LogOut className="w-3 h-3" /> LEAVE
            </button>
          </div>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="hud-ai-difficulty-btn"
            onClick={cycleAiDifficulty}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              aiDifficulty === "SELF_LEARNING"
                ? "border-fuchsia-400/80 bg-fuchsia-950/90 text-fuchsia-200 hover:bg-fuchsia-900 shadow-[0_0_14px_rgba(217,70,239,0.3)]"
                : aiDifficulty === "HARD"
                ? "border-rose-400/70 bg-rose-950/85 text-rose-200 hover:bg-rose-900"
                : aiDifficulty === "MEDIUM"
                ? "border-cyan-400/70 bg-cyan-950/85 text-cyan-200 hover:bg-cyan-900"
                : "border-emerald-400/70 bg-emerald-950/85 text-emerald-200 hover:bg-emerald-900"
            }`}
          >
            {aiDifficulty === "SELF_LEARNING" ? (
              <Brain className="w-3.5 h-3.5 text-fuchsia-300" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            <span>
              AI: {aiDifficulty === "SELF_LEARNING" ? `SELF-LEARNING (G#${telemetry.aiLab?.generation ?? 1})` : aiDifficulty}
            </span>
          </button>

          <button
            type="button"
            data-testid="toggle-ai-lab-btn"
            onClick={() => setShowAiLab((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              showAiLab
                ? "border-fuchsia-400 bg-fuchsia-600/35 text-fuchsia-100 shadow-[0_0_16px_rgba(217,70,239,0.35)]"
                : "border-fuchsia-400/40 bg-slate-900/85 text-fuchsia-300 hover:bg-slate-800"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>AI LAB &amp; PATHS</span>
            {telemetry.aiLab && (
              <span className="rounded bg-fuchsia-500/30 px-1.5 py-0.2 text-[10px] font-mono text-fuchsia-100">
                {Math.round(telemetry.aiLab.fleetAvgPavementPct)}% ON-TRACK
              </span>
            )}
          </button>

          {!telemetry.multiplayer?.active && !mpRef.current?.activeRoomId && (
            <div className="inline-flex items-center rounded-xl border border-white/20 bg-slate-900/85 p-0.5 text-[11px] font-black">
              {([1, 4, 8, 16] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  data-testid={`sim-speed-${spd}x-btn`}
                  onClick={() => {
                    setSimSpeedMult(spd);
                    simSpeedMultRef.current = spd;
                    try {
                      window.localStorage.setItem(
                        "gutsy_karts_ai_sim_speed",
                        String(spd)
                      );
                    } catch {
                      // ignore storage errors
                    }
                  }}
                  className={`rounded-lg px-2 py-1 transition cursor-pointer ${
                    simSpeedMult === spd
                      ? "bg-amber-400 text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={cycleCameraMode}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>[C] CAM: {telemetry.cameraMode}</span>
          </button>

          <button
            type="button"
            data-testid="toggle-music-btn"
            onClick={toggleMusicMute}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            {musicMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>[M] BGM: {musicMuted ? "MUTED" : "ON"}</span>
          </button>

          {!telemetry.multiplayer?.active && !mpRef.current?.activeRoomId && (
            <button
              type="button"
              onClick={() => {
                globalAiBrain.snapshotActiveTrackTraces();
                globalAiBrain.saveToStorage();
                mpRef.current?.leaveCurrentRoom(true);
                setScreen("EDITOR");
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/40 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-slate-800 transition cursor-pointer"
            >
              <Map className="w-3.5 h-3.5" />
              <span>MAP EDITOR</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleLeaveOnlineRaceToMenu}
            className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>ROSTER</span>
          </button>
        </div>

        {/* AI Telemetry, Path Recording & Self-Training Lab Panel */}
        {showAiLab && telemetry.aiLab && (
          <div
            data-testid="ai-training-lab-panel"
            className="pointer-events-auto mt-1 w-full max-w-3xl max-h-[calc(100vh-8.5rem)] overflow-y-auto rounded-2xl border border-fuchsia-400/50 bg-slate-950/92 p-3 text-xs text-slate-100 shadow-2xl backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-fuchsia-400" />
                <div>
                  <div className="font-black uppercase tracking-wider text-fuchsia-200 flex flex-wrap items-center gap-2">
                    <span>AI TELEMETRY, PATH RECORDER &amp; SELF-TRAINING LAB</span>
                    <span className="rounded-md bg-fuchsia-500/25 border border-fuchsia-400/50 px-1.5 py-0.5 text-[10px] font-mono">
                      GEN #{telemetry.aiLab.generation} • EPISODE #{telemetry.aiLab.episodesCompleted + 1}
                    </span>
                    <button
                      type="button"
                      data-testid="ai-lab-architecture-guide-btn"
                      onClick={() => setShowAiArchitectureGuide(true)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-fuchsia-400/50 bg-fuchsia-500/20 text-[9px] font-black text-fuchsia-200 hover:bg-fuchsia-400/35 hover:text-white transition cursor-pointer"
                      title="Open AI Self-Learning Technical Architecture Guide"
                    >
                      ?
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    (1+3) Elitist Neuro-Evolution (15 Drift-PD + 8-Weight Tanh Residual) • Champion Fitness:{" "}
                    <span className="font-bold text-emerald-300">
                      {telemetry.aiLab.championFitness.toFixed(1)}/100
                    </span>
                    {telemetry.aiLab.championBestLapMs && (
                      <span>
                        {" "}
                        • Best AI Lap: {formatRaceTime(telemetry.aiLab.championBestLapMs)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {!telemetry.multiplayer?.active && (
                  <>
                    <button
                      type="button"
                      data-testid="ai-lab-toggle-items-btn"
                      onClick={() => {
                        globalAiBrain.setItemsEnabled(!telemetry.aiLab?.itemsEnabled);
                        setPresetUpdateTick((t) => t + 1);
                      }}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase transition cursor-pointer ${
                        !telemetry.aiLab.itemsEnabled
                          ? "border-cyan-400 bg-cyan-500/25 text-cyan-200"
                          : "border-amber-400/70 bg-amber-500/20 text-amber-200"
                      }`}
                      title="Toggle items OFF for zero-RNG pure driving & character balance benchmarking, or ON for full combat"
                    >
                      ITEMS: {telemetry.aiLab.itemsEnabled ? "ON (COMBAT)" : "OFF (PURE DRIVING)"}
                    </button>

                    <button
                      type="button"
                      data-testid="ai-lab-toggle-track-mode-btn"
                      onClick={() => {
                        const curMode = telemetry.aiLab?.trainingTrackMode;
                        const nextMode =
                          curMode === "ROTATE_CUP"
                            ? "ALL_CUPS"
                            : curMode === "ALL_CUPS"
                            ? "SINGLE_TRACK"
                            : "ROTATE_CUP";
                        globalAiBrain.setTrainingTrackMode(nextMode);
                        setPresetUpdateTick((t) => t + 1);
                      }}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase transition cursor-pointer ${
                        telemetry.aiLab.trainingTrackMode === "ALL_CUPS"
                          ? "border-fuchsia-400 bg-fuchsia-500/25 text-fuchsia-200"
                          : telemetry.aiLab.trainingTrackMode === "ROTATE_CUP"
                          ? "border-indigo-400 bg-indigo-500/25 text-indigo-200"
                          : "border-white/15 bg-slate-900 text-slate-300 hover:text-white"
                      }`}
                      title="Cycle loop mode: Rotate current Cup (3 tracks) -> All-Cups Gauntlet (every Cup & track in catalog) -> Single Track repeat"
                    >
                      LOOP:{" "}
                      {telemetry.aiLab.trainingTrackMode === "ALL_CUPS"
                        ? "ALL-CUPS GAUNTLET"
                        : telemetry.aiLab.trainingTrackMode === "ROTATE_CUP"
                        ? "ROTATE CUP"
                        : "SINGLE TRACK"}
                    </button>

                    <button
                      type="button"
                      data-testid="ai-lab-toggle-autorepeat-btn"
                      onClick={() => {
                        const next = !autoRepeatTraining;
                        setAutoRepeatTraining(next);
                        autoRepeatTrainingRef.current = next;
                        if (next) {
                          const savedSpeed = getSavedAiSimSpeed();
                          setSimSpeedMult(savedSpeed);
                          simSpeedMultRef.current = savedSpeed;
                        }
                      }}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase transition cursor-pointer ${
                        autoRepeatTraining
                          ? "border-emerald-400 bg-emerald-500/25 text-emerald-200"
                          : "border-white/15 bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      AUTO-LOOP: {autoRepeatTraining ? "ON" : "OFF"}
                    </button>

                    {telemetry.standings.some((s) => s.isPlayer) ? (
                      <button
                        type="button"
                        data-testid="ai-lab-step-out-4ai-btn"
                        onClick={() => stepOutToSpectateActionRef.current?.()}
                        className="rounded-lg border border-fuchsia-400/60 bg-fuchsia-500/25 px-2 py-1 text-[10px] font-black uppercase text-fuchsia-200 hover:bg-fuchsia-500/35 cursor-pointer"
                      >
                        4-AI SIM MODE
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="ai-lab-jump-in-drive-btn"
                        onClick={() => jumpInToDriveActionRef.current?.()}
                        className="rounded-lg border border-amber-400/60 bg-amber-500/25 px-2 py-1 text-[10px] font-black uppercase text-amber-200 hover:bg-amber-500/35 cursor-pointer"
                      >
                        TAKE WHEEL
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowAiLab(false)}
                  className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  HIDE
                </button>
              </div>
            </div>

            {/* Fleet Objective Benchmark Cards (with Baseline Comparison) */}
            {(() => {
              const racersList = telemetry.aiLab.racers;
              const fleetBoostedCutPct =
                racersList.length > 0
                  ? racersList.reduce((acc, r) => acc + r.boostedOffRoadPct, 0) /
                    racersList.length
                  : 0;
              const fleetUnboostedDragPct =
                racersList.length > 0
                  ? racersList.reduce(
                      (acc, r) => acc + r.unboostedOffRoadPct,
                      0
                    ) / racersList.length
                  : 0;
              return (
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      ON-TRACK PAVEMENT/CURB
                    </div>
                    <div className="mt-0.5 text-sm font-black text-emerald-300 font-mono">
                      {telemetry.aiLab.fleetAvgPavementPct.toFixed(1)}%
                    </div>
                    {telemetry.aiLab.baselinePavementPct !== null && (
                      <div className="text-[9px] font-mono text-slate-400">
                        vs Base {telemetry.aiLab.baselinePavementPct.toFixed(1)}%
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      BOOSTED GRASS CUTS
                    </div>
                    <div className="mt-0.5 text-sm font-black text-cyan-300 font-mono">
                      {fleetBoostedCutPct.toFixed(1)}%
                    </div>
                    <div className="text-[9px] text-slate-400">
                      High-speed off-road shortcuts
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      UNBOOSTED OFF-ROAD DRAG
                    </div>
                    <div className="mt-0.5 text-sm font-black text-rose-300 font-mono">
                      {fleetUnboostedDragPct.toFixed(1)}%
                    </div>
                    <div className="text-[9px] text-slate-400">
                      Target: &lt; 8% grass drag
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      CROSS-TRACK PING-PONGS
                    </div>
                    <div className="mt-0.5 text-sm font-black text-amber-300 font-mono">
                      {telemetry.aiLab.fleetTotalPingPongs}
                    </div>
                    {telemetry.aiLab.baselinePingPongs !== null && (
                      <div className="text-[9px] font-mono text-slate-400">
                        vs Base {telemetry.aiLab.baselinePingPongs}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2">
                    <div className="text-[9px] font-bold uppercase text-slate-400">
                      FLEET FITNESS SCORE
                    </div>
                    <div className="mt-0.5 text-sm font-black text-fuchsia-300 font-mono">
                      {telemetry.aiLab.fleetAvgFitness.toFixed(1)} / 100
                    </div>
                    {telemetry.aiLab.baselineFitness !== null && (
                      <div className="text-[9px] font-mono text-slate-400">
                        vs Base {telemetry.aiLab.baselineFitness.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 2D Recorded Path & Telemetry Map + Per-Racer Table */}
            <div className="mt-2.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              {/* 2D SVG Path Trace Visualizer */}
              <div className="md:col-span-5 rounded-xl border border-white/10 bg-slate-900/95 p-2.5">
                {(() => {
                  const pts = trackDef.controlPoints;
                  let minX = -120,
                    maxX = 120,
                    minZ = -120,
                    maxZ = 120;
                  if (pts.length > 0) {
                    minX = Math.min(...pts.map((p) => p.x)) - 28;
                    maxX = Math.max(...pts.map((p) => p.x)) + 28;
                    minZ = Math.min(...pts.map((p) => p.z)) - 28;
                    maxZ = Math.max(...pts.map((p) => p.z)) + 28;
                  }
                  const spanX = Math.max(60, maxX - minX);
                  const spanZ = Math.max(60, maxZ - minZ);
                  const toSvgX = (wx: number) =>
                    ((wx - minX) / spanX) * 220 + 10;
                  const toSvgY = (wz: number) =>
                    ((maxZ - wz) / spanZ) * 150 + 10;
                  const trackPoly = pts
                    .map((p) => `${toSvgX(p.x).toFixed(1)},${toSvgY(p.z).toFixed(1)}`)
                    .join(" ");

                  // Spatial bottleneck clustering: group unboosted off-road scrub or true corner deceleration points
                  const bottleneckZones: { x: number; z: number; hits: number }[] = [];
                  for (const r of telemetry.aiLab.racers) {
                    const samples = r.pathSamples;
                    let combatCooldown = 0;
                    for (let sIdx = 12; sIdx < samples.length; sIdx++) {
                      const s = samples[sIdx];
                      const prev = samples[sIdx - 1];
                      const speedDrop = prev.speedRatio - s.speedRatio;
                      if (
                        s.combatDisrupted ||
                        prev.combatDisrupted ||
                        speedDrop > 0.24
                      ) {
                        combatCooldown = Math.max(
                          combatCooldown,
                          s.combatDisrupted ? 2 : 14
                        );
                      }
                      if (combatCooldown > 0) {
                        combatCooldown--;
                        continue;
                      }
                      const isUnboostedOffRoad =
                        s.surface === "OFFROAD" && !s.boosting;
                      const isCornerSpeedScrub =
                        s.speedRatio > 0.12 &&
                        s.speedRatio < 0.58 &&
                        speedDrop > 0.03 &&
                        speedDrop <= 0.22;
                      if (!isUnboostedOffRoad && !isCornerSpeedScrub) continue;
                      const existing = bottleneckZones.find(
                        (bz) => Math.hypot(bz.x - s.x, bz.z - s.z) < 22
                      );
                      if (existing) {
                        existing.hits += 1;
                      } else {
                        bottleneckZones.push({ x: s.x, z: s.z, hits: 1 });
                      }
                    }
                  }
                  const majorBottlenecks = bottleneckZones.filter(
                    (bz) => bz.hits >= 2
                  );

                  return (
                    <>
                      <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-300 mb-1.5 gap-1">
                        <span>RECORDED AI RACING PATHS (2D TRACE)</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-black uppercase ${
                              majorBottlenecks.length === 0
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                                : "bg-rose-500/25 text-rose-200 border border-rose-400/50"
                            }`}
                            title="Clusters where AI racers experienced unboosted off-road drag or sharp speed scrub"
                          >
                            {majorBottlenecks.length === 0
                              ? "0 BOTTLENECKS"
                              : `${majorBottlenecks.length} BOTTLENECK${
                                  majorBottlenecks.length > 1 ? "S" : ""
                                }`}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400 truncate max-w-[110px]">
                            {trackDef.name}
                          </span>
                        </div>
                      </div>
                      <svg
                        viewBox="0 0 240 170"
                        className="w-full h-36 rounded-lg bg-slate-950 border border-white/10"
                      >
                        {/* Track Road Ribbon */}
                        {pts.length > 2 && (
                          <>
                            <polygon
                              points={trackPoly}
                              fill="none"
                              stroke="rgba(148,163,184,0.28)"
                              strokeWidth="12"
                              strokeLinejoin="round"
                            />
                            <polygon
                              points={trackPoly}
                              fill="none"
                              stroke="rgba(255,255,255,0.18)"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                            />
                          </>
                        )}

                        {/* Recorded AI Racer Path Samples */}
                        {telemetry.aiLab.racers.map((racerSummary) => {
                          const samples = racerSummary.pathSamples;
                          if (samples.length < 2) return null;
                          return (
                            <g key={racerSummary.racerId}>
                              {samples.map((s, idx) => {
                                if (idx === 0) return null;
                                const prev = samples[idx - 1];
                                const strokeColor =
                                  s.surface === "OFFROAD"
                                    ? s.boosting
                                      ? "#38bdf8" // Cyan = Boosted Grass Shortcut!
                                      : "#f43f5e" // Rose = Unboosted Grass Drag
                                    : s.driftState === "DRIFT_ACTIVE"
                                    ? "#fbbf24" // Amber = Drifting on Pavement/Curb
                                    : "#34d399"; // Emerald = Clean Pavement
                                return (
                                  <line
                                    key={idx}
                                    x1={toSvgX(prev.x)}
                                    y1={toSvgY(prev.z)}
                                    x2={toSvgX(s.x)}
                                    y2={toSvgY(s.z)}
                                    stroke={strokeColor}
                                    strokeWidth="1.6"
                                    strokeOpacity="0.85"
                                  />
                                );
                              })}
                            </g>
                          );
                        })}

                        {/* Bottleneck / Unboosted Scrub Warning Markers */}
                        {majorBottlenecks.map((bz, idx) => {
                          const cx = toSvgX(bz.x);
                          const cy = toSvgY(bz.z);
                          return (
                            <g key={`bz-${idx}`}>
                              <circle
                                cx={cx}
                                cy={cy}
                                r={Math.min(9, 4.5 + bz.hits * 0.5)}
                                fill="rgba(244,63,94,0.22)"
                                stroke="#fb7185"
                                strokeWidth="1.2"
                                strokeDasharray="2 1.5"
                              />
                              <circle cx={cx} cy={cy} r="2" fill="#f43f5e" />
                            </g>
                          );
                        })}
                      </svg>
                    </>
                  );
                })()}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[9px] font-bold">
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> On-Track
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400" /> Drifting
                  </span>
                  <span className="inline-flex items-center gap-1 text-cyan-300">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" /> Boosted Cut
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-300">
                    <span className="h-2 w-2 rounded-full border border-rose-300 bg-rose-500/40" /> Bottleneck Scrub
                  </span>
                </div>
              </div>

              {/* Per-Racer Telemetry Table */}
              <div className="md:col-span-7 rounded-xl border border-white/10 bg-slate-900/95 p-2.5 overflow-x-auto">
                <div className="text-[10px] font-black uppercase text-slate-300 mb-1.5">
                  LIVE AI RACER TELEMETRY &amp; DRIFT EFFICIENCY
                </div>
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase">
                      <th className="py-1 pr-2">Racer</th>
                      <th className="py-1 px-1.5">Fit</th>
                      <th className="py-1 px-1.5">On-Trk</th>
                      <th className="py-1 px-1.5">Bst-Cut</th>
                      <th className="py-1 px-1.5">Drag</th>
                      <th className="py-1 px-1.5" title="Mini-Turbos Fired (Blue / Orange / Purple) vs Aborted">
                        MT (B/O/P)
                      </th>
                      <th className="py-1 px-1.5" title="Cross-Track Ping-Pong Overshoots">
                        PingPong
                      </th>
                      <th className="py-1 px-1.5" title="Peak Jump Air Height above road surface (and Jump count)">
                        Max Air
                      </th>
                      <th className="py-1 px-1.5" title="Items Used / Hits Landed / Defensive Blocks">
                        Combat (U/H/B)
                      </th>
                      <th className="py-1 pl-1.5">RMS Off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.aiLab.racers.map((r) => (
                      <tr
                        key={r.racerId}
                        className="border-b border-white/5 font-mono text-slate-200"
                      >
                        <td className="py-1 pr-2 font-sans font-bold text-white truncate max-w-[95px]">
                          #{r.slotIndex + 1} {r.racerName}
                        </td>
                        <td className="py-1 px-1.5 font-bold text-fuchsia-300">
                          {r.fitnessScore.toFixed(0)}
                        </td>
                        <td className="py-1 px-1.5 text-emerald-300">
                          {(r.pavementPct + r.curbPct).toFixed(0)}%
                        </td>
                        <td className="py-1 px-1.5 text-cyan-300">
                          {r.boostedOffRoadPct.toFixed(0)}%
                        </td>
                        <td className="py-1 px-1.5 text-rose-300">
                          {r.unboostedOffRoadPct.toFixed(0)}%
                        </td>
                        <td className="py-1 px-1.5 text-amber-300">
                          {r.tier1Count}/{r.tier2Count}/{r.tier3Count}
                          <span className="text-slate-500"> ({r.abortedDrifts}x)</span>
                        </td>
                        <td className="py-1 px-1.5 text-amber-200">
                          {r.pingPongCrossings}
                        </td>
                        <td className="py-1 px-1.5 text-sky-300">
                          {r.maxJumpHeightMeters.toFixed(1)}m
                          <span className="text-slate-500"> ({r.jumpsCount}j)</span>
                        </td>
                        <td className="py-1 px-1.5 text-indigo-300">
                          {r.itemsUsed ?? 0}/{r.itemHitsLanded ?? 0}/{r.defensiveBlocks ?? 0}
                        </td>
                        <td className="py-1 pl-1.5 text-slate-300">
                          {r.rmsLateralOffset.toFixed(1)}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Dataset Preset Manager: Save Trained Model to EASY / MEDIUM / HARD */}
                <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="text-[9px] font-bold uppercase text-slate-400">
                    ASSIGN TRAINED DATASET TO DIFFICULTY:
                    <span className="hidden">{presetUpdateTick}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(["EASY", "MEDIUM", "HARD"] as const).map((slotDiff) => {
                      const hasPreset =
                        telemetry.aiLab?.useTrainedPresets[slotDiff] ?? false;
                      const savedSlot =
                        telemetry.aiLab?.savedPresetSlots[slotDiff];
                      return (
                        <div key={slotDiff} className="inline-flex items-center">
                          <button
                            type="button"
                            data-testid={`save-preset-${slotDiff.toLowerCase()}-btn`}
                            onClick={() => {
                              globalAiBrain.saveChampionToPreset(slotDiff);
                              setPresetUpdateTick((t) => t + 1);
                            }}
                            className={`rounded-l-md border px-2 py-0.5 text-[9px] font-black uppercase transition cursor-pointer ${
                              hasPreset
                                ? "border-emerald-400/70 bg-emerald-500/25 text-emerald-200"
                                : "border-white/15 bg-slate-800 text-slate-300 hover:text-white"
                            }`}
                            title={`Save current Champion self-trained genome as the active dataset for ${slotDiff} difficulty`}
                          >
                            SAVE → {slotDiff} {hasPreset ? "✓" : ""}
                          </button>
                          {savedSlot && (
                            <button
                              type="button"
                              onClick={() => {
                                globalAiBrain.toggleUseTrainedPreset(slotDiff);
                                setPresetUpdateTick((t) => t + 1);
                              }}
                              className="rounded-r-md border border-l-0 border-rose-400/50 bg-rose-950/80 px-1.5 py-0.5 text-[9px] font-black text-rose-300 hover:bg-rose-900 cursor-pointer"
                              title={`Toggle trained dataset for ${slotDiff} on/off`}
                            >
                              {hasPreset ? "×" : "ON"}
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      data-testid="copy-ai-report-btn"
                      onClick={() => {
                        const reportText = globalAiBrain.formatClipboardReport(
                          aiDifficultyRef.current,
                          trackDef.name
                        );
                        if (navigator?.clipboard?.writeText) {
                          navigator.clipboard.writeText(reportText);
                          setCopiedAiReport(true);
                          setTimeout(() => setCopiedAiReport(false), 2500);
                        }
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase transition cursor-pointer ${
                        copiedAiReport
                          ? "border-emerald-400 bg-emerald-500/30 text-emerald-200"
                          : "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30"
                      }`}
                      title="Copy full AI Training & Character Balance Advisor report to clipboard to paste in chat"
                    >
                      {copiedAiReport ? "COPIED REPORT ✓" : "COPY REPORT FOR AI"}
                    </button>

                    <button
                      type="button"
                      data-testid="export-ai-brain-json-btn"
                      onClick={() => {
                        const json = globalAiBrain.exportBrainDatasetJson();
                        const blob = new Blob([json], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `gutsy_karts_ai_model_gen${telemetry.aiLab?.generation ?? 1}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-400/50 bg-cyan-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
                    >
                      <Download className="w-2.5 h-2.5" /> EXPORT JSON
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Cumulative Character Balance & Auto-Tuning Advisor */}
            <div className="mt-2.5 rounded-xl border border-white/10 bg-slate-900/95 p-2.5 overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase text-amber-300">
                    CHARACTER BALANCE MATRIX &amp; AUTO-TUNING ADVISOR (TARGET: 25% WIN RATE EACH)
                  </span>
                  <button
                    type="button"
                    data-testid="ai-lab-balance-guide-btn"
                    onClick={() => setShowBalanceGuide(true)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/20 text-[9px] font-black text-cyan-200 hover:bg-cyan-400/35 hover:text-white transition cursor-pointer"
                    title="Open Asymmetric Archetype & Balance Philosophy Guide"
                  >
                    ?
                  </button>
                  <span className="ml-1 text-[9px] text-slate-400">
                    Starting grid &amp; genome slots rotate every episode for fair benchmarking
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="ai-lab-toggle-autobalance-btn"
                    onClick={() => {
                      globalAiBrain.setAutoBalanceRosterEnabled(
                        !telemetry.aiLab?.autoBalanceRosterEnabled
                      );
                      setPresetUpdateTick((t) => t + 1);
                    }}
                    className={`rounded-md border px-2 py-0.5 text-[9px] font-black uppercase transition cursor-pointer ${
                      telemetry.aiLab.autoBalanceRosterEnabled
                        ? "border-emerald-400 bg-emerald-500/25 text-emerald-200"
                        : "border-white/15 bg-slate-800 text-slate-300 hover:text-white"
                    }`}
                    title="Dynamically apply empirical stat equalization so all 4 characters converge toward a 25% win rate"
                  >
                    AUTO-BALANCE ROSTER:{" "}
                    {telemetry.aiLab.autoBalanceRosterEnabled ? "ON ✓" : "OFF"}
                  </button>
                  <button
                    type="button"
                    data-testid="ai-lab-reset-balance-btn"
                    onClick={() => {
                      globalAiBrain.resetCharacterBalanceStats();
                      setPresetUpdateTick((t) => t + 1);
                    }}
                    className="rounded-md border border-white/15 bg-slate-800 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-300 hover:text-white cursor-pointer"
                    title="Reset only the Character Win % / Lap Time balance counters while keeping your trained AI driving model"
                  >
                    RESET BALANCE STATS
                  </button>
                  <button
                    type="button"
                    data-testid="ai-lab-reset-brain-btn"
                    onClick={() => {
                      globalAiBrain.resetBrainToSeed(true);
                      setPresetUpdateTick((t) => t + 1);
                    }}
                    className="rounded-md border border-rose-400/50 bg-rose-950/70 px-2 py-0.5 text-[9px] font-black uppercase text-rose-200 hover:bg-rose-900 cursor-pointer"
                    title="Wipe all self-learning generations back to Gen #1 • Episode #1 and clear character balance stats"
                  >
                    RESET AI MODEL (GEN 1)
                  </button>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase">
                    <th className="py-1 pr-2">Character</th>
                    <th className="py-1 px-1.5">Races</th>
                    <th className="py-1 px-1.5">Win %</th>
                    <th className="py-1 px-1.5">Avg Rank</th>
                    <th
                      className="py-1 px-1.5"
                      title="Overall Avg Lap (Lap 1 Traffic Avg / Lap 2+ Flying Avg)"
                    >
                      Avg Lap (L1 / Fly)
                    </th>
                    <th
                      className="py-1 px-1.5"
                      title="Heavy Collisions Given (Shoves) / Light Knockbacks Taken (Hits) per race"
                    >
                      Bumps (Give/Take)
                    </th>
                    <th
                      className="py-1 px-1.5"
                      title="Average Mini-Turbos fired per race"
                    >
                      MTs
                    </th>
                    <th
                      className="py-1 px-1.5"
                      title="Peak Air Height / Avg Peak Air Height per race"
                    >
                      Max Air
                    </th>
                    <th className="py-1 px-1.5">Pace Δ</th>
                    <th className="py-1 pl-1.5">Balance Advisor Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetry.aiLab.characterBalance.map((cb) => {
                    const winDelta = cb.winRatePct - 25;
                    const winColor =
                      cb.racesCompleted < 2
                        ? "text-slate-400"
                        : Math.abs(winDelta) <= 5
                        ? "text-emerald-300"
                        : winDelta > 5
                        ? "text-amber-300"
                        : "text-rose-300";
                    return (
                      <tr
                        key={cb.characterId}
                        className="border-b border-white/5 font-mono text-slate-200"
                      >
                        <td className="py-1 pr-2 font-sans font-bold text-white">
                          {cb.characterName}
                        </td>
                        <td className="py-1 px-1.5 text-slate-300">
                          {cb.racesCompleted}
                        </td>
                        <td className={`py-1 px-1.5 font-bold ${winColor}`}>
                          {cb.racesCompleted > 0 ? `${cb.winRatePct.toFixed(0)}%` : "--"}
                          {cb.racesCompleted > 0 && (
                            <span className="text-[9px] text-slate-500">
                              {" "}
                              ({cb.wins}W)
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 text-slate-200">
                          {cb.racesCompleted > 0 ? cb.avgFinishRank.toFixed(2) : "--"}
                        </td>
                        <td className="py-1 px-1.5 text-cyan-300">
                          {cb.avgLapMs ? formatRaceTime(cb.avgLapMs) : "--"}
                          {cb.avgLap1Ms && cb.avgFlyingLapMs && (
                            <span className="ml-1 text-[9px] text-slate-400">
                              ({formatRaceTime(cb.avgLap1Ms)} /{" "}
                              {formatRaceTime(cb.avgFlyingLapMs)})
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 text-orange-300">
                          {cb.racesCompleted > 0
                            ? `${cb.avgShovesPerRace.toFixed(1)} / ${cb.avgHitsTakenPerRace.toFixed(1)}`
                            : "--"}
                        </td>
                        <td className="py-1 px-1.5 text-fuchsia-300">
                          {cb.racesCompleted > 0
                            ? cb.avgMiniTurbosPerRace.toFixed(1)
                            : "--"}
                        </td>
                        <td className="py-1 px-1.5 text-sky-300">
                          {cb.racesCompleted > 0
                            ? `${cb.peakJumpHeightMeters.toFixed(1)}m / ${cb.avgMaxJumpHeightMeters.toFixed(1)}m`
                            : "--"}
                        </td>
                        <td
                          className={`py-1 px-1.5 ${
                            cb.paceDeltaPct < -0.4
                              ? "text-emerald-300"
                              : cb.paceDeltaPct > 0.4
                              ? "text-rose-300"
                              : "text-slate-400"
                          }`}
                        >
                          {cb.avgLapMs
                            ? `${cb.paceDeltaPct > 0 ? "+" : ""}${cb.paceDeltaPct.toFixed(1)}%`
                            : "--"}
                        </td>
                        <td className="py-1 pl-1.5 font-sans text-[10px] text-amber-200">
                          {cb.recommendation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Live 4-Slot Racer Standings Pill List (Shown on left when AI Lab is closed) */}
        {!(showAiLab && telemetry.aiLab) && (
          <div
            data-testid="hud-live-standings"
            className="pointer-events-auto hidden sm:flex flex-col gap-1 rounded-2xl border border-white/15 bg-slate-950/75 p-2.5 backdrop-blur-md w-64"
          >
            {telemetry.multiplayer?.isSpectating && (
              <div className="text-[9px] font-black uppercase tracking-wider text-fuchsia-300 px-1 pb-0.5 flex items-center justify-between">
                <span>CLICK TO WATCH OR ASSUME AI</span>
                <span>
                  {telemetry.multiplayer.spectateAutoDirector
                    ? "LEAD CAM"
                    : `SLOT #${telemetry.multiplayer.spectatedSlotIndex + 1}`}
                </span>
              </div>
            )}
            {telemetry.standings.map((r) => {
              const isSpectated =
                Boolean(telemetry.multiplayer?.isSpectating) &&
                telemetry.multiplayer?.spectatedSlotIndex === r.slotIndex;
              const isHuman = Boolean(
                r.isPlayer ||
                  r.isRemoteHuman ||
                  r.controllerLabel === "YOU" ||
                  r.controllerLabel === "ONLINE"
              );
              const canAssumeThisAi =
                Boolean(telemetry.multiplayer?.isSpectating) && !isHuman;
              return (
                <div
                  key={r.racerId}
                  onClick={() => {
                    if (
                      telemetry.multiplayer?.isSpectating &&
                      r.slotIndex !== undefined
                    ) {
                      spectateAutoDirectorRef.current = false;
                      spectateSlotIndexRef.current = r.slotIndex;
                    }
                  }}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    telemetry.multiplayer?.isSpectating
                      ? "cursor-pointer hover:bg-white/10"
                      : ""
                  } ${
                    isSpectated
                      ? "bg-fuchsia-500/25 border border-fuchsia-400/60 text-white"
                      : r.isPlayer
                      ? "bg-amber-400/20 border border-amber-400/50 text-white"
                      : r.isRemoteHuman
                      ? "bg-cyan-500/15 border border-cyan-400/40 text-cyan-100"
                      : "text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate pr-1">
                    <span className="font-black text-amber-300 w-6 shrink-0">
                      {ordinalSuffix(r.rank)}
                    </span>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    <div className="truncate">
                      <span className="truncate font-extrabold">{r.name}</span>
                      {isHuman &&
                        r.characterName &&
                        r.name !== r.characterName && (
                          <span className="ml-1 text-[9px] font-semibold text-slate-400">
                            ({r.characterName.split(" ")[0]})
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isSpectated && (
                      <span className="rounded bg-fuchsia-400 px-1 py-0.2 text-[8px] font-black uppercase text-slate-950">
                        CAM
                      </span>
                    )}
                    {canAssumeThisAi && r.slotIndex !== undefined && (
                      <button
                        type="button"
                        data-testid={`assume-ai-slot-btn-${r.slotIndex}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpInToDriveActionRef.current?.(r.slotIndex);
                        }}
                        className="rounded bg-emerald-400 hover:bg-emerald-300 px-1.5 py-0.2 text-[8px] font-black uppercase text-slate-950 transition cursor-pointer"
                        title={`Take over ${r.name} at their current track position`}
                      >
                        ASSUME
                      </button>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase ${
                        r.controllerLabel === "YOU"
                          ? "bg-amber-400 text-slate-950"
                          : r.controllerLabel === "ONLINE"
                          ? "bg-cyan-400 text-slate-950"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {r.controllerLabel === "YOU"
                        ? "YOU"
                        : r.controllerLabel === "ONLINE"
                        ? "HUMAN"
                        : "AI BOT"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* OIL SQUALL HUD VISOR SPLATTER OVERLAY */}
      {(telemetry.oilSquallRemaining ?? 0) > 0 && (
        <div
          data-testid="oil-squall-visor-overlay"
          className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
        >
          <div
            className="absolute -top-10 left-1/4 h-56 w-72 rounded-full bg-slate-950/85 blur-xl border border-fuchsia-500/20"
            style={{ transform: "rotate(-14deg)" }}
          />
          <div
            className="absolute top-16 right-1/5 h-64 w-64 rounded-full bg-slate-950/85 blur-xl border border-cyan-500/20"
            style={{ transform: "rotate(22deg)" }}
          />
          <div
            className="absolute bottom-24 left-1/3 h-48 w-64 rounded-full bg-slate-950/80 blur-xl border border-amber-500/20"
            style={{ transform: "rotate(9deg)" }}
          />
        </div>
      )}

      {/* TOP-CENTER HUD: Power-Up Item Slot & Event Banners */}
      <div className="pointer-events-none fixed top-3 inset-x-0 z-20 flex flex-col items-center gap-2 px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border-2 border-white/25 bg-slate-950/85 px-4 py-2 backdrop-blur-md shadow-2xl">
          <div
            className={`relative flex h-12 w-12 items-center justify-center rounded-xl border-2 font-black text-xs ${
              telemetry.rouletteSpinning
                ? "border-cyan-400 bg-cyan-950/70 text-cyan-200 animate-spin"
                : heldItemMeta
                ? "border-amber-400 bg-amber-500/20 text-amber-300"
                : "border-white/15 bg-slate-900 text-slate-500"
            }`}
          >
            {telemetry.rouletteSpinning ? (
              <Sparkles className="w-6 h-6 text-cyan-300" />
            ) : heldItemMeta ? (
              <Zap className="w-6 h-6 text-amber-300" />
            ) : (
              <span>NONE</span>
            )}
            {!telemetry.rouletteSpinning &&
              heldItemMeta &&
              (telemetry.heldItemCharges ?? 1) > 1 && (
                <span className="absolute -bottom-1.5 -right-1.5 rounded-full border border-white/40 bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950 shadow">
                  x{telemetry.heldItemCharges}
                </span>
              )}
          </div>

          <div className="min-w-[140px] sm:min-w-[190px]">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              {telemetry.multiplayer?.isSpectating
                ? `SPECTATING: ${telemetry.multiplayer.spectatedRacerName}`
                : telemetry.rouletteSpinning
                ? "ITEM ROULETTE..."
                : telemetry.spinOutActive
                ? "SPINNING OUT — ITEM LOCKED"
                : (telemetry.goldenOverclockRemaining ?? 0) > 0
                ? `GOLDEN OVERCLOCK (${telemetry.goldenOverclockRemaining}s) — MASH [E]!`
                : "POWER-UP SLOT [E / TAP]"}
            </div>
            <div
              data-testid="hud-held-item"
              className="text-sm sm:text-base font-black text-white uppercase flex items-center gap-1.5"
            >
              <span>{heldItemMeta ? heldItemMeta.name : "Collect Item Prism"}</span>
              {!telemetry.rouletteSpinning &&
                heldItemMeta &&
                (telemetry.heldItemCharges ?? 1) > 1 && (
                  <span className="rounded bg-amber-400/25 border border-amber-300/60 px-1.5 py-0.2 text-[10px] font-mono text-amber-200">
                    {telemetry.heldItemCharges} CHARGES
                  </span>
                )}
              {(telemetry.goldenOverclockRemaining ?? 0) > 0 && (
                <span className="rounded bg-amber-400 px-1.5 py-0.2 text-[10px] font-mono font-black text-slate-950">
                  {telemetry.goldenOverclockRemaining}s
                </span>
              )}
            </div>
            {heldItemMeta && (
              <div className="hidden sm:block text-[11px] text-slate-300 max-w-xs truncate">
                {heldItemMeta.description}
              </div>
            )}
          </div>

          {!telemetry.multiplayer?.isSpectating &&
            telemetry.heldItem &&
            !telemetry.rouletteSpinning && (
              <button
                type="button"
                data-testid="hud-use-item-btn"
                disabled={Boolean(telemetry.spinOutActive)}
                onClick={() => {
                  if (!telemetry.spinOutActive) {
                    pendingEdgesRef.current.useItemJustPressed = true;
                  }
                }}
                className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition ${
                  telemetry.spinOutActive
                    ? "bg-rose-950/80 border border-rose-400/50 text-rose-300 opacity-60 cursor-not-allowed"
                    : "bg-amber-400 text-slate-950 hover:bg-amber-300 active:scale-95 cursor-pointer"
                }`}
              >
                {telemetry.spinOutActive ? "SPINNING OUT!" : "[E] USE ITEM"}
              </button>
            )}
        </div>

        {/* Dynamic Event Banners (Juggernaut Collisions, Active Boosts, Item Hits, Wrong Way) */}
        {telemetry.wrongWay && (
          <div className="rounded-xl border-2 border-red-400 bg-red-600/90 px-4 py-1 text-xs font-black tracking-widest text-white uppercase animate-bounce">
            WRONG WAY! TURN AROUND
          </div>
        )}
        {(telemetry.oilSquallRemaining ?? 0) > 0 && (
          <div className="rounded-full border border-fuchsia-400 bg-slate-950/90 px-4 py-1 text-xs font-black tracking-wider text-fuchsia-200 uppercase shadow-lg">
            🛢️ SLICK-CLOUD OIL VISOR ({telemetry.oilSquallRemaining}s) — -20% GRIP (BOOST TO CLEAR)
          </div>
        )}
        {telemetry.activeBoostLabel && (
          <div
            data-testid="hud-boost-banner"
            className="rounded-full border border-amber-300 bg-gradient-to-r from-amber-500/90 to-fuchsia-600/90 px-4 py-1 text-xs font-black tracking-wider text-white uppercase shadow-lg"
          >
            ⚡ {telemetry.activeBoostLabel}
          </div>
        )}
        {telemetry.lastCollisionBanner && (
          <div
            data-testid="hud-collision-banner"
            className="rounded-xl border border-amber-400/60 bg-slate-950/90 px-4 py-1.5 text-xs font-bold text-amber-300 shadow-lg"
          >
            💥 {telemetry.lastCollisionBanner}
          </div>
        )}
        {telemetry.lastItemBanner && (
          <div
            data-testid="hud-item-banner"
            className="rounded-xl border border-cyan-400/50 bg-slate-950/85 px-4 py-1 text-xs font-bold text-cyan-200 shadow-md"
          >
            🎯 {telemetry.lastItemBanner}
          </div>
        )}
      </div>

      {/* TOP-RIGHT / RIGHT HUD: 2D SVG Mini-Map + Speedometer, Surface & Drift Charge Meter */}
      <div className="pointer-events-none fixed top-3 right-3 sm:top-5 sm:right-5 z-20 flex flex-col items-end gap-2.5">
        {/* 2D SVG Mini-Map plotting spline & all 4 racers (Human callsigns vs AI highlighted) */}
        <div className="rounded-2xl border border-white/20 bg-slate-950/80 p-2.5 backdrop-blur-md shadow-xl">
          <div className="mb-1 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Compass className="w-3 h-3 text-cyan-400" /> CIRCUIT RADAR
            </span>
            <span className="text-amber-300">4 KARTS</span>
          </div>
          <svg
            data-testid="hud-minimap"
            viewBox={miniMapMeta.viewBox}
            className="h-28 w-28 sm:h-36 sm:w-36 rounded-xl bg-slate-900/90 border border-white/10"
          >
            {/* Outer Curb Glow */}
            <path
              d={miniMapMeta.svgPath}
              fill="none"
              stroke="#ef4444"
              strokeWidth="22"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.35"
            />
            {/* Main Road Spline */}
            <path
              d={miniMapMeta.svgPath}
              fill="none"
              stroke="#334155"
              strokeWidth="15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={miniMapMeta.svgPath}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2.8"
              strokeDasharray="9 9"
            />
            {/* Checkered Start/Finish Line Strip */}
            <g
              data-testid="minimap-finish-line"
              transform={`translate(${miniMapMeta.finishX.toFixed(1)}, ${miniMapMeta.finishY.toFixed(1)}) rotate(${miniMapMeta.finishAngleDeg.toFixed(1)})`}
            >
              <rect
                x={-13}
                y={-5.5}
                width={26}
                height={11}
                rx={1.5}
                fill="#0f172a"
                stroke="#f8fafc"
                strokeWidth={1.2}
              />
              {[0, 1].map((row) =>
                [0, 1, 2, 3, 4, 5].map((col) => (
                  <rect
                    key={`${row}-${col}`}
                    x={-12 + col * 4}
                    y={-4.5 + row * 4.5}
                    width={4}
                    height={4.5}
                    fill={(row + col) % 2 === 0 ? "#f8fafc" : "#0f172a"}
                  />
                ))
              )}
            </g>

            {/* 4 Racers */}
            {telemetry.standings.map((r) => {
              const isHeavy = r.mass >= 200 || r.effectiveMass >= 9999;
              const isFeather = r.mass <= 60;
              const isHuman = Boolean(r.isPlayer || r.isRemoteHuman);
              const radius = r.isPlayer ? 13.5 : isHeavy ? 12.0 : isFeather ? 8.8 : 10.2;
              return (
                <g key={r.racerId}>
                  <circle
                    cx={r.worldX}
                    cy={-r.worldZ}
                    r={radius}
                    fill={r.color}
                    stroke={
                      r.isPlayer
                        ? "#ffffff"
                        : r.isRemoteHuman
                        ? "#22d3ee"
                        : "#0f172a"
                    }
                    strokeWidth={isHuman ? 4.2 : 2.5}
                  />
                  {isHuman && (
                    <text
                      x={r.worldX}
                      y={-r.worldZ - radius - 5}
                      textAnchor="middle"
                      fill={r.isPlayer ? "#fde047" : "#67e8f9"}
                      stroke="#020617"
                      strokeWidth="3.2"
                      paintOrder="stroke"
                      fontSize="15"
                      fontWeight="900"
                    >
                      {r.name.slice(0, 10)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Digital Speedometer + Terrain Surface + 3-Stage Drift Charge Meter */}
        <div className="w-48 sm:w-56 rounded-2xl border border-white/20 bg-slate-950/85 p-3 backdrop-blur-md shadow-xl">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              SPEED
            </span>
            <div>
              <span
                data-testid="hud-speed"
                className="font-mono text-2xl sm:text-3xl font-black text-white"
              >
                {telemetry.speed}
              </span>
              <span className="ml-1 text-[10px] font-bold text-slate-400">
                KM/H
              </span>
            </div>
          </div>

          {/* Terrain Surface Badge */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              SURFACE
            </span>
            <span
              data-testid="hud-surface"
              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                telemetry.surface === "PAVEMENT"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : telemetry.surface === "CURB"
                  ? "bg-amber-500/25 text-amber-300 border border-amber-400/40"
                  : telemetry.prolongedRocketBoostActive
                  ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50"
                  : "bg-red-500/30 text-red-300 border border-red-400/50 animate-pulse"
              }`}
            >
              {telemetry.surface === "PAVEMENT"
                ? "PAVEMENT (100%)"
                : telemetry.surface === "CURB"
                ? "RUMBLE CURB (98%)"
                : telemetry.prolongedRocketBoostActive
                ? "OFF-ROAD IMMUNITY (PRB)"
                : "OFF-ROAD SLOWDOWN (55%)"}
            </span>
          </div>

          {/* 5-Phase Manual Alternation & Multi-Stage Mini-Turbo Drift Charge Meter */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] font-black uppercase">
              <span className="text-slate-400">DRIFT SPARKS</span>
              <span
                data-testid="hud-drift-tier"
                className={
                  telemetry.miniTurboTier === 3
                    ? "text-fuchsia-300"
                    : telemetry.miniTurboTier === 2
                    ? "text-orange-300"
                    : telemetry.miniTurboTier === 1
                    ? "text-cyan-300"
                    : "text-slate-500"
                }
              >
                {telemetry.miniTurboTier === 3
                  ? "ULTRA PURPLE (+55%)"
                  : telemetry.miniTurboTier === 2
                  ? "SUPER ORANGE (+40%)"
                  : telemetry.driftChargeSubState === 4
                  ? "ORANGE SPARKS (+25%)"
                  : telemetry.miniTurboTier === 1 &&
                    telemetry.driftChargeSeconds >=
                      PHYSICS_CONSTANTS.TIER1_THRESHOLD_SEC
                  ? "MINI BLUE (+25%)"
                  : telemetry.miniTurboTier === 1
                  ? "BLUE SPARKS [PUMP 2/2]"
                  : telemetry.driftState === "DRIFT_ACTIVE"
                  ? telemetry.driftChargeSubState === 1
                    ? "GRAY SMOKE [PUMP 1/2]"
                    : "GRAY SMOKE [PUMP ↔]"
                  : "READY [HOP+STEER]"}
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full rounded-full bg-slate-800 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  telemetry.miniTurboTier === 3
                    ? "bg-gradient-to-r from-fuchsia-400 to-purple-600"
                    : telemetry.miniTurboTier === 2 ||
                      telemetry.driftChargeSubState === 4
                    ? "bg-gradient-to-r from-amber-400 to-orange-600"
                    : telemetry.miniTurboTier === 1
                    ? "bg-gradient-to-r from-cyan-400 to-blue-600"
                    : "bg-slate-400"
                }`}
                style={{ width: `${driftChargeProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live 4-Slot Racer Standings Pill List (Docked under Speedometer on right when AI Lab is open so left column never overflows) */}
        {showAiLab && telemetry.aiLab && (
          <div
            data-testid="hud-live-standings"
            className="pointer-events-auto hidden sm:flex flex-col gap-1 rounded-2xl border border-white/15 bg-slate-950/80 p-2.5 backdrop-blur-md w-56 shadow-xl"
          >
            {telemetry.multiplayer?.isSpectating && (
              <div className="text-[9px] font-black uppercase tracking-wider text-fuchsia-300 px-1 pb-0.5 flex items-center justify-between">
                <span>WATCH / ASSUME AI</span>
                <span>
                  {telemetry.multiplayer.spectateAutoDirector
                    ? "LEAD CAM"
                    : `SLOT #${telemetry.multiplayer.spectatedSlotIndex + 1}`}
                </span>
              </div>
            )}
            {telemetry.standings.map((r) => {
              const isSpectated =
                Boolean(telemetry.multiplayer?.isSpectating) &&
                telemetry.multiplayer?.spectatedSlotIndex === r.slotIndex;
              const isHuman = Boolean(
                r.isPlayer ||
                  r.isRemoteHuman ||
                  r.controllerLabel === "YOU" ||
                  r.controllerLabel === "ONLINE"
              );
              const canAssumeThisAi =
                Boolean(telemetry.multiplayer?.isSpectating) && !isHuman;
              return (
                <div
                  key={r.racerId}
                  onClick={() => {
                    if (
                      telemetry.multiplayer?.isSpectating &&
                      r.slotIndex !== undefined
                    ) {
                      spectateAutoDirectorRef.current = false;
                      spectateSlotIndexRef.current = r.slotIndex;
                    }
                  }}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                    telemetry.multiplayer?.isSpectating
                      ? "cursor-pointer hover:bg-white/10"
                      : ""
                  } ${
                    isSpectated
                      ? "bg-fuchsia-500/25 border border-fuchsia-400/60 text-white"
                      : r.isPlayer
                      ? "bg-amber-400/20 border border-amber-400/50 text-white"
                      : r.isRemoteHuman
                      ? "bg-cyan-500/15 border border-cyan-400/40 text-cyan-100"
                      : "text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate pr-1">
                    <span className="font-black text-amber-300 w-6 shrink-0">
                      {ordinalSuffix(r.rank)}
                    </span>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    <div className="truncate">
                      <span className="truncate font-extrabold">{r.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isSpectated && (
                      <span className="rounded bg-fuchsia-400 px-1 py-0.2 text-[8px] font-black uppercase text-slate-950">
                        CAM
                      </span>
                    )}
                    {canAssumeThisAi && r.slotIndex !== undefined && (
                      <button
                        type="button"
                        data-testid={`assume-ai-slot-btn-${r.slotIndex}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpInToDriveActionRef.current?.(r.slotIndex);
                        }}
                        className="rounded bg-emerald-400 hover:bg-emerald-300 px-1.5 py-0.2 text-[8px] font-black uppercase text-slate-950 transition cursor-pointer"
                        title={`Take over ${r.name} at their current track position`}
                      >
                        ASSUME
                      </button>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase ${
                        r.controllerLabel === "YOU"
                          ? "bg-amber-400 text-slate-950"
                          : r.controllerLabel === "ONLINE"
                          ? "bg-cyan-400 text-slate-950"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {r.controllerLabel === "YOU"
                        ? "YOU"
                        : r.controllerLabel === "ONLINE"
                        ? "HUMAN"
                        : "AI BOT"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* COUNTDOWN OVERLAY */}
      {telemetry.racePhase === "COUNTDOWN" && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="rounded-3xl border-2 border-amber-400/60 bg-slate-950/85 px-10 py-6 text-center backdrop-blur-md shadow-2xl">
            <div className="text-xs font-black uppercase tracking-widest text-amber-300">
              {activeCup?.name} • RACE {selectedTrackIdx + 1} OF {totalCupTracks}
            </div>
            <div className="text-sm font-bold text-slate-300 mt-0.5">
              {(joinedTrackOverrideRef.current ?? trackDef).name}
            </div>
            <div className="mt-1 text-6xl sm:text-7xl font-black text-white">
              {telemetry.countdownValue}
            </div>
          </div>
        </div>
      )}

      {/* AI SELF-LEARNING MODE BOTTOM-CENTER BUILD STAMP */}
      {(aiDifficulty === "SELF_LEARNING" || allAiSimModeRef.current || showAiLab) && (
        <div
          data-testid="ai-build-version-stamp"
          className="pointer-events-none fixed bottom-2 inset-x-0 z-40 flex justify-center px-4"
        >
          <div className="rounded-full border border-white/20 bg-slate-950/80 px-3.5 py-1 text-[11px] font-mono font-semibold tracking-wide text-white shadow-lg backdrop-blur-sm">
            {BUILD_INFO_STAMP}
          </div>
        </div>
      )}

      {/* DEDICATED SERVER & SPECTATOR TV CONTROL BAR OR MOBILE TOUCH JOYSTICK */}
      {telemetry.multiplayer?.isSpectating ? (
        <div
          data-testid="dedicated-spectator-bar"
          className="fixed bottom-9 inset-x-0 z-30 flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-fuchsia-400/60 bg-slate-950/90 px-4 py-3 backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-1.5 border-r border-white/15 pr-3">
              <Monitor className="w-4 h-4 text-fuchsia-400 animate-pulse" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-fuchsia-300">
                  {telemetry.multiplayer.isDedicatedServer
                    ? "DEDICATED SPECTATOR SERVER"
                    : telemetry.multiplayer.spectateAutoDirector
                    ? "SPECTATING LIVE RACE • LEAD RACER CAM"
                    : "SPECTATING LIVE RACE"}
                </div>
                <div className="text-xs font-black text-white">
                  Watching: {telemetry.multiplayer.spectatedRacerName} (Slot #
                  {telemetry.multiplayer.spectatedSlotIndex + 1})
                </div>
              </div>
            </div>

            {/* Auto-Director (Lead Racer Cam) Toggle */}
            <button
              type="button"
              data-testid="spectate-autodirector-btn"
              onClick={() => {
                spectateAutoDirectorRef.current =
                  !spectateAutoDirectorRef.current;
              }}
              className={`rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                telemetry.multiplayer.spectateAutoDirector
                  ? "border-fuchsia-400 bg-fuchsia-500/30 text-fuchsia-100"
                  : "border-white/15 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
              title="Automatically follow the 1st-place lead racer"
            >
              🎥 LEAD CAM{" "}
              {telemetry.multiplayer.spectateAutoDirector ? "ON" : "OFF"}
            </button>

            {/* Direct Slot Camera Buttons #1 - #4 */}
            {[0, 1, 2, 3].map((slotIdx) => {
              const active =
                !telemetry.multiplayer?.spectateAutoDirector &&
                telemetry.multiplayer?.spectatedSlotIndex === slotIdx;
              return (
                <button
                  key={slotIdx}
                  type="button"
                  data-testid={`spectate-slot-btn-${slotIdx}`}
                  onClick={() => {
                    spectateAutoDirectorRef.current = false;
                    spectateSlotIndexRef.current = slotIdx;
                  }}
                  className={`rounded-xl border px-2.5 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                    active
                      ? "border-amber-400 bg-amber-400 text-slate-950"
                      : "border-white/15 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  #{slotIdx + 1}
                </button>
              );
            })}

            {/* Auto-Loop Races Toggle (Host Only) */}
            {telemetry.multiplayer.isHost && (
              <button
                type="button"
                data-testid="toggle-autoloop-btn"
                onClick={() => {
                  autoAdvanceRacesRef.current = !autoAdvanceRacesRef.current;
                }}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                  telemetry.multiplayer.autoAdvanceEnabled
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                    : "border-white/15 bg-slate-900 text-slate-400"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  24/7 AUTO-LOOP:{" "}
                  {telemetry.multiplayer.autoAdvanceEnabled ? "ON" : "OFF"}
                </span>
              </button>
            )}

            {/* Join Race & Assume AI Racer Button */}
            {telemetry.multiplayer.aiCount > 0 ? (
              <button
                type="button"
                data-testid="spectator-assume-ai-btn"
                onClick={() => jumpInToDriveActionRef.current?.()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:brightness-110 active:scale-95 transition cursor-pointer shadow-lg ring-2 ring-emerald-300/60"
              >
                <Gamepad2 className="w-4 h-4" />
                <span>JOIN RACE &amp; ASSUME AI RACER</span>
              </button>
            ) : (
              <span className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-black uppercase text-amber-200">
                ALL 4 SLOTS HUMAN — SPECTATING
              </span>
            )}
          </div>
        </div>
      ) : (
        telemetry.standings.length === 0
          ? !allAiSimModeRef.current
          : telemetry.standings.some((s) => s.isPlayer)
      ) ? (
        <VirtualJoystick
          callbacks={touchCallbacks}
          heldItem={telemetry.heldItem}
          rouletteSpinning={telemetry.rouletteSpinning}
          roulettePreviewItem={telemetry.roulettePreviewItem}
          isDrifting={telemetry.driftState === "DRIFT_ACTIVE"}
          miniTurboTier={telemetry.miniTurboTier}
        />
      ) : null}

      {/* POST-RACE CUP STANDINGS & FINAL CHAMPIONSHIP PODIUM CEREMONY MODAL */}
      {telemetry.racePhase === "FINISHED" && (() => {
        const rawCupRows: CupStandingEntry[] =
          cupStandings.length > 0
            ? cupStandings
            : telemetry.standings.map((r) => ({
                racerId: r.racerId,
                characterId: r.characterId,
                characterName: r.characterName,
                name: r.name,
                kartName: r.kartName,
                isPlayer: r.isPlayer,
                isRemoteHuman: r.isRemoteHuman,
                slotIndex: r.slotIndex,
                controllerLabel: r.controllerLabel,
                color: r.color,
                mass: r.mass,
                points: Math.max(1, 5 - r.rank),
                lastRacePoints: Math.max(1, 5 - r.rank),
                lastRaceRank: r.rank,
                finishTimeMs: r.finishTimeMs,
                lapTimesMs: r.lapTimesMs,
                isProjectedTime: !r.finished,
              }));

        // Enrich Cup rows with latest live slot identity and timing snapshots
        const displayCupRows: CupStandingEntry[] = rawCupRows.map((row) => {
          const liveMatch = telemetry.standings.find(
            (s) =>
              (row.slotIndex !== undefined && s.slotIndex === row.slotIndex) ||
              s.racerId === row.racerId
          );
          if (!liveMatch) return row;
          const isHumanLive = Boolean(
            liveMatch.isPlayer ||
              liveMatch.isRemoteHuman ||
              liveMatch.controllerLabel === "YOU" ||
              liveMatch.controllerLabel === "ONLINE"
          );
          const resolvedFinishMs =
            liveMatch.finishTimeMs ?? row.finishTimeMs ?? null;
          const resolvedLaps =
            liveMatch.lapTimesMs && liveMatch.lapTimesMs.length > 0
              ? liveMatch.lapTimesMs
              : row.lapTimesMs ?? [];
          return {
            ...row,
            name: isHumanLive ? liveMatch.name : row.name,
            characterName: liveMatch.characterName ?? row.characterName,
            kartName: liveMatch.kartName || row.kartName,
            isPlayer: liveMatch.isPlayer,
            isRemoteHuman: liveMatch.isRemoteHuman,
            controllerLabel: liveMatch.controllerLabel,
            finishTimeMs: resolvedFinishMs,
            lapTimesMs: resolvedLaps,
            isProjectedTime: liveMatch.finished
              ? false
              : row.isProjectedTime ?? true,
          };
        });

        const activeTrackKey =
          (joinedTrackOverrideRef.current ?? trackDef).id ||
          (joinedTrackOverrideRef.current ?? trackDef).name;
        const activeCircuitRecord = trackRecords[activeTrackKey] ?? null;

        // Compute race-wide winner time and fastest single lap for delta & badge comparisons
        const raceSortedByRank = [...displayCupRows].sort(
          (a, b) => a.lastRaceRank - b.lastRaceRank
        );
        const raceWinnerRow = raceSortedByRank[0] ?? displayCupRows[0];
        const winnerFinishTimeMs = raceWinnerRow?.finishTimeMs ?? null;

        let raceFastestLapMs: number | null = null;
        let raceFastestLapHolder = "";
        let raceFastestLapNumber = 1;
        for (const r of displayCupRows) {
          const laps = r.lapTimesMs ?? [];
          laps.forEach((ms, lapIdx) => {
            if (
              ms > 500 &&
              (raceFastestLapMs === null || ms < raceFastestLapMs)
            ) {
              raceFastestLapMs = ms;
              raceFastestLapHolder = r.name;
              raceFastestLapNumber = lapIdx + 1;
            }
          });
        }

        const isCupFinale = isCupSeriesActive && !hasNextTrackInCup;
        const cupWinner = displayCupRows[0];
        const secondPlace = displayCupRows[1];
        const thirdPlace = displayCupRows[2];

        const getRacerBadgeMeta = (entry: CupStandingEntry) => {
          if (entry.isPlayer || entry.controllerLabel === "YOU") {
            return {
              shortLabel: "YOU • HUMAN",
              pedestalLabel: "YOU (HUMAN)",
              className: "bg-amber-400 text-slate-950",
              isHuman: true,
            };
          }
          if (entry.isRemoteHuman || entry.controllerLabel === "ONLINE") {
            return {
              shortLabel: "HUMAN PLAYER",
              pedestalLabel: "HUMAN",
              className: "bg-cyan-400 text-slate-950",
              isHuman: true,
            };
          }
          return {
            shortLabel: "AI BOT",
            pedestalLabel: "AI BOT",
            className: "bg-slate-700 text-slate-200 border border-white/15",
            isHuman: false,
          };
        };

        return (
          <div
            data-testid="podium-modal"
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md overflow-y-auto"
          >
            <div className="w-full max-w-3xl rounded-3xl border-2 border-amber-400 bg-slate-900 p-5 sm:p-7 text-white shadow-2xl my-auto">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  {isCupFinale ? (
                    <Trophy className="w-11 h-11 text-amber-400 shrink-0" />
                  ) : (
                    <Award className="w-10 h-10 text-amber-400 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-amber-300">
                      {isCupFinale
                        ? `${activeCup?.name} CHAMPIONSHIP CEREMONY`
                        : `${activeCup?.name} • RACE ${selectedTrackIdx + 1} OF ${totalCupTracks} COMPLETE`}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black">
                      {isCupFinale
                        ? "GRAND PRIX CUP PODIUM"
                        : `${(joinedTrackOverrideRef.current ?? trackDef).name} Results`}
                    </h2>
                  </div>
                </div>
                <span className="rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-300 uppercase">
                  1ST=4 • 2ND=3 • 3RD=2 • 4TH=1
                </span>
              </div>

              {/* Dedicated Server Auto-Next-Race Countdown Banner */}
              {telemetry.multiplayer?.autoAdvanceSecondsLeft !== null &&
                telemetry.multiplayer?.autoAdvanceSecondsLeft !== undefined && (
                  <div
                    data-testid="dedicated-autoadvance-banner"
                    className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-fuchsia-400/60 bg-fuchsia-950/50 px-4 py-2.5 text-xs font-black text-fuchsia-200"
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-fuchsia-300 animate-spin" />
                      <span>
                        DEDICATED SERVER AUTO-ADVANCING TO NEXT RACE IN{" "}
                        <strong className="text-amber-300 text-sm">
                          {telemetry.multiplayer.autoAdvanceSecondsLeft}s
                        </strong>
                        ...
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={advanceToNextTrackInCup}
                      className="rounded-xl bg-fuchsia-400 px-3 py-1 text-[10px] font-black uppercase text-slate-950 hover:bg-fuchsia-300 cursor-pointer shrink-0"
                    >
                      START NOW
                    </button>
                  </div>
                )}

              {/* Circuit Timing & Track Records Summary Bar */}
              <div
                data-testid="post-race-timing-summary"
                className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl border border-white/10 bg-slate-950/80 p-3"
              >
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                    <span>WINNING RACE TIME</span>
                    {raceWinnerRow?.isNewBestRace && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                        NEW RECORD!
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black text-white">
                    {winnerFinishTimeMs !== null
                      ? formatRaceTime(winnerFinishTimeMs)
                      : "--:--.---"}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    1st • {raceWinnerRow?.name ?? "Winner"}
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase tracking-wider text-cyan-300">
                    <span>RACE FASTEST LAP</span>
                    {displayCupRows.some((r) => r.isNewBestLap) && (
                      <span className="rounded bg-cyan-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                        LAP RECORD!
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-lg font-black text-white">
                    {raceFastestLapMs !== null
                      ? formatRaceTime(raceFastestLapMs)
                      : "--:--.---"}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    {raceFastestLapHolder
                      ? `${raceFastestLapHolder} (Lap ${raceFastestLapNumber})`
                      : "3-Lap Circuit"}
                  </div>
                </div>

                <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-fuchsia-300">
                    ALL-TIME CIRCUIT RECORDS
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="text-[10px] font-sans font-bold uppercase text-slate-400">
                        Best 3-Lap:
                      </span>
                      <span className="font-bold text-amber-300">
                        {activeCircuitRecord
                          ? formatRaceTime(activeCircuitRecord.bestRaceTimeMs)
                          : winnerFinishTimeMs !== null
                          ? formatRaceTime(winnerFinishTimeMs)
                          : "--:--.---"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="text-[10px] font-sans font-bold uppercase text-slate-400">
                        Best Lap:
                      </span>
                      <span className="font-bold text-cyan-300">
                        {activeCircuitRecord
                          ? formatRaceTime(activeCircuitRecord.bestLapTimeMs)
                          : raceFastestLapMs !== null
                          ? formatRaceTime(raceFastestLapMs)
                          : "--:--.---"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CHAMPIONSHIP PODIUM CEREMONY (Shown after the final race of the Cup!) */}
              {isCupFinale && cupWinner && (() => {
                const winnerBadge = getRacerBadgeMeta(cupWinner);
                return (
                  <div
                    data-testid="cup-championship-podium"
                    className="mt-5 rounded-2xl border border-amber-400/50 bg-gradient-to-b from-amber-500/15 via-slate-950/80 to-slate-950 p-4 sm:p-5"
                  >
                    {/* Overall Cup Champion Banner */}
                    <div className="text-center mb-5">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1 text-xs font-black uppercase tracking-widest text-slate-950 shadow-lg">
                        <Crown className="w-4 h-4" /> OVERALL {activeCup?.name.toUpperCase()} CHAMPION
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                        <span className="text-2xl sm:text-3xl font-black text-white">
                          {cupWinner.name}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${winnerBadge.className}`}
                        >
                          {winnerBadge.shortLabel}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
                        {winnerBadge.isHuman &&
                        cupWinner.characterName &&
                        cupWinner.characterName !== cupWinner.name
                          ? `${cupWinner.characterName} • `
                          : ""}
                        {cupWinner.kartName} • {cupWinner.points} TOTAL CUP POINTS
                      </div>
                    </div>

                    {/* 3-Step Visual Podium (2nd Silver Left, 1st Gold Center, 3rd Bronze Right) */}
                    <div className="grid grid-cols-3 items-end gap-3 pt-2">
                      {/* 2ND PLACE PEDESTAL */}
                      {secondPlace && (() => {
                        const badge2 = getRacerBadgeMeta(secondPlace);
                        return (
                          <div
                            data-testid="podium-2nd"
                            className="flex flex-col items-center"
                          >
                            <span
                              className={`mb-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badge2.className}`}
                            >
                              {badge2.pedestalLabel}
                            </span>
                            <div className="text-xs sm:text-sm font-black text-slate-100 truncate max-w-full">
                              {secondPlace.name}
                            </div>
                            {badge2.isHuman &&
                              secondPlace.characterName &&
                              secondPlace.characterName !== secondPlace.name && (
                                <div className="text-[10px] font-semibold text-slate-400 truncate max-w-full">
                                  {secondPlace.characterName}
                                </div>
                              )}
                            <div className="text-[11px] font-bold text-cyan-300 mb-1.5">
                              {secondPlace.points} PTS
                            </div>
                            <div className="w-full h-24 rounded-t-2xl border-2 border-slate-300/60 bg-gradient-to-b from-slate-300/30 to-slate-800 flex flex-col items-center justify-center p-2 shadow-lg">
                              <Medal className="w-6 h-6 text-slate-200 mb-1" />
                              <span className="text-lg font-black text-slate-100">
                                2ND
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 1ST PLACE GOLD PEDESTAL */}
                      <div
                        data-testid="podium-1st"
                        className="flex flex-col items-center"
                      >
                        <Crown className="w-6 h-6 text-amber-400 animate-bounce mb-0.5" />
                        <span
                          className={`mb-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${winnerBadge.className}`}
                        >
                          {winnerBadge.pedestalLabel}
                        </span>
                        <div className="text-sm sm:text-base font-black text-amber-300 truncate max-w-full">
                          {cupWinner.name}
                        </div>
                        {winnerBadge.isHuman &&
                          cupWinner.characterName &&
                          cupWinner.characterName !== cupWinner.name && (
                            <div className="text-[10px] font-semibold text-amber-200/80 truncate max-w-full">
                              {cupWinner.characterName}
                            </div>
                          )}
                        <div className="text-xs font-black text-white mb-1.5">
                          {cupWinner.points} PTS
                        </div>
                        <div className="w-full h-32 rounded-t-2xl border-2 border-amber-400 bg-gradient-to-b from-amber-400/40 via-amber-500/25 to-slate-900 flex flex-col items-center justify-center p-2 shadow-[0_0_25px_rgba(251,191,36,0.35)]">
                          <Trophy className="w-7 h-7 text-amber-300 mb-1" />
                          <span className="text-2xl font-black text-amber-300">
                            1ST
                          </span>
                        </div>
                      </div>

                      {/* 3RD PLACE BRONZE PEDESTAL */}
                      {thirdPlace && (() => {
                        const badge3 = getRacerBadgeMeta(thirdPlace);
                        return (
                          <div
                            data-testid="podium-3rd"
                            className="flex flex-col items-center"
                          >
                            <span
                              className={`mb-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${badge3.className}`}
                            >
                              {badge3.pedestalLabel}
                            </span>
                            <div className="text-xs sm:text-sm font-black text-amber-200/90 truncate max-w-full">
                              {thirdPlace.name}
                            </div>
                            {badge3.isHuman &&
                              thirdPlace.characterName &&
                              thirdPlace.characterName !== thirdPlace.name && (
                                <div className="text-[10px] font-semibold text-slate-400 truncate max-w-full">
                                  {thirdPlace.characterName}
                                </div>
                              )}
                            <div className="text-[11px] font-bold text-amber-300/80 mb-1.5">
                              {thirdPlace.points} PTS
                            </div>
                            <div className="w-full h-20 rounded-t-2xl border-2 border-amber-600/60 bg-gradient-to-b from-amber-600/30 to-slate-900 flex flex-col items-center justify-center p-2 shadow-lg">
                              <Medal className="w-5 h-5 text-amber-500 mb-0.5" />
                              <span className="text-base font-black text-amber-400">
                                3RD
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Cumulative Cup Standings & Detailed Lap Splits Table */}
              <div className="mt-5 space-y-3">
                {displayCupRows.map((r, idx) => {
                  const rowBadge = getRacerBadgeMeta(r);
                  const laps = r.lapTimesMs ?? [];
                  const validLaps = laps.filter((ms) => ms > 500);
                  const personalBestLapMs =
                    validLaps.length > 0 ? Math.min(...validLaps) : null;
                  const avgLapMs =
                    validLaps.length > 0
                      ? Math.round(
                          validLaps.reduce((a, b) => a + b, 0) / validLaps.length
                        )
                      : null;
                  const deltaToWinnerMs =
                    r.finishTimeMs != null &&
                    winnerFinishTimeMs != null &&
                    r.lastRaceRank > 1
                      ? Math.max(10, r.finishTimeMs - winnerFinishTimeMs)
                      : 0;
                  const savedCharRec =
                    activeCircuitRecord?.racerRecords?.[r.characterId] ?? null;

                  return (
                    <div
                      key={r.racerId}
                      data-testid={`post-race-racer-row-${idx}`}
                      className={`rounded-2xl border p-3.5 transition ${
                        r.isPlayer
                          ? "border-amber-400 bg-amber-500/15"
                          : r.isRemoteHuman
                          ? "border-cyan-400/50 bg-cyan-500/10"
                          : "border-white/10 bg-slate-950/60"
                      }`}
                    >
                      {/* Top row: Rank, Identity, Total Race Time, Delta, and Cup Points */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 font-black text-amber-300">
                            {ordinalSuffix(idx + 1)}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 font-black text-white">
                              <span>{r.name}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${rowBadge.className}`}
                              >
                                {rowBadge.shortLabel}
                              </span>
                              {r.isNewBestRace && (
                                <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">
                                  TRACK RECORD
                                </span>
                              )}
                              {r.isNewBestLap && (
                                <span className="rounded bg-cyan-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">
                                  FASTEST LAP
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {rowBadge.isHuman &&
                              r.characterName &&
                              r.characterName !== r.name
                                ? `${r.characterName} • `
                                : ""}
                              {r.kartName} • Finished{" "}
                              <strong className="text-slate-200">
                                {ordinalSuffix(r.lastRaceRank)}
                              </strong>{" "}
                              this race
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 text-right border-t border-white/10 sm:border-t-0 pt-2 sm:pt-0">
                          {/* Total Race Time & Delta */}
                          <div className="text-left sm:text-right">
                            <div className="flex items-center sm:justify-end gap-1.5">
                              <span
                                data-testid={`racer-total-time-${idx}`}
                                className="font-mono text-sm sm:text-base font-black text-white"
                              >
                                {r.finishTimeMs != null
                                  ? formatRaceTime(r.finishTimeMs)
                                  : "--:--.---"}
                              </span>
                              {r.isProjectedTime && (
                                <span
                                  title="Projected from live track pace while finishing lap"
                                  className="rounded border border-amber-300/40 bg-amber-400/15 px-1 py-0.2 text-[9px] font-black uppercase text-amber-200"
                                >
                                  PACE EST
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono font-bold">
                              {r.lastRaceRank === 1 ? (
                                <span className="text-emerald-300 uppercase">
                                  RACE WINNER
                                </span>
                              ) : deltaToWinnerMs > 0 ? (
                                <span className="text-rose-300">
                                  +{(deltaToWinnerMs / 1000).toFixed(2)}s gap
                                </span>
                              ) : (
                                <span className="text-slate-400">3 LAPS</span>
                              )}
                            </div>
                          </div>

                          <span className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 text-xs font-black text-emerald-300">
                            +{r.lastRacePoints}{" "}
                            {r.lastRacePoints === 1 ? "PT" : "PTS"}
                          </span>

                          <div className="min-w-[68px]">
                            <div className="font-mono text-base font-black text-amber-300">
                              {r.points} PTS
                            </div>
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              CUP TOTAL
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom row: Individual Lap Splits (L1, L2, L3) + Best/Avg/PB Telemetry */}
                      <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="grid grid-cols-3 gap-1.5 flex-1">
                          {[0, 1, 2].map((lapIdx) => {
                            const lapMs = laps[lapIdx];
                            const isValid = lapMs !== undefined && lapMs > 500;
                            const isOverallFastest =
                              isValid &&
                              raceFastestLapMs !== null &&
                              lapMs === raceFastestLapMs;
                            const isPersonalBest =
                              isValid &&
                              personalBestLapMs !== null &&
                              lapMs === personalBestLapMs;

                            return (
                              <div
                                key={lapIdx}
                                data-testid={`racer-${idx}-lap-${lapIdx + 1}`}
                                className={`rounded-lg border px-2 py-1 flex items-center justify-between gap-1 ${
                                  isOverallFastest
                                    ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-100"
                                    : isPersonalBest
                                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                                    : "border-white/10 bg-slate-900/80 text-slate-200"
                                }`}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-black uppercase text-slate-400">
                                    L{lapIdx + 1}
                                  </span>
                                  {isOverallFastest ? (
                                    <span className="rounded bg-cyan-400 px-1 text-[8px] font-black uppercase text-slate-950">
                                      FASTEST
                                    </span>
                                  ) : isPersonalBest ? (
                                    <span className="rounded bg-emerald-400/30 px-1 text-[8px] font-black uppercase text-emerald-200">
                                      BEST
                                    </span>
                                  ) : null}
                                </div>
                                <span className="font-mono text-xs font-bold">
                                  {isValid ? formatRaceTime(lapMs) : "--:--.---"}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-300 sm:pl-2">
                          <div>
                            <span className="text-[10px] font-sans font-bold uppercase text-slate-400">
                              BEST:{" "}
                            </span>
                            <span className="font-bold text-emerald-300">
                              {personalBestLapMs !== null
                                ? formatRaceTime(personalBestLapMs)
                                : "--:--.---"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] font-sans font-bold uppercase text-slate-400">
                              AVG:{" "}
                            </span>
                            <span className="font-bold text-slate-200">
                              {avgLapMs !== null
                                ? formatRaceTime(avgLapMs)
                                : "--:--.---"}
                            </span>
                          </div>
                          {savedCharRec?.bestLapTimeMs != null && (
                            <div>
                              <span className="text-[10px] font-sans font-bold uppercase text-amber-300/80">
                                PB:{" "}
                              </span>
                              <span className="font-bold text-amber-300">
                                {formatRaceTime(savedCharRec.bestLapTimeMs)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progression & Action Buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                {hasNextTrackInCup && nextTrackInCup ? (
                  <button
                    type="button"
                    data-testid="next-track-btn"
                    onClick={advanceToNextTrackInCup}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 py-4 px-5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110 transition cursor-pointer"
                  >
                    <span>
                      NEXT TRACK: {nextTrackInCup.name} (RACE {selectedTrackIdx + 2}/{totalCupTracks})
                    </span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                ) : (
                  <>
                    {nextCup && (
                      <button
                        type="button"
                        data-testid="next-cup-btn"
                        onClick={() => startGrandPrixCupSeries(nextCup.id, 0)}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 py-3.5 px-4 text-sm font-black uppercase tracking-wider text-slate-950 hover:brightness-110 transition cursor-pointer"
                      >
                        <span>NEXT CUP: {nextCup.name}</span>
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startGrandPrixCupSeries(selectedCupId, 0)}
                      className="flex-1 rounded-2xl bg-amber-400 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300 transition cursor-pointer"
                    >
                      REPLAY {activeCup?.name.toUpperCase()}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleLeaveOnlineRaceToMenu}
                  className="rounded-2xl border border-white/25 bg-slate-800 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-slate-700 transition cursor-pointer"
                >
                  CUP &amp; DRIVER SELECT
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dismissible Asymmetric Archetype & Balance Philosophy Modal */}
      {showBalanceGuide && (
        <div
          data-testid="balance-guide-modal"
          onClick={() => setShowBalanceGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-3xl border border-cyan-400/35 bg-slate-900/95 p-5 sm:p-6 text-white shadow-[0_0_50px_rgba(34,211,238,0.2)] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3.5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-200">
                  <span>ASYMMETRIC ARCHETYPE DESIGN PHILOSOPHY</span>
                  <span>•</span>
                  <span>TARGET: 25% WIN RATE EACH</span>
                </div>
                <h2 className="mt-1.5 text-lg sm:text-xl font-black tracking-tight text-white">
                  Distinct Identities, Equal Full-Lap Pace
                </h2>
                <p className="mt-0.5 text-xs text-slate-300">
                  Every character wins races in a completely different way—trading off{" "}
                  <span className="font-bold text-amber-300">Cubic Mass (γ=3)</span>,{" "}
                  <span className="font-bold text-cyan-300">Top Speed</span>,{" "}
                  <span className="font-bold text-emerald-300">Launch Acceleration</span>,{" "}
                  <span className="font-bold text-fuchsia-300">Cornering Grip</span>, and{" "}
                  <span className="font-bold text-indigo-300">Mini-Turbo Boost</span> so their average lap times converge within milliseconds.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-balance-guide-btn"
                onClick={() => setShowBalanceGuide(false)}
                className="rounded-xl border border-white/20 bg-slate-800 px-3 py-1.5 text-xs font-black uppercase text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer shrink-0"
              >
                CLOSE ✕
              </button>
            </div>

            {/* 4 Character Archetype Breakdown */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHARACTER_ROSTER.map((char) => {
                const stats = resolveRacerStats(char.id, char.defaultKartId);
                const roleNotes: Record<
                  string,
                  { style: string; strength: string; tradeoff: string }
                > = {
                  rex_ironclad: {
                    style: "Straightaway Momentum & Pack Enforcer",
                    strength:
                      "Highest Top Speed & 220 kg Juggernaut mass (<3% speed loss on bumps; knocks light karts wide in traffic).",
                    tradeoff:
                      "Slowest launch acceleration & shortest Mini-Turbo bonus (+2% spd); must protect momentum.",
                  },
                  aero_vance: {
                    style: "Precision Racing-Line All-Rounder",
                    strength:
                      "Zero weaknesses—strong straightaway speed paired with crisp 80% drift grip and 120 kg stability.",
                    tradeoff:
                      "Out-muscled by Rex in head-on shoves and out-boosted by Nyx/Pip exiting tight hairpins.",
                  },
                  nyx_drift: {
                    style: "Apex Chain-Drifter & Mini-Turbo Specialist",
                    strength:
                      "Highest Drift Grip (83%) and longest Mini-Turbo surge (+14% boost ceiling • 0.51s duration).",
                    tradeoff:
                      "Lower raw straightaway ceiling; relies on chaining Blue/Orange/Purple drift sparks out of corners.",
                  },
                  pip_spark: {
                    style: "Explosive Hole-Shot & Recovery Sprinter",
                    strength: `Fastest acceleration (${stats.acceleration} u/s²) & sharpest turn-in (${stats.handling} rad/s)—instantly recovers from grass or bumps.`,
                    tradeoff:
                      "50 kg Featherweight chassis gets bullied in heavy pack traffic; must use agility to slip around heavyweights.",
                  },
                };
                const note = roleNotes[char.id] ?? {
                  style: char.title,
                  strength: char.bio,
                  tradeoff: "",
                };

                return (
                  <div
                    key={char.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/75 p-3.5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          style={{ backgroundColor: char.colors.badge }}
                          className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-950"
                        >
                          {char.archetypeClass.replace("_", " ")}
                        </span>
                        <span className="text-[11px] font-extrabold text-amber-300">
                          {stats.baseMass} kg • {stats.topSpeed} u/s • +{Math.round(stats.miniTurboDurationBonus * 100)}% MT
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-black text-white">
                          {char.name}
                        </h3>
                        <span className="text-[10px] font-bold text-cyan-300">
                          {note.style}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-emerald-200/95 leading-snug">
                        <span className="font-black uppercase text-emerald-400">
                          Win Condition:{" "}
                        </span>
                        {note.strength}
                      </p>
                      <p className="mt-1 text-[11px] text-rose-200/90 leading-snug">
                        <span className="font-black uppercase text-rose-400">
                          Counterplay:{" "}
                        </span>
                        {note.tradeoff}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3 Race Phases + Juggernaut Law Summary */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-950/25 p-3">
                <div className="font-black uppercase text-emerald-300">
                  1. Launch &amp; Hairpins
                </div>
                <p className="mt-1 text-slate-300 leading-snug">
                  <span className="font-bold text-white">Pip Spark</span> &amp;{" "}
                  <span className="font-bold text-white">Nyx Veloce</span> jump ahead off the starting line and slingshot out of tight corners using high acceleration and extended Mini-Turbo boosts.
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-950/25 p-3">
                <div className="font-black uppercase text-cyan-300">
                  2. Straightaways &amp; Sweepers
                </div>
                <p className="mt-1 text-slate-300 leading-snug">
                  <span className="font-bold text-white">Rex Ironclad</span> &amp;{" "}
                  <span className="font-bold text-white">Aero Vance</span> reel the leaders back in on long straights and high-speed sweepers thanks to superior unboosted cruising speed.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/25 bg-amber-950/25 p-3">
                <div className="font-black uppercase text-amber-300">
                  3. The Juggernaut Law (γ=3)
                </div>
                <p className="mt-1 text-slate-300 leading-snug">
                  When karts collide with a ≥40 kg mass gap, cubic mass dominance makes the heavier kart an{" "}
                  <span className="font-bold text-amber-200">Unbudgeable Juggernaut</span> while lighter karts must use superior handling or grass-cut boosts to evade contact.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dismissible AI Self-Learning Technical Architecture Modal */}
      {showAiArchitectureGuide && (
        <div
          data-testid="ai-architecture-guide-modal"
          onClick={() => setShowAiArchitectureGuide(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-3xl border border-fuchsia-400/40 bg-slate-900/95 p-5 sm:p-6 text-white shadow-[0_0_50px_rgba(217,70,239,0.22)] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3.5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/45 bg-fuchsia-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-fuchsia-200">
                  <span>HYBRID PARAMETRIC + NEURO-EVOLUTIONARY ARCHITECTURE</span>
                  <span>•</span>
                  <span>(1+3) ELITIST ES</span>
                </div>
                <h2 className="mt-1.5 text-lg sm:text-xl font-black tracking-tight text-white">
                  How the AI Self-Learning Brain Works Under the Hood
                </h2>
                <p className="mt-0.5 text-xs text-slate-300">
                  Instead of a black-box neural network learning to steer from scratch, each AI racer runs a{" "}
                  <span className="font-bold text-fuchsia-300">two-layer hybrid controller</span>: an analytical spline &amp; closed-loop drift PD controller paired with a{" "}
                  <span className="font-bold text-cyan-300">tanh-activated Neural Residual Perceptron</span>, evolved across episodes via a{" "}
                  <span className="font-bold text-emerald-300">(1+3) Elitist Evolution Strategy</span>.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-ai-architecture-guide-btn"
                onClick={() => setShowAiArchitectureGuide(false)}
                className="rounded-xl border border-white/20 bg-slate-800 px-3 py-1.5 text-xs font-black uppercase text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer shrink-0"
              >
                CLOSE ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-fuchsia-400/25 bg-slate-950/80 p-3.5">
                <div className="text-[11px] font-black uppercase text-fuchsia-300">
                  1. 23-Parameter Hybrid Policy Genome
                </div>
                <p className="mt-1.5 text-[11px] text-slate-300 leading-relaxed">
                  Each genome (<code className="text-fuchsia-200">AiPolicyGenome</code>) encodes{" "}
                  <span className="font-bold text-white">15 continuous vehicle-dynamics &amp; drift-PD weights</span>{" "}
                  (look-ahead horizons on straights/curves/drifts, inside apex cut ratios, hop-drift entry threshold, Mini-Turbo charge hold times, and lateral slip damping) plus an{" "}
                  <span className="font-bold text-cyan-300">8-weight tanh Neural Residual Perceptron</span>{" "}
                  (<code className="text-cyan-200">Δu = 0.22 · tanh(∑ wᵢ · sᵢ)</code>) evaluated at 60Hz from 8 normalized track &amp; slip sensors.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-400/25 bg-slate-950/80 p-3.5">
                <div className="text-[11px] font-black uppercase text-emerald-300">
                  2. Multi-Objective 60Hz Telemetry Fitness (0–100)
                </div>
                <p className="mt-1.5 text-[11px] text-slate-300 leading-relaxed">
                  Every tick records surface state, lateral offset, drift conversions, and speed ratio normalized by the kart&apos;s own top speed (<code className="text-emerald-200">v / v_top</code>). Fitness rewards{" "}
                  <span className="font-bold text-white">clean asphalt/curb adherence, boosted off-road shortcut cuts, and Tier 1/2/3 Mini-Turbo releases</span>, while penalizing unboosted grass drag (<code className="text-rose-300">-1.15×</code>), cross-track ping-pongs (<code className="text-rose-300">-2.8</code>), and wall hits (<code className="text-rose-300">-3.5</code>).
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-3.5">
                <div className="text-[11px] font-black uppercase text-cyan-300">
                  3. (1+3) Elitist Evolution &amp; Simulated Annealing
                </div>
                <p className="mt-1.5 text-[11px] text-slate-300 leading-relaxed">
                  After each 3-lap episode, the top-scoring genome (with a fastest-lap tiebreaker at 100/100 fitness) is promoted to{" "}
                  <span className="font-bold text-white">All-Time Champion</span>. The next generation spawns 4 parallel slots:{" "}
                  <span className="font-bold text-emerald-300">Slot 0 (Unmutated Elitist Champion)</span>,{" "}
                  <span className="font-bold text-cyan-300">Slot 1 (Fine-Tuned Gaussian Mutant)</span>,{" "}
                  <span className="font-bold text-amber-300">Slot 2 (Champion × Runner-Up Genetic Crossover)</span>, and{" "}
                  <span className="font-bold text-fuchsia-300">Slot 3 (Wide Explorer)</span>, with mutation scale annealing from <code className="text-cyan-200">0.68</code> down to <code className="text-cyan-200">0.22</code>.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-400/25 bg-slate-950/80 p-3.5">
                <div className="text-[11px] font-black uppercase text-amber-300">
                  4. Orthogonal Latin-Square De-Biasing (16-Race Cycle)
                </div>
                <p className="mt-1.5 text-[11px] text-slate-300 leading-relaxed">
                  To benchmark character balance without AI-brain or starting-grid bias, starting grid positions rotate every race (<code className="text-amber-200">episodes % 4</code>) while AI genome slots rotate orthogonally every 4-race block (<code className="text-amber-200">(slot + ⌊episodes/4⌋) % 4</code>). Every 16 episodes, all 4 characters drive every AI genome from every starting position.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

