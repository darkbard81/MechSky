import type { Platform } from "./platform";

export class ElectronPlatform implements Platform {
  readonly kind = "electron";

  async isFullscreen(): Promise<boolean> {
    const api = window.mechSky;

    if (api === undefined) {
      throw new Error("Electron platform bridge is unavailable.");
    }

    return api.isFullscreen();
  }

  async toggleFullscreen(): Promise<boolean> {
    const api = window.mechSky;

    if (api === undefined) {
      throw new Error("Electron platform bridge is unavailable.");
    }

    return api.toggleFullscreen();
  }
}
