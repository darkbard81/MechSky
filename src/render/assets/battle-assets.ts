import { Assets, Texture } from "pixi.js";
import {
  BATTLE_ASSET_ALIASES,
  BATTLE_ASSET_MANIFEST,
  BATTLE_COMMON_BUNDLE,
} from "./battle-asset-manifest";

export interface BattleAssets {
  readonly hangarFloor: Texture;
  readonly playerMechIdle: Texture;
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
  const bundle = BATTLE_ASSET_MANIFEST.bundles.find(
    ({ name }) => name === BATTLE_COMMON_BUNDLE,
  );
  const match = bundle?.assets.find(({ src }) => source.endsWith(src));
  return match === undefined ? source : `${match.alias} (${match.src})`;
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

    const resources = (await Assets.loadBundle(BATTLE_COMMON_BUNDLE, (progress) => {
      onProgress(0.1 + progress * 0.9, `${BATTLE_COMMON_BUNDLE} 불러오는 중`);
    })) as Record<string, unknown>;

    return {
      hangarFloor: requireTexture(resources, BATTLE_ASSET_ALIASES.hangarFloor),
      playerMechIdle: requireTexture(
        resources,
        BATTLE_ASSET_ALIASES.playerMechIdle,
      ),
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    const failed = lastFailedAsset ?? BATTLE_COMMON_BUNDLE;
    throw new Error(`전투 asset 로드 실패: ${failed} — ${reason}`, { cause: error });
  }
}
