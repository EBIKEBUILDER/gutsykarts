"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  Check,
  Copy,
  Database,
  Globe,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  AnalyticsDashboardDataset,
  globalAnalytics,
} from "@/src/game/network/AnalyticsTracker";
import { CHARACTER_ROSTER } from "@/src/game/data/roster";

const SUPABASE_SETUP_SQL = `-- Run once in your Supabase SQL Editor (https://supabase.com/dashboard)
create table if not exists public.gutsy_analytics_sessions (
  session_id text primary key,
  peer_id text not null,
  player_name text not null default 'GutsyRacer',
  build_pass text not null,
  build_sha text not null,
  device_type text not null default 'desktop',
  viewport text not null default '',
  referrer text not null default 'direct',
  is_ai_sim_machine boolean not null default false,
  lobby_select_sec integer not null default 0,
  racing_active_sec integer not null default 0,
  spectating_sec integer not null default 0,
  circuit_studio_sec integer not null default 0,
  ai_lab_open_sec integer not null default 0,
  races_started integer not null default 0,
  races_completed integer not null default 0,
  races_abandoned integer not null default 0,
  circuit_studio_opens integer not null default 0,
  custom_tracks_saved integer not null default 0,
  custom_tracks_exported integer not null default 0,
  online_rooms_hosted integer not null default 0,
  online_rooms_joined integer not null default 0,
  mid_race_takeovers integer not null default 0,
  balance_guide_views integer not null default 0,
  favorite_character_id text,
  favorite_track_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gutsy_analytics_races (
  race_id text primary key,
  session_id text not null,
  peer_id text not null,
  player_name text not null default 'GutsyRacer',
  build_pass text not null,
  build_sha text not null,
  mode text not null default 'single_cup',
  status text not null default 'completed',
  cup_id text not null,
  track_id text not null,
  track_name text not null,
  character_id text not null,
  kart_id text not null,
  ai_difficulty text not null default 'MEDIUM',
  placement integer,
  human_count integer not null default 1,
  finish_time_ms integer,
  lap1_ms integer,
  best_flying_lap_ms integer,
  avg_speed numeric(6,2),
  top_speed_ratio_pct numeric(5,1),
  on_track_pct numeric(5,1),
  off_road_pct numeric(5,1),
  mini_turbos_fired integer not null default 0,
  tier1_count integer not null default 0,
  tier2_count integer not null default 0,
  tier3_count integer not null default 0,
  shoves_given integer not null default 0,
  hits_taken integer not null default 0,
  items_used integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.gutsy_analytics_ai_lab (
  build_pass text not null,
  peer_id text not null,
  build_sha text not null,
  machine_label text not null default 'SimNode',
  generation integer not null default 1,
  episodes_completed integer not null default 0,
  items_enabled boolean not null default true,
  training_track_mode text not null default 'ROTATE_CUP',
  auto_balance_enabled boolean not null default false,
  champion_fitness numeric(6,2) not null default 0,
  champion_best_lap_ms integer,
  character_balance jsonb not null default '[]'::jsonb,
  champion_weights jsonb not null default '{}'::jsonb,
  report_markdown text not null default '',
  updated_at timestamptz not null default now(),
  primary key (build_pass, peer_id)
);

alter table public.gutsy_analytics_sessions enable row level security;
alter table public.gutsy_analytics_races enable row level security;
alter table public.gutsy_analytics_ai_lab enable row level security;

drop policy if exists "gutsy_sessions_public_access" on public.gutsy_analytics_sessions;
create policy "gutsy_sessions_public_access" on public.gutsy_analytics_sessions for all to anon, authenticated using (true) with check (true);

drop policy if exists "gutsy_races_public_access" on public.gutsy_analytics_races;
create policy "gutsy_races_public_access" on public.gutsy_analytics_races for all to anon, authenticated using (true) with check (true);

drop policy if exists "gutsy_ai_lab_public_access" on public.gutsy_analytics_ai_lab;
create policy "gutsy_ai_lab_public_access" on public.gutsy_analytics_ai_lab for all to anon, authenticated using (true) with check (true);`;

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) return "--:--.--";
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${hundredths
    .toString()
    .padStart(2, "0")}`;
}

function formatDurationSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins < 60) return `${mins}m ${rem}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

interface AnalyticsDashboardModalProps {
  open: boolean;
  onClose: () => void;
}

