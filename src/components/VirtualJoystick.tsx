"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  Flame,
  ShieldAlert,
  Sparkles,
  Zap,
  Crosshair,
  Disc,
  ArrowUpFromLine,
  Rocket,
  Box,
} from "lucide-react";
import { MiniTurboTier, PowerUpType } from "@/src/types/game";
import { POWER_UP_CATALOG } from "@/src/game/data/roster";

export interface TouchControlCallbacks {
  onJoystickChange: (steer: number, throttle: number, brake: number) => void;
  onJumpDriftStart: () => void;
  onJumpDriftEnd: () => void;
  onTriggerPowerUp: () => void;
  onBrakeHoldChange: (held: boolean) => void;
}

interface VirtualJoystickProps {
  callbacks: TouchControlCallbacks;
  heldItem: PowerUpType | null;
  rouletteSpinning: boolean;
  roulettePreviewItem: PowerUpType | null;
  isDrifting: boolean;
  miniTurboTier: MiniTurboTier;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  callbacks,
  heldItem,
  rouletteSpinning,
  roulettePreviewItem,
  isDrifting,
  miniTurboTier,
}) => {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [joystickActive, setJoystickActive] = useState(false);
  const [jumpHeld, setJumpHeld] = useState(false);
  const [brakeHeld, setBrakeHeld] = useState(false);
  const [autoGas, setAutoGas] = useState(true);

  const maxRadius = 52;

  const updateStickFromClientXY = useCallback(
    (clientX: number, clientY: number) => {
      const el = baseRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const rawDx = clientX - centerX;
      const rawDy = clientY - centerY;
      const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
      const clampedDist = Math.min(dist, maxRadius);
      const angle = Math.atan2(rawDy, rawDx);

      const clampedX = Math.cos(angle) * clampedDist;
      const clampedY = Math.sin(angle) * clampedDist;
      setKnobOffset({ x: clampedX, y: clampedY });

      const normX = clampedX / maxRadius; // -1 (left) to +1 (right)
      const normY = clampedY / maxRadius; // -1 (up) to +1 (down)

      // Deadzone for tiny thumb jitter
      const steer =
        Math.abs(normX) < 0.08
          ? 0
          : Math.max(-1, Math.min(1, normX * 1.15));

      // Pulling straight down (> 0.55) engages brake/reverse; otherwise forward throttle when autoGas is enabled or stick pushed up/sideways
      let throttle = 0;
      let brake = 0;
      if (normY > 0.55) {
        brake = Math.min(1, (normY - 0.45) * 1.8);
        throttle = 0;
      } else if (autoGas || normY < 0.35 || Math.abs(normX) > 0.15) {
        throttle = 1.0;
        brake = 0;
      }

      callbacks.onJoystickChange(steer, throttle, brake);
    },
    [autoGas, callbacks]
  );

  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    activePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setJoystickActive(true);
    updateStickFromClientXY(e.clientX, e.clientY);
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.preventDefault();
    updateStickFromClientXY(e.clientX, e.clientY);
  };

  const handleJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.preventDefault();
    activePointerId.current = null;
    setJoystickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    callbacks.onJoystickChange(0, 0, 0);
  };

  const displayItem = rouletteSpinning ? roulettePreviewItem : heldItem;
  const itemMeta = displayItem ? POWER_UP_CATALOG[displayItem] : null;

  const renderPowerUpIcon = (type: PowerUpType | null) => {
    if (type === "NITRO_CORE") return <Flame className="w-6 h-6 text-orange-300" />;
    if (type === "PULSE_SEEKER") return <Crosshair className="w-6 h-6 text-red-300" />;
    if (type === "RICOCHET_DISC") return <Disc className="w-6 h-6 text-emerald-300" />;
    if (type === "CRYO_MINE") return <ShieldAlert className="w-6 h-6 text-yellow-300" />;
    if (type === "NOVA_OVERDRIVE") return <Sparkles className="w-6 h-6 text-amber-200" />;
    if (type === "LIL_SAUCER") return <Rocket className="w-6 h-6 text-purple-300" />;
    if (type === "GLITCH_PRISM") return <Box className="w-6 h-6 text-rose-300" />;
    return <Zap className="w-6 h-6 text-slate-400" />;
  };

  const jumpGlowClass =
    miniTurboTier === 3
      ? "border-fuchsia-400 bg-fuchsia-600/80 shadow-[0_0_28px_rgba(217,70,239,0.85)]"
      : miniTurboTier === 2
      ? "border-orange-400 bg-orange-600/80 shadow-[0_0_24px_rgba(249,115,22,0.8)]"
      : miniTurboTier === 1
      ? "border-cyan-400 bg-cyan-600/80 shadow-[0_0_22px_rgba(34,211,238,0.8)]"
      : jumpHeld || isDrifting
      ? "border-amber-300 bg-indigo-600/85 shadow-[0_0_18px_rgba(99,102,241,0.7)]"
      : "border-white/30 bg-slate-900/75 hover:bg-slate-800/80";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-between p-4 sm:p-6 select-none">
      {/* BOTTOM-LEFT: Virtual Thumbstick + Auto-Gas Toggle */}
      <div className="pointer-events-auto flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoGas((v) => !v)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition border ${
              autoGas
                ? "bg-emerald-500/85 text-slate-950 border-emerald-300"
                : "bg-slate-900/80 text-slate-300 border-white/20"
            }`}
          >
            {autoGas ? "Stick Auto-Gas: ON" : "Stick Auto-Gas: OFF"}
          </button>
          <span className="hidden sm:inline text-[11px] font-medium text-slate-300/85 bg-slate-950/60 px-2.5 py-0.5 rounded-full border border-white/10">
            Drag to Steer + Drive
          </span>
        </div>

        <div
          ref={baseRef}
          data-testid="virtual-joystick"
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          className={`relative flex h-32 w-32 sm:h-36 sm:w-36 touch-none items-center justify-center rounded-full border-2 backdrop-blur-md transition-colors ${
            joystickActive
              ? "border-cyan-400/80 bg-slate-900/80 shadow-[0_0_24px_rgba(34,211,238,0.35)]"
              : "border-white/25 bg-slate-900/60"
          }`}
        >
          {/* Crosshair Axis Guides */}
          <div className="pointer-events-none absolute inset-4 rounded-full border border-dashed border-white/15" />
          <div className="pointer-events-none absolute h-full w-px bg-white/10" />
          <div className="pointer-events-none absolute h-px w-full bg-white/10" />
          <span className="pointer-events-none absolute top-2 text-[9px] font-bold tracking-widest text-white/45">
            GAS
          </span>
          <span className="pointer-events-none absolute bottom-2 text-[9px] font-bold tracking-widest text-white/45">
            REV
          </span>
          <span className="pointer-events-none absolute left-2 text-[9px] font-bold tracking-widest text-white/45">
            L
          </span>
          <span className="pointer-events-none absolute right-2 text-[9px] font-bold tracking-widest text-white/45">
            R
          </span>

          {/* Movable Thumb Knob */}
          <div
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
            className={`pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border-2 transition-shadow ${
              joystickActive
                ? "border-white bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg"
                : "border-white/60 bg-gradient-to-br from-slate-700 to-slate-900 shadow-md"
            }`}
          >
            <div className="h-5 w-5 rounded-full bg-white/35" />
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Power-Up Button + Jump / Hold-to-Drift Button + Brake */}
      <div className="pointer-events-auto flex items-end gap-3 sm:gap-4">
        {/* Secondary Touch Brake / Reverse button */}
        <button
          type="button"
          data-testid="mobile-brake-btn"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setBrakeHeld(true);
            callbacks.onBrakeHoldChange(true);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            setBrakeHeld(false);
            callbacks.onBrakeHoldChange(false);
          }}
          onPointerCancel={() => {
            setBrakeHeld(false);
            callbacks.onBrakeHoldChange(false);
          }}
          className={`flex h-14 w-14 sm:h-16 sm:w-16 touch-none flex-col items-center justify-center rounded-2xl border-2 font-black tracking-wider uppercase backdrop-blur-md transition ${
            brakeHeld
              ? "border-rose-400 bg-rose-600/85 text-white scale-95"
              : "border-white/25 bg-slate-900/75 text-slate-300 hover:bg-slate-800/80"
          }`}
        >
          <span className="text-[11px]">BRAKE</span>
          <span className="text-[9px] text-white/60">[S]</span>
        </button>

        {/* POWER-UP Trigger Button */}
        <button
          type="button"
          data-testid="mobile-powerup-btn"
          disabled={!heldItem || rouletteSpinning}
          onPointerDown={(e) => {
            e.preventDefault();
            if (heldItem && !rouletteSpinning) {
              callbacks.onTriggerPowerUp();
            }
          }}
          className={`relative flex h-20 w-20 sm:h-24 sm:w-24 touch-none flex-col items-center justify-center rounded-3xl border-2 backdrop-blur-md transition-all ${
            heldItem && !rouletteSpinning
              ? "border-amber-300 bg-gradient-to-br from-amber-500/85 to-orange-600/85 text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.65)] active:scale-95 cursor-pointer"
              : rouletteSpinning
              ? "border-cyan-400/70 bg-slate-900/85 text-cyan-200 animate-pulse"
              : "border-white/20 bg-slate-900/65 text-slate-400 opacity-75"
          }`}
        >
          {renderPowerUpIcon(displayItem)}
          <span className="mt-1 text-[11px] font-black tracking-wider uppercase leading-none">
            {rouletteSpinning
              ? "SPIN..."
              : itemMeta
              ? itemMeta.shortLabel
              : "ITEM"}
          </span>
          <span className="mt-0.5 text-[9px] font-bold opacity-80">
            {heldItem && !rouletteSpinning ? "TAP / [E]" : "EMPTY"}
          </span>
        </button>

        {/* Classic Console Kart JUMP / HOLD TO DRIFT Button */}
        <button
          type="button"
          data-testid="mobile-jump-drift-btn"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setJumpHeld(true);
            callbacks.onJumpDriftStart();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            setJumpHeld(false);
            callbacks.onJumpDriftEnd();
          }}
          onPointerCancel={() => {
            setJumpHeld(false);
            callbacks.onJumpDriftEnd();
          }}
          className={`relative flex h-24 w-24 sm:h-28 sm:w-28 touch-none flex-col items-center justify-center rounded-full border-4 text-white backdrop-blur-md transition-all active:scale-95 ${jumpGlowClass}`}
        >
          <ArrowUpFromLine className="w-7 h-7 mb-0.5" />
          <span className="text-xs sm:text-sm font-black tracking-wider uppercase leading-tight">
            {miniTurboTier === 3
              ? "ULTRA!"
              : miniTurboTier === 2
              ? "SUPER!"
              : miniTurboTier === 1
              ? "TURBO!"
              : isDrifting
              ? "DRIFTING"
              : "JUMP"}
          </span>
          <span className="text-[10px] font-bold text-white/80 tracking-tight">
            HOLD + STEER
          </span>
          <span className="text-[9px] text-white/60">[SPACE/SHIFT]</span>
        </button>
      </div>
    </div>
  );
};
