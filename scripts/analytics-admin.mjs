#!/usr/bin/env node
/**
 * Gutsy Karts 3D — Build Telemetry & Rolling Analytics Admin CLI
 *
 * Usage:
 *   node scripts/analytics-admin.mjs summary [buildPass]
 *   node scripts/analytics-admin.mjs prune --keep="Pass #21"
 *   node scripts/analytics-admin.mjs prune --delete="Pass #20"
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {};
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

function formatMs(ms) {
  if (ms === null || ms === undefined || ms <= 0) return "--:--.--";
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${hundredths
    .toString()
    .padStart(2, "0")}`;
}

function formatSec(sec) {
  if (!sec || sec < 60) return `${sec || 0}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const args = process.argv.slice(2);
  const cmd = args[0] || "summary";

  if (cmd === "prune") {
    const keepArg = args.find((a) => a.startsWith("--keep="));
    const deleteArg = args.find((a) => a.startsWith("--delete="));

    if (keepArg) {
      const keepPass = keepArg.slice("--keep=".length);
      console.log(`Pruning all Supabase analytics rows EXCEPT build_pass="${keepPass}"...`);
      await Promise.all([
        supabase.from("gutsy_analytics_sessions").delete().neq("build_pass", keepPass),
        supabase.from("gutsy_analytics_races").delete().neq("build_pass", keepPass),
        supabase.from("gutsy_analytics_ai_lab").delete().neq("build_pass", keepPass),
      ]);
      console.log("Done.");
      return;
    }

    if (deleteArg) {
      const delPass = deleteArg.slice("--delete=".length);
      console.log(`Deleting Supabase analytics rows for build_pass="${delPass}"...`);
      await Promise.all([
        supabase.from("gutsy_analytics_sessions").delete().eq("build_pass", delPass),
        supabase.from("gutsy_analytics_races").delete().eq("build_pass", delPass),
        supabase.from("gutsy_analytics_ai_lab").delete().eq("build_pass", delPass),
      ]);
      console.log("Done.");
      return;
    }

    console.error('Usage: node scripts/analytics-admin.mjs prune --keep="Pass #21" OR --delete="Pass #20"');
    process.exit(1);
  }

  // Default: summary
  const buildFilter = args[1] || null;
  const [sessRes, raceRes, aiRes] = await Promise.all([
    supabase.from("gutsy_analytics_sessions").select("*").order("updated_at", { ascending: false }).limit(300),
    supabase.from("gutsy_analytics_races").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("gutsy_analytics_ai_lab").select("*").order("updated_at", { ascending: false }).limit(50),
  ]);

  if (sessRes.error || raceRes.error || aiRes.error) {
    console.log(
      " Note: Supabase analytics tables are not created yet in Postgres."
    );
    console.log(
      "Run the SQL in `supabase/analytics_schema.sql` once in your Supabase SQL Editor (https://supabase.com/dashboard)."
    );
    return;
  }

  const sessions = (sessRes.data || []).filter(
    (s) => (!buildFilter || s.build_pass === buildFilter) && !s.is_ai_sim_machine
  );
  const races = (raceRes.data || []).filter(
    (r) => !buildFilter || r.build_pass === buildFilter
  );
  const aiLabs = (aiRes.data || []).filter(
    (a) => !buildFilter || a.build_pass === buildFilter
  );

  console.log(`# Gutsy Karts Cloud Telemetry Summary (${buildFilter || "All Builds"})`);
  console.log(`\n## 1. Website & Feature UX (${sessions.length} Visitor Sessions)`);
  let lobbySec = 0,
    raceSec = 0,
    studioSec = 0,
    specSec = 0,
    studioOpens = 0,
    tracksSaved = 0,
    roomsHosted = 0,
    roomsJoined = 0;
  for (const s of sessions) {
    lobbySec += s.lobby_select_sec || 0;
    raceSec += s.racing_active_sec || 0;
    studioSec += s.circuit_studio_sec || 0;
    specSec += s.spectating_sec || 0;
    studioOpens += s.circuit_studio_opens || 0;
    tracksSaved += s.custom_tracks_saved || 0;
    roomsHosted += s.online_rooms_hosted || 0;
    roomsJoined += s.online_rooms_joined || 0;
  }
  console.log(
    `- **Time Breakdown**: Driving=${formatSec(raceSec)}, Lobby=${formatSec(lobbySec)}, CircuitStudio=${formatSec(studioSec)}, Spectating=${formatSec(specSec)}`
  );
  console.log(
    `- **Features**: StudioOpens=${studioOpens}, CustomTracksSaved=${tracksSaved}, OnlineHosted=${roomsHosted}, OnlineJoined=${roomsJoined}`
  );

  console.log(`\n## 2. Human Gameplay Races (${races.length} Recorded)`);
  const completed = races.filter((r) => r.status === "completed");
  const chars = ["rex_ironclad", "aero_vance", "nyx_drift", "pip_spark"];
  console.log(
    `| Character | Completed | Wins (Win %) | Avg Place | Best Flying Lap |`
  );
  console.log(`| :--- | :---: | :---: | :---: | :---: |`);
  for (const cid of chars) {
    const cr = completed.filter((r) => r.character_id === cid);
    const wins = cr.filter((r) => r.placement === 1).length;
    const avgPlace =
      cr.length > 0
        ? (cr.reduce((a, r) => a + (r.placement || 4), 0) / cr.length).toFixed(2)
        : "--";
    const flyTimes = cr
      .map((r) => r.best_flying_lap_ms)
      .filter((ms) => ms && ms > 1000);
    const bestFly = flyTimes.length > 0 ? Math.min(...flyTimes) : null;
    console.log(
      `| **${cid}** | ${cr.length} | ${wins} (${cr.length > 0 ? Math.round((wins / cr.length) * 100) : 0}%) | ${avgPlace} | ${formatMs(bestFly)} |`
    );
  }

  console.log(`\n## 3. Synced Cloud AI Sim Lab Nodes (${aiLabs.length})`);
  for (const lab of aiLabs) {
    console.log(
      `\n### ${lab.machine_label} — ${lab.build_pass} (Gen #${lab.generation}, ${lab.episodes_completed} Episodes)`
    );
    if (lab.report_markdown) {
      console.log(lab.report_markdown);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