export const AnalyticsDashboardModal: React.FC<
  AnalyticsDashboardModalProps
> = ({ open, onClose }) => {
  const [dataset, setDataset] = useState<AnalyticsDashboardDataset | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "WEBSITE_UX" | "HUMAN_BALANCE" | "AI_SIM_LAB"
  >("WEBSITE_UX");
  const [selectedBuildPass, setSelectedBuildPass] = useState<string>("CURRENT");
  const [includeAiSimSessionsInUx, setIncludeAiSimSessionsInUx] =
    useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [pruneNotice, setPruneNotice] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await globalAnalytics.fetchDashboardDataset();
      setDataset(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshData();
  }, [open, refreshData]);

  const effectiveBuildFilter = useMemo(() => {
    if (!dataset) return "";
    if (selectedBuildPass === "CURRENT") return dataset.currentBuildPass;
    return selectedBuildPass;
  }, [dataset, selectedBuildPass]);

  const filteredSessions = useMemo(() => {
    if (!dataset) return [];
    return dataset.sessions.filter((s) => {
      const matchesBuild =
        effectiveBuildFilter === "ALL" || s.build_pass === effectiveBuildFilter;
      const matchesType = includeAiSimSessionsInUx || !s.is_ai_sim_machine;
      return matchesBuild && matchesType;
    });
  }, [dataset, effectiveBuildFilter, includeAiSimSessionsInUx]);

  const filteredRaces = useMemo(() => {
    if (!dataset) return [];
    return dataset.humanRaces.filter(
      (r) =>
        effectiveBuildFilter === "ALL" || r.build_pass === effectiveBuildFilter
    );
  }, [dataset, effectiveBuildFilter]);

  const filteredAiLabs = useMemo(() => {
    if (!dataset) return [];
    return dataset.aiLabSnapshots.filter(
      (a) =>
        effectiveBuildFilter === "ALL" || a.build_pass === effectiveBuildFilter
    );
  }, [dataset, effectiveBuildFilter]);

  // Aggregate Website UX Metrics
  const uxSummary = useMemo(() => {
    let desktopCount = 0;
    let mobileCount = 0;
    let lobbySec = 0;
    let racingSec = 0;
    let spectatingSec = 0;
    let studioSec = 0;
    let aiLabSec = 0;
    let racesStarted = 0;
    let racesCompleted = 0;
    let racesAbandoned = 0;
    let studioOpens = 0;
    let tracksSaved = 0;
    let tracksExported = 0;
    let roomsHosted = 0;
    let roomsJoined = 0;
    let takeovers = 0;
    let guideViews = 0;

    for (const s of filteredSessions) {
      if (s.device_type === "mobile") mobileCount += 1;
      else desktopCount += 1;
      lobbySec += s.lobby_select_sec ?? 0;
      racingSec += s.racing_active_sec ?? 0;
      spectatingSec += s.spectating_sec ?? 0;
      studioSec += s.circuit_studio_sec ?? 0;
      aiLabSec += s.ai_lab_open_sec ?? 0;
      racesStarted += s.races_started ?? 0;
      racesCompleted += s.races_completed ?? 0;
      racesAbandoned += s.races_abandoned ?? 0;
      studioOpens += s.circuit_studio_opens ?? 0;
      tracksSaved += s.custom_tracks_saved ?? 0;
      tracksExported += s.custom_tracks_exported ?? 0;
      roomsHosted += s.online_rooms_hosted ?? 0;
      roomsJoined += s.online_rooms_joined ?? 0;
      takeovers += s.mid_race_takeovers ?? 0;
      guideViews += s.balance_guide_views ?? 0;
    }

    const totalScreenSec = Math.max(
      1,
      lobbySec + racingSec + spectatingSec + studioSec
    );

    return {
      totalSessions: filteredSessions.length,
      desktopCount,
      mobileCount,
      lobbySec,
      racingSec,
      spectatingSec,
      studioSec,
      aiLabSec,
      totalScreenSec,
      avgSessionSec:
        filteredSessions.length > 0
          ? Math.round(totalScreenSec / filteredSessions.length)
          : 0,
      racesStarted,
      racesCompleted,
      racesAbandoned,
      studioOpens,
      tracksSaved,
      tracksExported,
      roomsHosted,
      roomsJoined,
      takeovers,
      guideViews,
    };
  }, [filteredSessions]);

  // Aggregate Human Gameplay Balance Metrics per Character
  const humanCharBalance = useMemo(() => {
    const completedRaces = filteredRaces.filter(
      (r) => r.status === "completed"
    );
    const totalCompleted = Math.max(1, completedRaces.length);

    return Object.values(CHARACTER_ROSTER).map((char) => {
      const charRaces = completedRaces.filter(
        (r) => r.character_id === char.id
      );
      const count = charRaces.length;
      const wins = charRaces.filter((r) => r.placement === 1).length;
      const rankSum = charRaces.reduce((acc, r) => acc + (r.placement ?? 4), 0);
      const lap1Races = charRaces.filter((r) => (r.lap1_ms ?? 0) > 1000);
      const flyRaces = charRaces.filter(
        (r) => (r.best_flying_lap_ms ?? 0) > 1000
      );
      const avgLap1Ms =
        lap1Races.length > 0
          ? Math.round(
              lap1Races.reduce((a, r) => a + (r.lap1_ms ?? 0), 0) /
                lap1Races.length
            )
          : null;
      const avgFlyMs =
        flyRaces.length > 0
          ? Math.round(
              flyRaces.reduce((a, r) => a + (r.best_flying_lap_ms ?? 0), 0) /
                flyRaces.length
            )
          : null;
      const bestFlyMs =
        flyRaces.length > 0
          ? Math.min(...flyRaces.map((r) => r.best_flying_lap_ms!))
          : null;
      const avgMt =
        count > 0
          ? charRaces.reduce((a, r) => a + (r.mini_turbos_fired ?? 0), 0) /
            count
          : 0;
      const avgShoves =
        count > 0
          ? charRaces.reduce((a, r) => a + (r.shoves_given ?? 0), 0) / count
          : 0;
      const avgHits =
        count > 0
          ? charRaces.reduce((a, r) => a + (r.hits_taken ?? 0), 0) / count
          : 0;

      return {
        characterId: char.id,
        characterName: char.name,
        archetype: char.archetypeClass,
        badgeColor: char.colors.badge,
        races: count,
        pickRatePct: (count / totalCompleted) * 100,
        wins,
        winRatePct: count > 0 ? (wins / count) * 100 : 0,
        avgRank: count > 0 ? rankSum / count : null,
        avgLap1Ms,
        avgFlyMs,
        bestFlyMs,
        avgMt,
        avgShoves,
        avgHits,
      };
    });
  }, [filteredRaces]);

  const handleCopyFullBuildReport = useCallback(() => {
    if (!dataset) return;
    const lines: string[] = [
      `# Gutsy Karts Telemetry & Balance Report (${effectiveBuildFilter})`,
      `- **Current Build Stamp**: ${dataset.currentBuildStamp}`,
      `- **Filter**: ${effectiveBuildFilter} | **Human Visitor Sessions**: ${uxSummary.totalSessions} (Desktop: ${uxSummary.desktopCount}, Mobile: ${uxSummary.mobileCount})`,
      `- **Time Allocation**: Driving=${formatDurationSec(uxSummary.racingSec)}, Lobby=${formatDurationSec(uxSummary.lobbySec)}, CircuitStudio=${formatDurationSec(uxSummary.studioSec)}, Spectating=${formatDurationSec(uxSummary.spectatingSec)}`,
      `- **Feature Usage**: RacesStarted=${uxSummary.racesStarted}, Completed=${uxSummary.racesCompleted}, Abandoned=${uxSummary.racesAbandoned}, StudioOpens=${uxSummary.studioOpens}, CustomTracksSaved=${uxSummary.tracksSaved}, OnlineHosted=${uxSummary.roomsHosted}, OnlineJoined=${uxSummary.roomsJoined}`,
      ``,
      `## Human Gameplay Character Balance (${filteredRaces.filter((r) => r.status === "completed").length} completed races)`,
      `| Character | Picked | Win % | Avg Place | Avg L1 / Fly Lap | Best Fly Lap | MTs/Race | Bumps (Shove/Hit) |`,
      `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`,
    ];

    for (const c of humanCharBalance) {
      lines.push(
        `| **${c.characterName}** | ${c.races} (${c.pickRatePct.toFixed(0)}%) | ${c.winRatePct.toFixed(0)}% (${c.wins}W) | ${c.avgRank ? c.avgRank.toFixed(2) : "--"} | ${formatMs(c.avgLap1Ms)} / ${formatMs(c.avgFlyMs)} | ${formatMs(c.bestFlyMs)} | ${c.avgMt.toFixed(1)} | ${c.avgShoves.toFixed(1)} / ${c.avgHits.toFixed(1)} |`
      );
    }

    if (filteredAiLabs.length > 0) {
      lines.push(``, `## Synced Cloud AI Sim Lab Nodes (${filteredAiLabs.length})`);
      for (const lab of filteredAiLabs) {
        lines.push(
          `### Node: ${lab.machine_label} (${lab.build_pass} • Gen #${lab.generation} • ${lab.episodes_completed} eps)`,
          lab.report_markdown || "_No markdown report attached._"
        );
      }
    }

    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(lines.join("\n"));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    }
  }, [
    dataset,
    effectiveBuildFilter,
    uxSummary,
    filteredRaces,
    humanCharBalance,
    filteredAiLabs,
  ]);

  const handlePruneOldBuilds = useCallback(async () => {
    const res = await globalAnalytics.pruneBuildData({
      mode: "ALL_EXCEPT_CURRENT",
    });
    setPruneNotice(
      res.deletedBuildPasses.length > 0
        ? `Cleared old build data (${res.deletedBuildPasses.join(", ")}) from storage.`
        : `Storage is already clean — only ${dataset?.currentBuildPass ?? "current build"} rows exist.`
    );
    setTimeout(() => setPruneNotice(null), 4000);
    await refreshData();
  }, [dataset?.currentBuildPass, refreshData]);

  const handlePruneSelectedBuild = useCallback(async () => {
    if (!effectiveBuildFilter || effectiveBuildFilter === "ALL") return;
    await globalAnalytics.pruneBuildData({
      mode: "ONLY_SPECIFIED_BUILD",
      targetBuildPass: effectiveBuildFilter,
    });
    setPruneNotice(`Cleared telemetry rows for ${effectiveBuildFilter}.`);
    setTimeout(() => setPruneNotice(null), 4000);
    setSelectedBuildPass("CURRENT");
    await refreshData();
  }, [effectiveBuildFilter, refreshData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cyan-500/40 bg-zinc-950/95 text-zinc-100 shadow-2xl">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/80 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide uppercase text-white">
                  Build Telemetry &amp; Balance Analytics
                </h2>
                <span className="rounded-md bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                  {dataset?.currentBuildPass ?? "Pass #21"}
                </span>
                {dataset?.supabaseConfigured && dataset?.supabaseTablesReady ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <Database className="h-3 w-3" /> SUPABASE CLOUD ROLLING
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    <Database className="h-3 w-3" /> REALTIME + LOCAL CACHE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                Categorized into{" "}
                <strong className="text-zinc-200">Website UX</strong>,{" "}
                <strong className="text-zinc-200">Human Gameplay Balance</strong>
                , and{" "}
                <strong className="text-zinc-200">
                  Rolling AI Sim Lab Nodes
                </strong>{" "}
                • Zero Free-Tier Bloat
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Build Pass Filter */}
            <select
              value={selectedBuildPass}
              onChange={(e) => setSelectedBuildPass(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="CURRENT">
                Current Build ({dataset?.currentBuildPass ?? "Pass #21"})
              </option>
              <option value="ALL">All Stored Builds</option>
              {(dataset?.availableBuildPasses ?? [])
                .filter((bp) => bp !== dataset?.currentBuildPass)
                .map((bp) => (
                  <option key={bp} value={bp}>
                    {bp} (Historical)
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={handleCopyFullBuildReport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/20 px-3 py-1.5 text-xs font-black uppercase text-fuchsia-200 hover:bg-fuchsia-500/30 transition cursor-pointer"
              title="Copy full Markdown analytics & balance report for Antigravity"
            >
              {copiedReport ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-300" /> Copied
                  Build Report
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy Report for AI
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePruneOldBuilds}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition cursor-pointer"
              title="Delete all telemetry rows from older builds to keep Supabase Free Tier clean"
            >
              <Trash2 className="h-3.5 w-3.5" /> Roll Over / Prune Old Builds
            </button>

            <button
              type="button"
              onClick={() => void refreshData()}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 transition cursor-pointer"
              title="Refresh telemetry"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-800/90 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-white transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Optional Setup SQL Banner if Supabase tables haven't been created yet */}
        {dataset?.supabaseConfigured && !dataset?.supabaseTablesReady && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-200">
            <div>
              <strong>One-Time Supabase Table Setup:</strong> Live Realtime sync
              &amp; local caching are active right now. To persist tables in
              Supabase Postgres, copy the schema SQL and run it once in your
              Supabase SQL Editor.
            </div>
            <button
              type="button"
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  void navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-500/20 px-3 py-1 text-[11px] font-black uppercase text-amber-100 hover:bg-amber-500/30 cursor-pointer"
            >
              {copiedSql ? "Copied SQL ✓" : "Copy Setup SQL"}
            </button>
          </div>
        )}

        {pruneNotice && (
          <div className="border-b border-emerald-500/30 bg-emerald-500/15 px-5 py-2 text-xs font-bold text-emerald-200">
            {pruneNotice}
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/40 px-5 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("WEBSITE_UX")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                activeTab === "WEBSITE_UX"
                  ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/50"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Globe className="h-3.5 w-3.5" /> 1. Website &amp; Feature UX (
              {uxSummary.totalSessions})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("HUMAN_BALANCE")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                activeTab === "HUMAN_BALANCE"
                  ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/50"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Trophy className="h-3.5 w-3.5" /> 2. Human Gameplay Balance (
              {filteredRaces.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("AI_SIM_LAB")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase transition cursor-pointer ${
                activeTab === "AI_SIM_LAB"
                  ? "bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/50"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Bot className="h-3.5 w-3.5" /> 3. Cloud AI Sim Lab Nodes (
              {filteredAiLabs.length})
            </button>
          </div>

          {effectiveBuildFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => void handlePruneSelectedBuild()}
              className="text-[11px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
            >
              Clear all {effectiveBuildFilter} data
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === "WEBSITE_UX" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-400">
                  Tracks how visitors explore Gutsy Karts (1 upserted row per
                  visitor session). AI training computers are automatically
                  excluded from visitor UX metrics unless toggled on.
                </p>
                <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAiSimSessionsInUx}
                    onChange={(e) =>
                      setIncludeAiSimSessionsInUx(e.target.checked)
                    }
                    className="rounded border-zinc-700 bg-zinc-900"
                  />
                  Include AI Training Machine Sessions
                </label>
              </div>

              {/* Top KPI Cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                  <div className="text-[10px] font-bold uppercase text-zinc-400">
                    Visitor Sessions ({effectiveBuildFilter})
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    {uxSummary.totalSessions}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Desktop: <strong>{uxSummary.desktopCount}</strong> • Mobile:{" "}
                    <strong>{uxSummary.mobileCount}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                  <div className="text-[10px] font-bold uppercase text-zinc-400">
                    Avg Time on Site
                  </div>
                  <div className="mt-1 text-2xl font-black text-cyan-300">
                    {formatDurationSec(uxSummary.avgSessionSec)}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Total Engaged:{" "}
                    <strong>
                      {formatDurationSec(uxSummary.totalScreenSec)}
                    </strong>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                  <div className="text-[10px] font-bold uppercase text-zinc-400">
                    Human Races (Finish Rate)
                  </div>
                  <div className="mt-1 text-2xl font-black text-emerald-300">
                    {uxSummary.racesCompleted} / {uxSummary.racesStarted}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Abandoned mid-race:{" "}
                    <strong>{uxSummary.racesAbandoned}</strong>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                  <div className="text-[10px] font-bold uppercase text-zinc-400">
                    Circuit Studio &amp; Online
                  </div>
                  <div className="mt-1 text-2xl font-black text-amber-300">
                    {uxSummary.studioOpens} opens
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Saved Maps: <strong>{uxSummary.tracksSaved}</strong> •
                    Online Rooms:{" "}
                    <strong>
                      {uxSummary.roomsHosted + uxSummary.roomsJoined}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Where Visitors Spend Time */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-200 mb-3">
                  Where Visitors Spend Their Time
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  {[
                    {
                      label: "Driving Races (Active Kart)",
                      sec: uxSummary.racingSec,
                      color: "bg-emerald-500",
                    },
                    {
                      label: "Lobby / Cup & Racer Select",
                      sec: uxSummary.lobbySec,
                      color: "bg-cyan-500",
                    },
                    {
                      label: "Circuit Studio (Map Designer)",
                      sec: uxSummary.studioSec,
                      color: "bg-amber-500",
                    },
                    {
                      label: "Spectating AI / Online",
                      sec: uxSummary.spectatingSec,
                      color: "bg-fuchsia-500",
                    },
                  ].map((item) => {
                    const pct = Math.round(
                      (item.sec / uxSummary.totalScreenSec) * 100
                    );
                    return (
                      <div
                        key={item.label}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3"
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-zinc-300">{item.label}</span>
                          <span className="text-white">{pct}%</span>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-400">
                          {formatDurationSec(item.sec)}
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full ${item.color}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feature Engagement Breakdown */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-200 mb-3">
                  Feature Interaction Counters
                </h3>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8 text-center">
                  {[
                    { label: "Races Started", val: uxSummary.racesStarted },
                    { label: "Races Finished", val: uxSummary.racesCompleted },
                    { label: "Races Quit", val: uxSummary.racesAbandoned },
                    { label: "Studio Opened", val: uxSummary.studioOpens },
                    { label: "Tracks Saved", val: uxSummary.tracksSaved },
                    { label: "Rooms Hosted", val: uxSummary.roomsHosted },
                    { label: "Rooms Joined", val: uxSummary.roomsJoined },
                    { label: "AI Takeovers", val: uxSummary.takeovers },
                  ].map((f) => (
                    <div
                      key={f.label}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5"
                    >
                      <div className="text-lg font-black text-white">
                        {f.val}
                      </div>
                      <div className="text-[10px] font-bold uppercase text-zinc-400">
                        {f.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "HUMAN_BALANCE" && (
            <div className="space-y-5">
              <p className="text-xs text-zinc-400">
                Empirical character balance from{" "}
                <strong className="text-zinc-200">
                  real human-driven races
                </strong>{" "}
                (excludes AI self-training simulations and spectator sessions).
              </p>

              <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-800 bg-zinc-900/90 text-[10px] font-black uppercase text-zinc-400">
                    <tr>
                      <th className="px-3 py-2.5">Character</th>
                      <th className="px-3 py-2.5 text-center">
                        Picked (Share)
                      </th>
                      <th className="px-3 py-2.5 text-center">Win % (Wins)</th>
                      <th className="px-3 py-2.5 text-center">Avg Place</th>
                      <th className="px-3 py-2.5 text-center">
                        Avg Lap 1 / Flying Lap
                      </th>
                      <th className="px-3 py-2.5 text-center">
                        Best Flying Lap
                      </th>
                      <th className="px-3 py-2.5 text-center">MTs / Race</th>
                      <th className="px-3 py-2.5 text-center">
                        Bumps (Shove / Hit)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {humanCharBalance.map((c) => (
                      <tr key={c.characterId} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2.5 font-bold text-white">
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: c.badgeColor }}
                          />
                          {c.characterName}{" "}
                          <span className="text-[10px] text-zinc-400">
                            ({c.archetype})
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.races} ({c.pickRatePct.toFixed(0)}%)
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-emerald-300">
                          {c.winRatePct.toFixed(0)}% ({c.wins}W)
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.avgRank ? c.avgRank.toFixed(2) : "--"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono">
                          {formatMs(c.avgLap1Ms)} / {formatMs(c.avgFlyMs)}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-cyan-300">
                          {formatMs(c.bestFlyMs)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.avgMt.toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.avgShoves.toFixed(1)} / {c.avgHits.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recent Human Races Log */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-200 mb-3">
                  Recent Human Race Sessions ({filteredRaces.length})
                </h3>
                {filteredRaces.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No human races recorded yet for {effectiveBuildFilter}.
                    Complete or leave a race to see telemetry here.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-zinc-800 text-[10px] font-bold uppercase text-zinc-400">
                        <tr>
                          <th className="py-1.5 pr-2">Player</th>
                          <th className="py-1.5 px-2">Track</th>
                          <th className="py-1.5 px-2">Character</th>
                          <th className="py-1.5 px-2">Mode</th>
                          <th className="py-1.5 px-2 text-center">Result</th>
                          <th className="py-1.5 px-2 text-center">Race Time</th>
                          <th className="py-1.5 px-2 text-center">Best Fly</th>
                          <th className="py-1.5 pl-2 text-right">Build</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {filteredRaces.slice(0, 30).map((r) => (
                          <tr key={r.race_id}>
                            <td className="py-1.5 pr-2 font-bold text-zinc-200">
                              {r.player_name}
                            </td>
                            <td className="py-1.5 px-2 text-zinc-300">
                              {r.track_name}
                            </td>
                            <td className="py-1.5 px-2 text-zinc-300">
                              {r.character_id}
                            </td>
                            <td className="py-1.5 px-2 text-zinc-400">
                              {r.mode}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              {r.status === "abandoned" ? (
                                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                                  QUIT
                                </span>
                              ) : (
                                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                  P{r.placement ?? "-"}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono">
                              {formatMs(r.finish_time_ms)}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono text-cyan-300">
                              {formatMs(r.best_flying_lap_ms)}
                            </td>
                            <td className="py-1.5 pl-2 text-right text-[10px] text-zinc-400">
                              {r.build_pass}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "AI_SIM_LAB" && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">
                Rolling single-row upserts from your{" "}
                <strong className="text-zinc-200">
                  4-AI Self-Training Simulation
                </strong>{" "}
                nodes. Each training computer overwrites 1 single row per build
                pass so 5,000+ training episodes never bloat your Supabase
                database.
              </p>

              {filteredAiLabs.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-xs text-zinc-400">
                  No AI Self-Training Lab snapshots synced yet for{" "}
                  <strong>{effectiveBuildFilter}</strong>. Start{" "}
                  <strong>4-AI Self-Training Sim</strong> on any machine and it
                  will automatically upsert here after each episode.
                </div>
              ) : (
                filteredAiLabs.map((lab) => (
                  <div
                    key={`${lab.build_pass}::${lab.peer_id}`}
                    className="rounded-xl border border-fuchsia-500/30 bg-zinc-900/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white">
                            {lab.machine_label}
                          </span>
                          <span className="rounded bg-fuchsia-500/20 border border-fuchsia-400/40 px-2 py-0.5 text-[10px] font-bold text-fuchsia-200">
                            {lab.build_pass} ({lab.build_sha})
                          </span>
                          <span className="rounded bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
                            Gen #{lab.generation} • {lab.episodes_completed}{" "}
                            Episodes
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          Regime: Items={lab.items_enabled ? "ON" : "OFF"} •
                          Mode={lab.training_track_mode} • Champion Fitness:{" "}
                          <strong className="text-emerald-300">
                            {Number(lab.champion_fitness).toFixed(1)}/100
                          </strong>{" "}
                          • Best AI Lap:{" "}
                          <strong className="text-cyan-300">
                            {formatMs(lab.champion_best_lap_ms)}
                          </strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (
                            lab.report_markdown &&
                            navigator?.clipboard?.writeText
                          ) {
                            void navigator.clipboard.writeText(
                              lab.report_markdown
                            );
                            setCopiedReport(true);
                            setTimeout(() => setCopiedReport(false), 2500);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/50 bg-fuchsia-500/20 px-3 py-1.5 text-xs font-black uppercase text-fuchsia-200 hover:bg-fuchsia-500/30 cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy Node AI Report
                      </button>
                    </div>

                    {Array.isArray(lab.character_balance) &&
                      lab.character_balance.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-zinc-800 text-[10px] font-bold uppercase text-zinc-400">
                              <tr>
                                <th className="px-3 py-2">Character</th>
                                <th className="px-3 py-2 text-center">Races</th>
                                <th className="px-3 py-2 text-center">Win %</th>
                                <th className="px-3 py-2 text-center">
                                  Avg Rank
                                </th>
                                <th className="px-3 py-2 text-center">
                                  Avg Lap (L1 / Fly)
                                </th>
                                <th className="px-3 py-2 text-center">
                                  Bumps (Shove/Hit)
                                </th>
                                <th className="px-3 py-2 text-center">
                                  MTs/Race
                                </th>
                                <th className="px-3 py-2">Advisor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                              {lab.character_balance.map((cb) => (
                                <tr key={cb.characterId}>
                                  <td className="px-3 py-2 font-bold text-white">
                                    {cb.characterName}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {cb.racesCompleted}
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-emerald-300">
                                    {cb.winRatePct.toFixed(0)}% ({cb.wins}W)
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {cb.avgFinishRank.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono">
                                    {formatMs(cb.avgLap1Ms)} /{" "}
                                    {formatMs(cb.avgFlyingLapMs)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {cb.avgShovesPerRace.toFixed(1)} /{" "}
                                    {cb.avgHitsTakenPerRace.toFixed(1)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {cb.avgMiniTurbosPerRace.toFixed(1)}
                                  </td>
                                  <td className="px-3 py-2 text-[11px] text-zinc-300">
                                    {cb.recommendation}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
