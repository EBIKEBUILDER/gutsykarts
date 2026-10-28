"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Globe,
  ThumbsUp,
  Play,
  Download,
  Map,
  Shield,
  RefreshCw,
  Sparkles,
  Check,
  UserCheck,
  LogIn,
  Trophy,
} from "lucide-react";
import { CustomTrackDefinition, TrackBiome } from "@/src/types/game";
import {
  communityTrackClient,
  CommunityAuthUser,
  CommunityTrackRecord,
} from "@/src/game/network/CommunityTrackClient";
import { UnifiedTrackMap } from "@/src/components/UnifiedTrackMap";

interface CommunityTracksBrowserProps {
  onRaceTrackNow: (track: CustomTrackDefinition) => void;
  onSaveTrackToCustomCup: (track: CustomTrackDefinition) => void;
  onOpenTrackInStudio: (track: CustomTrackDefinition) => void;
  onOpenBlankStudio: () => void;
  onRequestAuthModal: (reason: string) => void;
  onOpenLeaderboard?: (track: CustomTrackDefinition) => void;
}

const BIOME_META: Record<
  TrackBiome,
  { label: string; badgeClass: string; shortDesc: string }
> = {
  ALPINE_SUBURBS: {
    label: "⛰️ Alpine Suburbs",
    badgeClass: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
    shortDesc: "Mountain Pine & Grass",
  },
  TROPICAL_ATOLL: {
    label: "🏝️ Tropical Atoll",
    badgeClass: "border-cyan-400/50 bg-cyan-500/20 text-cyan-200",
    shortDesc: "Ocean & Shallow Lagoon",
  },
  SUNSET_CANYON: {
    label: "🏜️ Sunset Canyon",
    badgeClass: "border-amber-400/50 bg-amber-500/20 text-amber-200",
    shortDesc: "Red Rock Mesas",
  },
};

