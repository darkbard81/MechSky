export type PlatformKind = "browser" | "electron";

export interface Platform {
  readonly kind: PlatformKind;
  isFullscreen(): Promise<boolean>;
  toggleFullscreen(): Promise<boolean>;
}
