import type { NextConfig } from "next";
import { execSync } from "child_process";

let gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "";
if (!gitSha) {
  try {
    gitSha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    gitSha = "dev";
  }
}

const buildTime = new Date().toLocaleString("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
};

export default nextConfig;
