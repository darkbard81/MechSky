import { Assets, Texture } from "pixi.js";
import {
  BATTLE_ASSET_ALIASES,
  BATTLE_ASSET_MANIFEST,
  BATTLE_COMMON_BUNDLE,
  VERTICAL_SLICE_BUNDLE,
} from "./battle-asset-manifest";

export interface BattleAssets {
  readonly hangarFloor: Texture;
  readonly playerMechIdle: Texture;
  readonly playerMechMove: Texture;
  readonly playerMechGroundCombo: Texture;
  readonly playerMechLauncher: Texture;
  readonly playerMechAirCombo: Texture;
  readonly playerMechFinisher: Texture;
  readonly playerMechHurt: Texture;
  readonly playerMechKnockdown: Texture;
  readonly mechSlashFx: Texture;
  readonly mechImpactFx: Texture;
  readonly mechBoostFx: Texture;
  readonly mechGroundSlamFx: Texture;
  /** Original sheet textures that must all be uploaded before first display. */
  readonly prewarmTextures: readonly Texture[];
}

export type AssetLoadProgress = (progress: number, detail: string) => void;

let initialization: Promise<void> | undefined;
let lastFailedAsset: string | undefined;

function resolvedAssetSource(
  asset: string | { readonly src?: string | string[] },
): string {
  if (typeof asset === "string") {
    return asset;
  }

  if (asset.src === undefined) {
    return "unknown";
  }

  return Array.isArray(asset.src) ? (asset.src[0] ?? "unknown") : asset.src;
}

function assetLabel(source: string): string {
  for (const bundle of BATTLE_ASSET_MANIFEST.bundles) {
    for (const asset of bundle.assets) {
      if (source.endsWith(asset.src)) {
        return `${asset.alias} (${asset.src})`;
      }
    }
  }

  return source;
}

function ensureAssetsInitialized(): Promise<void> {
  initialization ??= Assets.init({
    basePath: new URL(import.meta.env.BASE_URL, document.baseURI).href,
    manifest: BATTLE_ASSET_MANIFEST,
    preferences: {
      // The two M0 PNGs are small, and this path is reliable for both browser
      // automation and Electron's file:// production build.
      preferCreateImageBitmap: false,
      preferWorkers: false,
    },
    loadOptions: {
      onError: (_error, asset) => {
        lastFailedAsset = assetLabel(resolvedAssetSource(asset));
      },
      retryCount: 2,
      retryDelay: 150,
      strategy: "retry",
    },
  });

  return initialization;
}

function requireTexture(resources: Record<string, unknown>, alias: string): Texture {
  const resource = resources[alias];

  if (!(resource instanceof Texture)) {
    throw new Error(`필수 texture '${alias}'가 bundle 결과에 없습니다.`);
  }

  return resource;
}

export async function loadBattleAssets(
  onProgress: AssetLoadProgress,
): Promise<BattleAssets> {
  lastFailedAsset = undefined;
  onProgress(0, "asset manifest 등록");

  try {
    await ensureAssetsInitialized();
    onProgress(0.1, `${BATTLE_COMMON_BUNDLE} bundle 준비`);

    const commonResources = (await Assets.loadBundle(BATTLE_COMMON_BUNDLE, (progress) => {
      onProgress(0.1 + progress * 0.38, `${BATTLE_COMMON_BUNDLE} 불러오는 중`);
    })) as Record<string, unknown>;
    onProgress(0.5, `${VERTICAL_SLICE_BUNDLE} bundle 준비`);
    const sliceResources = (await Assets.loadBundle(VERTICAL_SLICE_BUNDLE, (progress) => {
      onProgress(0.5 + progress * 0.5, `${VERTICAL_SLICE_BUNDLE} 불러오는 중`);
    })) as Record<string, unknown>;

    const hangarFloor = requireTexture(
      commonResources,
      BATTLE_ASSET_ALIASES.hangarFloor,
    );
    const playerMechIdle = requireTexture(
      commonResources,
      BATTLE_ASSET_ALIASES.playerMechIdle,
    );
    const playerMechMove = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechMove,
    );
    const playerMechGroundCombo = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechGroundCombo,
    );
    const playerMechLauncher = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechLauncher,
    );
    const playerMechAirCombo = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechAirCombo,
    );
    const playerMechFinisher = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechFinisher,
    );
    const playerMechHurt = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechHurt,
    );
    const playerMechKnockdown = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.playerMechKnockdown,
    );
    const mechSlashFx = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.mechSlashFx,
    );
    const mechImpactFx = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.mechImpactFx,
    );
    const mechBoostFx = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.mechBoostFx,
    );
    const mechGroundSlamFx = requireTexture(
      sliceResources,
      BATTLE_ASSET_ALIASES.mechGroundSlamFx,
    );

    return {
      hangarFloor,
      playerMechIdle,
      playerMechMove,
      playerMechGroundCombo,
      playerMechLauncher,
      playerMechAirCombo,
      playerMechFinisher,
      playerMechHurt,
      playerMechKnockdown,
      mechSlashFx,
      mechImpactFx,
      mechBoostFx,
      mechGroundSlamFx,
      prewarmTextures: Object.freeze([
        hangarFloor,
        playerMechIdle,
        playerMechMove,
        playerMechGroundCombo,
        playerMechLauncher,
        playerMechAirCombo,
        playerMechFinisher,
        playerMechHurt,
        playerMechKnockdown,
        mechSlashFx,
        mechImpactFx,
        mechBoostFx,
        mechGroundSlamFx,
      ]),
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const failed = lastFailedAsset ?? `${BATTLE_COMMON_BUNDLE}/${VERTICAL_SLICE_BUNDLE}`;
    throw new Error(`전투 asset 로드 실패: ${failed} — ${reason}`, { cause: error });
  }
}
