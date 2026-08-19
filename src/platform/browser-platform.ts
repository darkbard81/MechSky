import type { Platform } from "./platform";

export class BrowserPlatform implements Platform {
  readonly kind = "browser";

  async toggleFullscreen(): Promise<boolean> {
    if (document.fullscreenElement !== null) {
      await document.exitFullscreen();
      return false;
    }

    await document.documentElement.requestFullscreen();
    return true;
  }
}
