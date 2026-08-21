import "pixi.js/unsafe-eval";
import "pixi.js/prepare";
import { Application, Ticker, type Texture } from "pixi.js";
import type { SimEvent } from "../sim/world/sim-event";
import type { SimulationFrame } from "../sim/world/world";
import type { DebugLayerName } from "./debug/debug-overlay";
import { loadBattleAssets, type AssetLoadProgress } from "./assets/battle-assets";
import { BattleScene } from "./battle-scene";
import { interpolateSimulationFrame } from "./snapshot-interpolation";
import { createStageLayers, type StageLayers } from "./stage-layers";

const MAX_RESOLUTION = 2;
const PREWARM_TIMEOUT_MILLISECONDS = 5_000;

async function prewarmStage(
  application: Application,
  textures: readonly Texture[],
  isCancelled: () => boolean,
): Promise<void> {
  const prepare = application.renderer.prepare;
  const upload = prepare.upload([application.stage, ...textures]);
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
  private battleScene: BattleScene | undefined;
  private layers: StageLayers | undefined;
  private initialized = false;
  private lifecycleGeneration = 0;
  private viewportHeight = -1;
  private viewportWidth = -1;
  private frameMilliseconds = 1_000 / 60;

  async initialize(
    host: HTMLElement,
    initialFrame: SimulationFrame,
    onProgress: AssetLoadProgress,
  ): Promise<void> {
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
    this.battleScene = new BattleScene(this.layers, assets, initialFrame.current);
    this.resizeSceneIfNeeded();

    onProgress(0.93, "texture GPU prewarm");
    await prewarmStage(
      this.application,
      assets.prewarmTextures,
      () => generation !== this.lifecycleGeneration,
    );
    this.assertCurrentGeneration(generation);
    this.application.render();
    onProgress(1, "첫 전투 화면 준비 완료");
    this.initialized = true;
  }

  present(
    frame: SimulationFrame,
    alpha: number,
    renderDeltaSeconds: number,
  ): void {
    if (!this.initialized || this.layers === undefined || this.battleScene === undefined) {
      throw new Error("Pixi renderer must be initialized before presenting a frame.");
    }

    this.resizeSceneIfNeeded();
    if (renderDeltaSeconds > 0) {
      const measuredMilliseconds = renderDeltaSeconds * 1_000;
      this.frameMilliseconds += (measuredMilliseconds - this.frameMilliseconds) * 0.12;
    }
    this.battleScene.present(
      interpolateSimulationFrame(frame, alpha),
      renderDeltaSeconds,
      {
        framesPerSecond: this.frameMilliseconds > 0 ? 1_000 / this.frameMilliseconds : 0,
        frameMilliseconds: this.frameMilliseconds,
        projectileCount: this.battleScene.developmentProjectileCount,
      },
    );
  }

  render(): void {
    if (!this.initialized) {
      return;
    }

    this.application.render();
  }

  consume(events: readonly SimEvent[]): void {
    this.battleScene?.consume(events);
  }

  reset(frame: SimulationFrame): void {
    if (!this.initialized || this.battleScene === undefined) {
      throw new Error("Pixi renderer must be initialized before resetting the battle.");
    }

    this.battleScene.reset(frame.current);
    this.application.render();
  }

  loadBattle(frame: SimulationFrame, projectileCount: number): void {
    if (
      !this.initialized ||
      this.battleScene === undefined
    ) {
      throw new Error("Pixi renderer must be initialized before loading a battle.");
    }

    this.battleScene.load(frame.current);
    this.battleScene.setDevelopmentProjectileCount(projectileCount);
    this.frameMilliseconds = 1_000 / 60;
    this.viewportHeight = -1;
    this.viewportWidth = -1;
    this.resizeSceneIfNeeded();
    this.application.render();
  }

  setDevelopmentProjectileCount(count: number): void {
    if (!this.initialized || this.battleScene === undefined) {
      throw new Error(
        "Pixi renderer must be initialized before configuring development projectiles.",
      );
    }

    this.battleScene.setDevelopmentProjectileCount(count);
  }

  get developmentProjectileCount(): number {
    return this.battleScene?.developmentProjectileCount ?? 0;
  }

  enabledDebugLayers(): readonly DebugLayerName[] {
    return this.battleScene?.enabledDebugLayers() ?? [];
  }

  toggleDebugLayer(layer: DebugLayerName): boolean {
    return this.battleScene?.toggleDebugLayer(layer) ?? false;
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
    this.frameMilliseconds = 1_000 / 60;
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
