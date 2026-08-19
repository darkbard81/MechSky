import { Application } from "pixi.js";
import type { SimulationFrame } from "../sim/world/world";
import { createStageLayers, type StageLayers } from "./stage-layers";

const MAX_RESOLUTION = 2;

export class PixiBattleRenderer {
  private readonly application = new Application();
  private layers: StageLayers | undefined;
  private initialized = false;

  async initialize(host: HTMLElement): Promise<void> {
    if (this.initialized) {
      return;
    }

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

    this.layers = createStageLayers(this.application.stage);
    this.application.canvas.setAttribute("aria-hidden", "true");
    host.appendChild(this.application.canvas);
    this.initialized = true;
  }

  present(_frame: SimulationFrame, _alpha: number): void {
    if (!this.initialized || this.layers === undefined) {
      throw new Error("Pixi renderer must be initialized before presenting a frame.");
    }

    // Views will project interpolated simulation snapshots into these layers.
  }

  render(): void {
    if (!this.initialized) {
      return;
    }

    this.application.render();
  }

  destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.application.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    );
    this.layers = undefined;
    this.initialized = false;
  }
}
