"use client";

import React, { useState, useEffect } from "react";
import { Shield, LogIn, UserPlus, LogOut, Sparkles, Check, AlertCircle, X, Trophy } from "lucide-react";
import {
  communityTrackClient,
  CommunityAuthUser,
} from "@/src/game/network/CommunityTrackClient";

interface RacerAuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultCallsign?: string;
  reasonPrompt?: string | null;
  onAuthenticated?: (user: CommunityAuthUser) => void;
}

export function RacerAuthModal({
  open,
  onClose,
  defaultCallsign = "GutsyRacer",
  reasonPrompt,
  onAuthenticated,
}: RacerAuthModalProps) {
  const [mode, setMode] = useState<"SIGN_IN" | "SIGN_UP">("SIGN_IN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [callsign, setCallsign] = useState(defaultCallsign);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CommunityAuthUser | null>(
    communityTrackClient.getUser()
  );

  useEffect(() => {
    const unsub = communityTrackClient.onAuthChange((user) => {
      setCurrentUser(user);
      if (user?.callsign) {
        setCallsign(user.callsign);
      }
    });
    return unsub;
  }, []);

  if (!open) return null;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      if (mode === "SIGN_UP") {
        const res = await communityTrackClient.signUpWithEmail(
          email,
          password,
          callsign
        );
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.needsEmailConfirmation) {
          setInfoMsg(
            "Check your email inbox to confirm your account, then click Sign In!"
          );
          setMode("SIGN_IN");
        } else if (res.user) {
          setInfoMsg(`Welcome, ${res.user.callsign}! Account verified.`);
          onAuthenticated?.(res.user);
        }
      } else {
        const res = await communityTrackClient.signInWithEmail(email, password);
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.user) {
          setInfoMsg(`Signed in as ${res.user.callsign}!`);
          onAuthenticated?.(res.user);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    const res = await communityTrackClient.signInWithGoogle();
    if (res.error) {
      setErrorMsg(res.error);
      setLoading(false);
    }
  };

  const handleUpdateCallsign = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    const res = await communityTrackClient.updateCallsign(callsign);
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setInfoMsg("Verified Racer Callsign updated!");
    }
  };

  return (
    <div
      data-testid="racer-auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border-2 border-cyan-400/50 bg-slate-900 p-6 text-white shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 border border-cyan-400/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-300">
              <Shield className="w-3 h-3" /> Verified Community Account
            </div>
            <h2 className="mt-1.5 text-xl font-black text-white">
              {currentUser
                ? "Verified Racer Profile"
                : mode === "SIGN_IN"
                ? "Sign In to Gutsy Karts"
                : "Create Racer Account"}
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

        {reasonPrompt && !currentUser && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs text-amber-200 font-semibold">
            {reasonPrompt}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-400/50 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200 font-bold">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200 font-bold">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {currentUser ? (
          /* Signed-In View with Cloud Career Trophy Case */
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-400/40 bg-slate-950/80 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 uppercase">Status</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-black text-emerald-300">
                  <Check className="w-3 h-3" /> SUPABASE VERIFIED
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 uppercase">Email</span>
                <span className="font-mono text-slate-200">{currentUser.email}</span>
              </div>
            </div>

            {/* Cloud Career Trophy Case */}
            <div
              data-testid="racer-career-trophy-case"
              className="rounded-2xl border border-amber-400/35 bg-slate-950/90 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-300">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Cloud Career Trophy Case
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {currentUser.racesCompleted > 0
                    ? `${Math.round(
                        (currentUser.firstPlaceWins / currentUser.racesCompleted) * 100
                      )}% Win Rate`
                    : "Ready to Race"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-slate-900/90 p-2.5">
                  <div className="text-lg font-black text-white">
                    {currentUser.racesCompleted}
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                    Races
                  </div>
                </div>
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5">
                  <div className="text-lg font-black text-amber-300">
                    {currentUser.firstPlaceWins}
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-amber-200/80">
                    1st Wins
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-2.5">
                  <div className="text-lg font-black text-cyan-300">
                    {currentUser.podiumFinishes}
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-wider text-cyan-200/80">
                    Podiums
                  </div>
                </div>
              </div>

              <div className="pt-1 border-t border-white/10">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Championship Cups Won ({currentUser.cupsWon.length})
                </div>
                {currentUser.cupsWon.length === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Finish 1st overall in any Grand Prix Cup to earn your first cloud Cup Trophy!
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {currentUser.cupsWon.map((cupId) => (
                      <span
                        key={cupId}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-200"
                      >
                        <Trophy className="w-2.5 h-2.5 text-amber-300" />
                        {cupId.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleUpdateCallsign} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Verified Creator &amp; Leaderboard Callsign
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={callsign}
                    maxLength={24}
                    onChange={(e) => setCallsign(e.target.value)}
                    className="flex-1 rounded-xl border border-white/20 bg-slate-950 px-3 py-2 text-xs font-black text-amber-300 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-cyan-500/25 border border-cyan-400/50 px-3.5 py-2 text-xs font-black uppercase text-cyan-200 hover:bg-cyan-500/35 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={async () => {
                  await communityTrackClient.signOut();
                  setInfoMsg("Signed out.");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3.5 py-2 text-xs font-black uppercase text-rose-200 hover:bg-rose-500/25 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-2 text-xs font-black uppercase text-slate-950 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Sign In / Sign Up Form */
          <div className="space-y-4">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("SIGN_IN");
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black uppercase transition cursor-pointer ${
                  mode === "SIGN_IN"
                    ? "bg-cyan-400 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("SIGN_UP");
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black uppercase transition cursor-pointer ${
                  mode === "SIGN_UP"
                    ? "bg-amber-400 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" /> Create Account
              </button>
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white text-slate-950 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-slate-100 transition cursor-pointer shadow"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-slate-900 px-3 text-[10px] font-bold uppercase text-slate-400">
                OR EMAIL
              </span>
              <div className="border-t border-white/10 w-full" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {mode === "SIGN_UP" && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Racer Callsign (Shown on Published Tracks)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={24}
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    placeholder="e.g. TurboBuilder"
                    className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950 px-3.5 py-2.5 text-xs font-black text-amber-300 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="racer@example.com"
                  className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Password (min 6 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg hover:brightness-110 transition cursor-pointer"
              >
                {loading
                  ? "Verifying..."
                  : mode === "SIGN_IN"
                  ? "Sign In"
                  : "Create Verified Account"}
              </button>
            </form>

            <p className="text-[11px] text-slate-400 leading-relaxed text-center">
              Accounts protect the Community Circuit Catalog from spam (enforced by Supabase RLS: max 1 new track per 60s, 10/day, and 1 upvote per account).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
