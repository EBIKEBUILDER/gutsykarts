"use client";

import React from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

function shouldSuppressVercelTelemetry(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.navigator?.webdriver) return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("dedicated") === "1" || params.get("aisim") === "1") {
      return true;
    }
    if (window.sessionStorage.getItem("gutsy_karts_ai_sim_active") === "true") {
      return true;
    }
    if (
      window.localStorage.getItem("gutsy_karts_disable_vercel_analytics") ===
      "true"
    ) {
      return true;
    }
  } catch {
    // Ignore storage read errors in restricted contexts
  }
  return false;
}

export const VercelTelemetryGuard: React.FC = () => {
  return (
    <>
      <Analytics
        beforeSend={(event) => (shouldSuppressVercelTelemetry() ? null : event)}
      />
      <SpeedInsights
        beforeSend={(event) => (shouldSuppressVercelTelemetry() ? null : event)}
      />
    </>
  );
};
