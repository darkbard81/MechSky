import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATTLE_ASSET_ALIASES,
  BATTLE_ASSET_MANIFEST,
  BATTLE_COMMON_BUNDLE,
  VERTICAL_SLICE_BUNDLE,
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

  it("registers the arena tile and 256-cell directional player sheet", async () => {
    const battleBundle = BATTLE_ASSET_MANIFEST.bundles.find(
      ({ name }) => name === BATTLE_COMMON_BUNDLE,
    );

    expect(battleBundle).toBeDefined();
    expect(battleBundle?.assets.map(({ alias }) => alias)).toEqual([
      BATTLE_ASSET_ALIASES.hangarFloor,
      BATTLE_ASSET_ALIASES.playerMechIdle,
    ]);

    const floor = battleBundle?.assets.find(
      ({ alias }) => alias === BATTLE_ASSET_ALIASES.hangarFloor,
    );
    const player = battleBundle?.assets.find(
      ({ alias }) => alias === BATTLE_ASSET_ALIASES.playerMechIdle,
    );

    expect(floor).toBeDefined();
    expect(player).toBeDefined();
    await expect(readPngSize(resolve("public", floor?.src ?? ""))).resolves.toMatchObject(
      { width: 256, height: 256 },
    );
    await expect(readPngSize(resolve("public", player?.src ?? ""))).resolves.toMatchObject(
      { width: 1024, height: 1024, colorType: 6 },
    );
  });

  it("loads every M4 action and effect sheet from the vertical-slice bundle", async () => {
    const sliceBundle = BATTLE_ASSET_MANIFEST.bundles.find(
      ({ name }) => name === VERTICAL_SLICE_BUNDLE,
    );

    expect(sliceBundle).toBeDefined();
    expect(sliceBundle?.assets.map(({ alias }) => alias)).toEqual([
      BATTLE_ASSET_ALIASES.playerMechMove,
      BATTLE_ASSET_ALIASES.playerMechGroundCombo,
      BATTLE_ASSET_ALIASES.playerMechLauncher,
      BATTLE_ASSET_ALIASES.playerMechAirCombo,
      BATTLE_ASSET_ALIASES.playerMechFinisher,
      BATTLE_ASSET_ALIASES.playerMechHurt,
      BATTLE_ASSET_ALIASES.playerMechKnockdown,
      BATTLE_ASSET_ALIASES.mechSlashFx,
      BATTLE_ASSET_ALIASES.mechImpactFx,
      BATTLE_ASSET_ALIASES.mechBoostFx,
      BATTLE_ASSET_ALIASES.mechGroundSlamFx,
    ]);
  });

  it("keeps accepted M4 sheets transparent, bounded, and aligned", async () => {
    const metadataPaths = [
      "assets/metadata/characters/player/mech-actions.pipeline.json",
      "assets/metadata/fx/mech-combat.pipeline.json",
    ];

    for (const metadataPath of metadataPaths) {
      const aggregate = JSON.parse(
        await readFile(resolve(metadataPath), "utf8"),
      ) as {
        cellSize: number;
        sheets: Array<{
          name: string;
          runtime: string;
          processorMetadata: string;
          prompt: string;
          rows: number;
          cols: number;
          frames: number;
          align: string;
          anchor: number[];
        }>;
      };

      expect(aggregate.cellSize).toBe(256);
      for (const sheet of aggregate.sheets) {
        await expect(readPngSize(resolve(sheet.runtime))).resolves.toMatchObject({
          width: sheet.cols * aggregate.cellSize,
          height: sheet.rows * aggregate.cellSize,
          colorType: 6,
        });
        await expect(readFile(resolve(sheet.prompt), "utf8")).resolves.not.toHaveLength(0);

        const processor = JSON.parse(
          await readFile(resolve(sheet.processorMetadata), "utf8"),
        ) as {
          rows: number;
          cols: number;
          cell_size: number;
          align: string;
          empty_frames: unknown[];
          source_edge_touch_frames: unknown[];
          output_edge_touch_frames: unknown[];
          paste_clamped_frames: unknown[];
          frames: Array<{ aligned_bbox: number[] }>;
          qc_summary: {
            valid_frame_count: number;
          };
        };

        expect(processor).toMatchObject({
          rows: sheet.rows,
          cols: sheet.cols,
          cell_size: aggregate.cellSize,
          align: sheet.align,
        });
        expect(processor.empty_frames).toEqual([]);
        expect(processor.source_edge_touch_frames).toEqual([]);
        expect(processor.output_edge_touch_frames).toEqual([]);
        expect(processor.paste_clamped_frames).toEqual([]);
        expect(processor.frames).toHaveLength(sheet.frames);
        expect(processor.qc_summary.valid_frame_count).toBe(sheet.frames);

        if (sheet.align === "feet" || sheet.align === "bottom") {
          expect(
            new Set(processor.frames.map(({ aligned_bbox }) => aligned_bbox[3])),
            `${sheet.name} bottom anchor`,
          ).toEqual(new Set([sheet.anchor[1]]));
        }
      }
    }
  });

  it("keeps all directional idle frames transparent, aligned, and inside their cells", async () => {
    const playerPath = resolve(
      "public/assets/characters/player/mech-idle-4dir.png",
    );
    const metadata = JSON.parse(
      await readFile(
        resolve(
          "assets/metadata/characters/player/mech-idle-directional.pipeline.json",
        ),
        "utf8",
      ),
    ) as {
      rows: number;
      cols: number;
      cellSize: number;
      directions: string[];
      framesPerDirection: number;
      feetAnchor: number[];
      processorMetadata: Record<string, string>;
      qc: {
        emptyFrames: unknown[];
        outputEdgeTouchFrames: unknown[];
        pasteClampedFrames: unknown[];
        feetBottomRows: number[];
        pinkFringePixels: number;
      };
    };

    await expect(readPngSize(playerPath)).resolves.toMatchObject({
      width: 1024,
      height: 1024,
      colorType: 6,
    });
    expect(metadata).toMatchObject({
      rows: 4,
      cols: 4,
      cellSize: 256,
      directions: ["down", "left", "right", "up"],
      framesPerDirection: 4,
      feetAnchor: [128, 228],
    });
    expect(metadata.qc.emptyFrames).toEqual([]);
    expect(metadata.qc.outputEdgeTouchFrames).toEqual([]);
    expect(metadata.qc.pasteClampedFrames).toEqual([]);
    expect(metadata.qc.feetBottomRows).toEqual([228]);
    expect(metadata.qc.pinkFringePixels).toBe(0);

    for (const direction of metadata.directions) {
      const processorPath = metadata.processorMetadata[direction];
      expect(processorPath).toBeDefined();
      const processor = JSON.parse(
        await readFile(resolve(processorPath ?? ""), "utf8"),
      ) as {
        rows: number;
        cols: number;
        cell_size: number;
        empty_frames: unknown[];
        source_edge_touch_frames: unknown[];
        output_edge_touch_frames: unknown[];
        paste_clamped_frames: unknown[];
        frames: Array<{ aligned_bbox: number[] }>;
      };

      expect(processor).toMatchObject({ rows: 2, cols: 2, cell_size: 256 });
      expect(processor.empty_frames).toEqual([]);
      expect(processor.source_edge_touch_frames).toEqual([]);
      expect(processor.output_edge_touch_frames).toEqual([]);
      expect(processor.paste_clamped_frames).toEqual([]);
      expect(processor.frames).toHaveLength(4);
      expect(processor.frames.map(({ aligned_bbox }) => aligned_bbox[3])).toEqual([
        228, 228, 228, 228,
      ]);
    }
  });
});
