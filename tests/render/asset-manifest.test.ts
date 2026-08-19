import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATTLE_ASSET_ALIASES,
  BATTLE_ASSET_MANIFEST,
  BATTLE_COMMON_BUNDLE,
} from "../../src/render/assets/battle-asset-manifest";

interface PngSize {
  readonly width: number;
  readonly height: number;
  readonly colorType: number;
}

async function readPngSize(path: string): Promise<PngSize> {
  const bytes = await readFile(path);
  const pngSignature = "89504e470d0a1a0a";

  expect(bytes.subarray(0, 8).toString("hex")).toBe(pngSignature);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes.readUInt8(25),
  };
}

describe("battle asset manifest", () => {
  it("keeps the published manifest synchronized with the runtime contract", async () => {
    const published = JSON.parse(
      await readFile(resolve("public/assets/manifest.json"), "utf8"),
    ) as unknown;

    expect(published).toEqual(BATTLE_ASSET_MANIFEST);
  });

  it("registers required 256 by 256 runtime textures", async () => {
    const battleBundle = BATTLE_ASSET_MANIFEST.bundles.find(
      ({ name }) => name === BATTLE_COMMON_BUNDLE,
    );

    expect(battleBundle).toBeDefined();
    expect(battleBundle?.assets.map(({ alias }) => alias)).toEqual([
      BATTLE_ASSET_ALIASES.hangarFloor,
      BATTLE_ASSET_ALIASES.playerMech,
    ]);

    for (const asset of battleBundle?.assets ?? []) {
      const file = resolve("public", asset.src);
      await expect(readPngSize(file)).resolves.toMatchObject({
        width: 256,
        height: 256,
      });
    }
  });

  it("keeps the normalized player frame transparent and inside its output cell", async () => {
    const playerPath = resolve(
      "public/assets/characters/player/mech-static.png",
    );
    const metadata = JSON.parse(
      await readFile(
        resolve("assets/metadata/characters/player/mech-static.pipeline.json"),
        "utf8",
      ),
    ) as {
      cell_size: number;
      empty_frames: unknown[];
      output_edge_touch_frames: unknown[];
      paste_clamped_frames: unknown[];
    };

    await expect(readPngSize(playerPath)).resolves.toMatchObject({ colorType: 6 });
    expect(metadata.cell_size).toBe(256);
    expect(metadata.empty_frames).toEqual([]);
    expect(metadata.output_edge_touch_frames).toEqual([]);
    expect(metadata.paste_clamped_frames).toEqual([]);
  });
});
