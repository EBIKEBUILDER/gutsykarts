import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  createCodePresetCupsCatalog,
  prepareCupsCatalogForRepoCommit,
  sanitizeCupDefinition,
} from "@/src/game/world/TrackBuilder";
import { GrandPrixCupDefinition } from "@/src/types/game";

const DEFAULT_CUPS_REL_PATH = "src/game/world/defaultCups.json";

export async function GET() {
  const isDev = process.env.NODE_ENV === "development";
  return NextResponse.json({
    ok: true,
    isDev,
    targetFile: DEFAULT_CUPS_REL_PATH,
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Committing default tracks to the repository is only enabled in local development mode (NODE_ENV=development).",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as {
      cups?: unknown[];
      seedFromCodePresets?: boolean;
    };

    let cleanCups: GrandPrixCupDefinition[] = [];

    if (body.seedFromCodePresets) {
      cleanCups = prepareCupsCatalogForRepoCommit(
        createCodePresetCupsCatalog()
      );
    } else if (Array.isArray(body.cups) && body.cups.length > 0) {
      const sanitized = body.cups
        .map((c) => sanitizeCupDefinition(c))
        .filter((c): c is GrandPrixCupDefinition => c !== null);

      if (sanitized.length === 0) {
        return NextResponse.json(
          { ok: false, error: "No valid Grand Prix Cups found in payload." },
          { status: 400 }
        );
      }
      cleanCups = prepareCupsCatalogForRepoCommit(sanitized);
    } else {
      return NextResponse.json(
        { ok: false, error: "Expected { cups: GrandPrixCupDefinition[] }." },
        { status: 400 }
      );
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      version: Date.now(),
      updatedAt,
      cups: cleanCups,
    };

    const targetPath = path.join(process.cwd(), DEFAULT_CUPS_REL_PATH);
    await fs.writeFile(
      targetPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8"
    );

    const totalTracks = cleanCups.reduce(
      (sum, cup) => sum + cup.tracks.length,
      0
    );

    return NextResponse.json({
      ok: true,
      cupCount: cleanCups.length,
      trackCount: totalTracks,
      targetFile: DEFAULT_CUPS_REL_PATH,
      updatedAt,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to write defaultCups.json";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
