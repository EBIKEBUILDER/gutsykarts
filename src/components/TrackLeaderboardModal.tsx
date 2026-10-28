"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Trophy,
  X,
  RefreshCw,
  Shield,
  Play,
  LogIn,
  Check,
  Zap,
  Medal,
} from "lucide-react";
import {
  communityTrackClient,
  TrackLeaderboardEntry,
  CommunityAuthUser,
} from "@/src/game/network/CommunityTrackClient";
import {
  CHARACTER_ROSTER,
  KART_CHASSIS_CATALOG,
} from "@/src/game/data/roster";
import { TrackTimingRecord } from "@/src/types/game";

interface TrackLeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  trackId: string;
  trackName: string;
  localPersonalBest?: TrackTimingRecord | null;
  onRaceTrackNow?: () => void;
  onRequestSignIn?: () => void;
}

function formatLeaderboardTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "--:--.---";
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}

export function TrackLeaderboardModal({
  open,
  onClose,
  trackId,
  trackName,
  localPersonalBest,
  onRaceTrackNow,
  onRequestSignIn,
}: TrackLeaderboardModalProps) {
  const [sortBy, setSortBy] = useState<"RACE" | "LAP">("RACE");
  const [entries, setEntries] = useState<TrackLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<CommunityAuthUser | null>(
    communityTrackClient.getUser()
  );

  const loadLeaderboard = useCallback(async () => {
    if (!open || !trackId) return;
    setLoading(true);
    const rows = await communityTrackClient.fetchTrackLeaderboard(
      trackId,
      trackName,
      sortBy
    );
    setEntries(rows);
    setLoading(false);
  }, [open, trackId, trackName, sortBy]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    return communityTrackClient.onAuthChange((user) => {
      setAuthUser(user);
    });
  }, []);

  if (!open) return null;

  return (
    <div
      data-testid="track-leaderboard-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border-2 border-amber-400/50 bg-slate-900 p-5 sm:p-6 text-white shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                <Trophy className="w-3 h-3" /> Global Cloud Leaderboard
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan-200">
                <Shield className="w-3 h-3" /> Supabase Verified Times
              </span>
            </div>
            <h2 className="mt-1.5 text-xl sm:text-2xl font-black text-white">
              {trackName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Local Personal Best & Account Sync Banner */}
        <div className="rounded-2xl border border-white/15 bg-slate-950/85 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="space-y-0.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Your Personal Best on {trackName}
            </div>
            {localPersonalBest ? (
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="text-amber-300 font-black">
                  3-LAP RACE: {formatLeaderboardTime(localPersonalBest.bestRaceTimeMs)}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-cyan-300 font-black">
                  BEST LAP: {formatLeaderboardTime(localPersonalBest.bestLapTimeMs)}
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                No completed 3-lap time recorded on this circuit yet.
              </div>
            )}
          </div>

          {authUser ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-black uppercase text-emerald-200 shrink-0">
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              Auto-Syncing as {authUser.callsign}
            </span>
          ) : (
            onRequestSignIn && (
              <button
                type="button"
                onClick={onRequestSignIn}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-[11px] font-black uppercase text-cyan-200 hover:bg-cyan-500/30 transition cursor-pointer shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 text-cyan-300" />
                Sign In to Post Cloud Times
              </button>
            )
          )}
        </div>

        {/* Sort Mode & Refresh Controls */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setSortBy("RACE")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                sortBy === "RACE"
                  ? "bg-amber-400 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Trophy className="w-3.5 h-3.5" /> Fastest 3-Lap Race
            </button>
            <button
              type="button"
              onClick={() => setSortBy("LAP")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                sortBy === "LAP"
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Fastest Single Lap
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadLeaderboard()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Leaderboard Rows */}
        <div className="overflow-y-auto space-y-2 pr-1 flex-1">
          {entries.map((row, idx) => {
            const rank = idx + 1;
            const charProfile =
              CHARACTER_ROSTER.find((c) => c.id === row.characterId) ??
              CHARACTER_ROSTER[0];
            const kartConfig = KART_CHASSIS_CATALOG[row.kartId];

            return (
              <div
                key={row.entryId}
                data-testid={`leaderboard-row-${idx}`}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-xs ${
                  row.isMe
                    ? "border-amber-400 bg-amber-500/15"
                    : rank === 1
                    ? "border-amber-400/40 bg-slate-950/90"
                    : "border-white/10 bg-slate-950/65"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-black text-xs ${
                      rank === 1
                        ? "bg-amber-400 text-slate-950"
                        : rank === 2
                        ? "bg-slate-300 text-slate-950"
                        : rank === 3
                        ? "bg-amber-700 text-amber-100"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {rank <= 3 ? <Medal className="w-4 h-4" /> : `#${rank}`}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-black text-white truncate">
                        {row.callsign}
                      </span>
                      {row.isMe && (
                        <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950">
                          YOU
                        </span>
                      )}
                      {row.isOfficialBenchmark ? (
                        <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-cyan-200">
                          PRO BENCHMARK
                        </span>
                      ) : (
                        <span className="rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-300">
                          VERIFIED
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                      {charProfile.name} • {kartConfig?.name ?? row.kartId}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 font-mono text-right">
                  <div>
                    <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                      3-LAP RACE
                    </div>
                    <div
                      className={`text-xs font-black ${
                        sortBy === "RACE" ? "text-amber-300" : "text-slate-300"
                      }`}
                    >
                      {formatLeaderboardTime(row.bestRaceMs)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                      BEST LAP
                    </div>
                    <div
                      className={`text-xs font-black ${
                        sortBy === "LAP" ? "text-cyan-300" : "text-slate-300"
                      }`}
                    >
                      {formatLeaderboardTime(row.bestLapMs)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-slate-800 px-4 py-2.5 text-xs font-black uppercase text-slate-300 hover:text-white cursor-pointer"
          >
            Close
          </button>

          {onRaceTrackNow && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRaceTrackNow();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-xs font-black uppercase text-slate-950 hover:brightness-110 cursor-pointer shadow-lg"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Race {trackName} Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
