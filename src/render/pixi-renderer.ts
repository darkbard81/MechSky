import "pixi.js/unsafe-eval";
import "pixi.js/prepare";
import { Application, Ticker } from "pixi.js";
import type { SimulationFrame } from "../sim/world/world";
import { loadBattleAssets, type AssetLoadProgress } from "./assets/battle-assets";
import { createStageLayers, type StageLayers } from "./stage-layers";
import { StaticBattleScene } from "./static-battle-scene";

const MAX_RESOLUTION = 2;
const PREWARM_TIMEOUT_MILLISECONDS = 5_000;

async function prewarmStage(
  application: Application,
  isCancelled: () => boolean,
): Promise<void> {
  const prepare = application.renderer.prepare;
  const upload = prepare.upload(application.stage);
  const deadline = performance.now() + PREWARM_TIMEOUT_MILLISECONDS;

  // PrepareSystem normally advances through the auto-starting system ticker.
  // Hidden Electron/headless windows can suppress rAF, so flush with real
  // timestamps while the loading UI is visible. No synthetic time is added.
  while (true) {
    if (isCancelled()) {
      throw new Error("Pixi renderer initialization was cancelled.");
    }

    const remainingResources = prepare.getQueue().length;
    if (remainingResources === 0) {
      break;
    }

    if (performance.now() >= deadline) {
      throw new Error(
        `GPU prewarm 제한 시간 초과: ${remainingResources}개 resource 남음`,
      );
    }

    Ticker.system.update(performance.now());
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  await upload;
}

export class PixiBattleRenderer {
  private readonly application = new Application();
  private applicationInitialized = false;
  private battleScene: StaticBattleScene | undefined;
  private layers: StageLayers | undefined;
  private initialized = false;
  private lifecycleGeneration = 0;
  private viewportHeight = -1;
  private viewportWidth = -1;

  async initialize(host: HTMLElement, onProgress: AssetLoadProgress): Promise<void> {
    if (this.initialized) {
      return;
    }

    const generation = this.lifecycleGeneration;
    onProgress(0.04, "WebGL renderer 초기화");
    await this.application.init({
      antialias: true,
      autoDensity: true,
      autoStart: false,
      background: "#071119",
      powerPreference: "high-performance",
      preference: "webgl",
      resolution: Math.min(window.devicePixelRatio, MAX_RESOLUTION),
      resizeTo: host,
    });
    this.applicationInitialized = true;
    this.assertCurrentGeneration(generation);

    this.layers = createStageLayers(this.application.stage);
    this.application.canvas.setAttribute("aria-hidden", "true");
    host.appendChild(this.application.canvas);

    const assets = await loadBattleAssets((progress, detail) => {
      onProgress(0.12 + progress * 0.7, detail);
    });
    this.assertCurrentGeneration(generation);
    onProgress(0.86, "첫 전투 scene 구성");
    this.battleScene = new StaticBattleScene(this.layers, assets);
    this.resizeSceneIfNeeded();

    onProgress(0.93, "texture GPU prewarm");
    await prewarmStage(
      this.application,
      () => generation !== this.lifecycleGeneration,
    );
    this.assertCurrentGeneration(generation);
    this.application.render();
    onProgress(1, "첫 전투 화면 준비 완료");
    this.initialized = true;
  }

  present(_frame: SimulationFrame, _alpha: number): void {
    if (!this.initialized || this.layers === undefined) {
      throw new Error("Pixi renderer must be initialized before presenting a frame.");
    }

    this.resizeSceneIfNeeded();
    // Views will project interpolated simulation snapshots into these layers.
  }

  render(): void {
    if (!this.initialized) {
      return;
    }

    this.application.render();
  }

  destroy(): void {
    this.lifecycleGeneration += 1;

    if (!this.applicationInitialized) {
      return;
    }

    this.application.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
    this.battleScene = undefined;
    this.layers = undefined;
    this.applicationInitialized = false;
    this.initialized = false;
    this.viewportHeight = -1;
    this.viewportWidth = -1;
  }

  private assertCurrentGeneration(generation: number): void {
    if (generation === this.lifecycleGeneration) {
      return;
    }

    if (this.applicationInitialized) {
      this.application.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      );
      this.applicationInitialized = false;
    }

    throw new Error("Pixi renderer initialization was cancelled.");
  }

  private resizeSceneIfNeeded(): void {
    const { height, width } = this.application.screen;

    if (
      this.battleScene === undefined ||
      (width === this.viewportWidth && height === this.viewportHeight)
    ) {
      return;
    }

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.battleScene.resize(width, height);
  }
}
