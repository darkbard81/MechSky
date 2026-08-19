import type { PlatformKind } from "../../platform/platform";

export interface DevelopmentHudElements {
  readonly bootStatus: HTMLElement;
  readonly simTick: HTMLElement;
  readonly simAlpha: HTMLElement;
  readonly platformKind: HTMLElement;
  readonly runtimeMessage: HTMLElement;
}

export interface DevelopmentHudState {
  readonly alpha: number;
  readonly platform: PlatformKind;
  readonly tick: number;
}

export class DevelopmentHud {
  private lastTick = -1;

  constructor(private readonly elements: DevelopmentHudElements) {}

  ready(platform: PlatformKind): void {
    this.elements.bootStatus.textContent = "런타임 정상";
    this.elements.platformKind.textContent =
      platform === "electron" ? "Electron" : "Browser";
    this.elements.runtimeMessage.textContent =
      "렌더러와 독립된 60 Hz simulation clock이 실행 중입니다.";
  }

  present(state: DevelopmentHudState): void {
    if (state.tick === this.lastTick) {
      return;
    }

    this.lastTick = state.tick;
    this.elements.simTick.textContent = state.tick.toString();
    this.elements.simAlpha.textContent = state.alpha.toFixed(2);
  }

  showMessage(message: string): void {
    this.elements.runtimeMessage.textContent = message;
  }
}