export function CommunityTracksBrowser({
  onRaceTrackNow,
  onSaveTrackToCustomCup,
  onOpenTrackInStudio,
  onOpenBlankStudio,
  onRequestAuthModal,
  onOpenLeaderboard,
}: CommunityTracksBrowserProps) {
  const [tracks, setTracks] = useState<CommunityTrackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [biomeFilter, setBiomeFilter] = useState<TrackBiome | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"POPULAR" | "MOST_PLAYED" | "NEWEST">(
    "POPULAR"
  );
  const [authUser, setAuthUser] = useState<CommunityAuthUser | null>(
    communityTrackClient.getUser()
  );
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    const list = await communityTrackClient.fetchCommunityTracks(
      biomeFilter,
      sortBy
    );
    setTracks(list);
    setLoading(false);
  }, [biomeFilter, sortBy]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    return communityTrackClient.onAuthChange((user) => {
      setAuthUser(user);
    });
  }, []);

  const handleToggleUpvote = async (rec: CommunityTrackRecord) => {
    if (!authUser) {
      onRequestAuthModal(
        "Sign in with your verified Gutsy Karts account to upvote community tracks (1 vote per account)."
      );
      return;
    }

    const res = await communityTrackClient.toggleUpvote(rec.trackId);
    if (res.requiresAuth) {
      onRequestAuthModal(res.error || "Sign in required to upvote.");
      return;
    }
    if (res.error) {
      setStatusBanner(res.error);
      return;
    }

    setTracks((prev) =>
      prev.map((item) =>
        item.trackId === rec.trackId
          ? {
              ...item,
              upvotedByMe: Boolean(res.upvoted),
              upvotesCount: res.upvotesCount ?? item.upvotesCount,
            }
          : item
      )
    );
  };

  const handleRaceNow = (rec: CommunityTrackRecord) => {
    void communityTrackClient.recordTrackPlay(rec.trackId);
    onRaceTrackNow(rec.trackDef);
  };

  const handleSaveToCup = (rec: CommunityTrackRecord) => {
    onSaveTrackToCustomCup(rec.trackDef);
    setSavedTrackIds((prev) => {
      const next = new Set(prev);
      next.add(rec.trackId);
      return next;
    });
    setStatusBanner(
      `Saved "${rec.trackName}" by ${rec.authorCallsign} to your Custom Cup!`
    );
  };

  return (
    <div data-testid="community-tracks-view" className="space-y-5 mt-5">
      {/* Hero & Anti-Spam Auth Bar */}
      <div className="rounded-3xl border border-emerald-400/35 bg-slate-900/85 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-300">
              <Globe className="w-4 h-4 text-emerald-400" /> COMMUNITY CIRCUIT CATALOG &amp; BIOME SHOWCASE
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan-200">
              <Shield className="w-3 h-3" /> SUPABASE AUTH + ANTI-SPAM PROTECTED
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300">
            Race custom community circuits across{" "}
            <strong className="text-cyan-300">Tropical Atolls</strong>,{" "}
            <strong className="text-amber-300">Sunset Canyons</strong>, and{" "}
            <strong className="text-emerald-300">Alpine Suburbs</strong>! Anyone can play or remix tracks for free; publishing and upvoting require a verified account to prevent spam.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {authUser ? (
            <button
              type="button"
              data-testid="community-auth-status-btn"
              onClick={() => onRequestAuthModal("Manage your verified Racer Profile.")}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/25 transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-300" />
              <span>VERIFIED: {authUser.callsign}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="community-sign-in-btn"
              onClick={() =>
                onRequestAuthModal(
                  "Sign in or create a verified Gutsy Karts account to publish tracks from 3D Circuit Studio and upvote community maps."
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/60 bg-cyan-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/30 transition cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-cyan-300" />
              <span>Sign In to Publish / Upvote</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenBlankStudio}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.35)] hover:brightness-110 transition cursor-pointer"
          >
            <Map className="w-4 h-4" />
            <span>Build &amp; Publish in 3D Studio</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-300 hover:text-white text-[11px] font-black uppercase cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Biome Filter & Sort Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/75 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "ALL", label: "All Biomes" },
              { id: "TROPICAL_ATOLL", label: "🏝️ Tropical Atoll" },
              { id: "SUNSET_CANYON", label: "🏜️ Sunset Canyon" },
              { id: "ALPINE_SUBURBS", label: "⛰️ Alpine Suburbs" },
            ] as const
          ).map((b) => {
            const active = biomeFilter === b.id;
            return (
              <button
                key={b.id}
                type="button"
                data-testid={`community-biome-filter-${b.id.toLowerCase()}`}
                onClick={() => setBiomeFilter(b.id)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                  active
                    ? "border-amber-400 bg-amber-400/20 text-amber-200"
                    : "border-white/10 bg-slate-950/60 text-slate-400 hover:text-white"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1">
            {(
              [
                { id: "POPULAR", label: "🔥 Top Rated" },
                { id: "MOST_PLAYED", label: "🏁 Most Played" },
                { id: "NEWEST", label: "🆕 Newest" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortBy(s.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase transition cursor-pointer ${
                  sortBy === s.id
                    ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/50"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadTracks()}
            className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
            title="Refresh community tracks"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Community Track Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tracks.map((rec) => {
          const biomeMeta =
            BIOME_META[rec.biome] ?? BIOME_META.ALPINE_SUBURBS;
          const isSaved = savedTrackIds.has(rec.trackId);
          const shallowWaterCount = (rec.trackDef.trackMasks ?? []).filter(
            (m) => m.type === "SHALLOW_WATER"
          ).length;

          return (
            <div
              key={rec.trackId}
              data-testid={`community-track-card-${rec.trackId}`}
              className="flex flex-col justify-between rounded-3xl border border-white/15 bg-slate-900/85 p-4 shadow-xl hover:border-cyan-400/40 transition"
            >
              <div>
                {/* Top Badges */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${biomeMeta.badgeClass}`}
                  >
                    {biomeMeta.label}
                  </span>

                  {rec.isOfficialSeed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200">
                      <Sparkles className="w-2.5 h-2.5" /> FEATURED SEED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-200">
                      <Check className="w-2.5 h-2.5" /> VERIFIED BUILDER
                    </span>
                  )}
                </div>

                {/* Title & Creator */}
                <h3 className="mt-2.5 text-lg font-black text-white truncate">
                  {rec.trackName}
                </h3>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span>
                    Builder:{" "}
                    <strong className="text-amber-300">
                      {rec.authorCallsign}
                    </strong>
                  </span>
                  <span>
                    {rec.trackDef.boostPads.length} Boosts
                    {shallowWaterCount > 0
                      ? ` • ${shallowWaterCount} Lagoon Zones`
                      : ""}
                  </span>
                </div>

                <p className="mt-1.5 text-xs text-slate-300 line-clamp-2 min-h-[2.25rem]">
                  {rec.description}
                </p>

                {/* Live 2D Spline & Biome Preview */}
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950 p-2 overflow-hidden">
                  <UnifiedTrackMap
                    trackDef={rec.trackDef}
                    variant="PREVIEW"
                    className="h-32 w-full rounded-xl bg-slate-950"
                  />
                </div>
              </div>

              {/* Upvote, Stats & Action Buttons */}
              <div className="mt-4 pt-3 border-t border-white/10 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`upvote-track-btn-${rec.trackId}`}
                      onClick={() => void handleToggleUpvote(rec)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition cursor-pointer ${
                        rec.upvotedByMe
                          ? "border-amber-400 bg-amber-400/25 text-amber-200"
                          : "border-white/15 bg-slate-950 text-slate-300 hover:border-amber-400/50 hover:text-amber-200"
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{rec.upvotesCount}</span>
                    </button>

                    {onOpenLeaderboard && (
                      <button
                        type="button"
                        data-testid={`community-leaderboard-btn-${rec.trackId}`}
                        onClick={() => onOpenLeaderboard(rec.trackDef)}
                        className="inline-flex items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-black uppercase text-amber-200 hover:bg-amber-500/25 transition cursor-pointer"
                        title="View Global Top 10 Leaderboard for this circuit"
                      >
                        <Trophy className="w-3 h-3 text-amber-300" />
                        <span>Top 10</span>
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    🏁 {rec.playsCount} RACES
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid={`race-community-track-btn-${rec.trackId}`}
                    onClick={() => handleRaceNow(rec)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2 text-[11px] font-black uppercase text-slate-950 hover:brightness-110 cursor-pointer shadow"
                  >
                    <Play className="w-3 h-3" /> Race Now
                  </button>

                  <button
                    type="button"
                    data-testid={`save-community-track-btn-${rec.trackId}`}
                    onClick={() => handleSaveToCup(rec)}
                    className={`inline-flex items-center justify-center gap-1 rounded-xl border py-2 text-[11px] font-black uppercase transition cursor-pointer ${
                      isSaved
                        ? "border-emerald-400 bg-emerald-500/25 text-emerald-200"
                        : "border-cyan-400/50 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
                    }`}
                  >
                    {isSaved ? (
                      <>
                        <Check className="w-3 h-3" /> Saved
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" /> Save Cup
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid={`remix-community-track-btn-${rec.trackId}`}
                    onClick={() => onOpenTrackInStudio(rec.trackDef)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-400/50 bg-emerald-500/15 py-2 text-[11px] font-black uppercase text-emerald-200 hover:bg-emerald-500/25 transition cursor-pointer"
                  >
                    <Map className="w-3 h-3" /> 3D Remix
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
