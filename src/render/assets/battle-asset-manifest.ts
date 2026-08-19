import type { AssetsManifest } from "pixi.js";

export const BATTLE_COMMON_BUNDLE = "battle-common";

export const BATTLE_ASSET_ALIASES = {
  hangarFloor: "arena-hangar-floor",
  playerMech: "player-mech-static",
} as const;

export const BATTLE_ASSET_MANIFEST = {
  bundles: [
    { name: "core", assets: [] },
    {
      name: BATTLE_COMMON_BUNDLE,
      assets: [
        {
          alias: BATTLE_ASSET_ALIASES.hangarFloor,
          src: "assets/arenas/hangar/hangar-floor.png",
          data: {
            addressMode: "repeat",
            autoGenerateMipmaps: true,
            scaleMode: "linear",
          },
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMech,
          src: "assets/characters/player/mech-static.png",
          data: {
            autoGenerateMipmaps: true,
            scaleMode: "linear",
          },
        },
      ],
    },
  ],
} satisfies AssetsManifest;
