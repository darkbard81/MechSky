export type PlatformKind = "browser" | "electron";

export interface Platform {
  readonly kind: PlatformKind;
  toggleFullscreen(): Promise<boolean>;
}
