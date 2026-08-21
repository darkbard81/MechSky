export {};

declare global {
  interface Window {
    mechSky?: {
      isFullscreen(): Promise<boolean>;
      toggleFullscreen(): Promise<boolean>;
    };
  }
}
