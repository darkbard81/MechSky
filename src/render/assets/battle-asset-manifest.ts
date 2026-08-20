import type { AssetsManifest } from "pixi.js";

export const BATTLE_COMMON_BUNDLE = "battle-common";
export const VERTICAL_SLICE_BUNDLE = "vertical-slice";

export const BATTLE_ASSET_ALIASES = {
  hangarFloor: "arena-hangar-floor",
  playerMechIdle: "player-mech-idle-4dir",
  playerMechMove: "player-mech-move",
  playerMechGroundCombo: "player-mech-ground-combo",
  playerMechLauncher: "player-mech-launcher",
  playerMechAirCombo: "player-mech-air-combo",
  playerMechFinisher: "player-mech-finisher",
  playerMechHurt: "player-mech-hurt",
  playerMechKnockdown: "player-mech-knockdown",
  mechSlashFx: "mech-slash-fx",
  mechImpactFx: "mech-impact-fx",
  mechBoostFx: "mech-boost-fx",
  mechGroundSlamFx: "mech-ground-slam-fx",
} as const;

const COMBAT_SHEET_DATA = {
  autoGenerateMipmaps: true,
  scaleMode: "linear",
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
          data: COMBAT_SHEET_DATA,
        },
      ],
    },
    {
      name: VERTICAL_SLICE_BUNDLE,
      assets: [
        {
          alias: BATTLE_ASSET_ALIASES.playerMechMove,
          src: "assets/characters/player/move.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMechGroundCombo,
          src: "assets/characters/player/ground-combo.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMechLauncher,
          src: "assets/characters/player/launcher.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMechAirCombo,
          src: "assets/characters/player/air-combo.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMechFinisher,
          src: "assets/characters/player/finisher.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMechHurt,
          src: "assets/characters/player/hurt.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.playerMechKnockdown,
          src: "assets/characters/player/knockdown.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.mechSlashFx,
          src: "assets/fx/mech/slash.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.mechImpactFx,
          src: "assets/fx/mech/impact.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.mechBoostFx,
          src: "assets/fx/mech/boost.png",
          data: COMBAT_SHEET_DATA,
        },
        {
          alias: BATTLE_ASSET_ALIASES.mechGroundSlamFx,
          src: "assets/fx/mech/ground-slam.png",
          data: COMBAT_SHEET_DATA,
        },
      ],
    },
  ],
} satisfies AssetsManifest;
