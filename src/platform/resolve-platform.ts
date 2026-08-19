import { BrowserPlatform } from "./browser-platform";
import { ElectronPlatform } from "./electron-platform";
import type { Platform } from "./platform";

export function resolvePlatform(): Platform {
  return window.mechSky === undefined ? new BrowserPlatform() : new ElectronPlatform();
}
