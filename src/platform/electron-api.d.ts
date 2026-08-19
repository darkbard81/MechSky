export {};

declare global {
  interface Window {
    mechSky?: {
      toggleFullscreen(): Promise<boolean>;
    };
  }
}
