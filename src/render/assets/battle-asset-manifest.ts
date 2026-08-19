import type { AssetsManifest } from "pixi.js";

export const BATTLE_COMMON_BUNDLE = "battle-common";

export const BATTLE_ASSET_ALIASES = {
  hangarFloor: "arena-hangar-floor",
  playerMechIdle: "player-mech-idle-4dir",
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
          alias: BATTLE_ASSET_ALIASES.playerMechIdle,
          src: "assets/characters/player/mech-idle-4dir.png",
          data: {
            autoGenerateMipmaps: true,
            scaleMode: "linear",
          },
        },
      ],
    },
  ],
} satisfies AssetsManifest;
