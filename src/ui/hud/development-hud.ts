import type { PlatformKind } from "../../platform/platform";

export interface DevelopmentHudElements {
  readonly bootOverlay: HTMLElement;
  readonly bootStatus: HTMLElement;
  readonly loadingBar: HTMLElement;
  readonly loadingDetail: HTMLElement;
  readonly loadingPercent: HTMLElement;
  readonly loadingProgress: HTMLElement;
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

  loading(progress: number, detail: string): void {
    const normalized = Math.min(Math.max(progress, 0), 1);
    const percent = Math.round(normalized * 100);

    this.elements.bootOverlay.hidden = false;
    this.elements.bootOverlay.classList.remove("is-error");
    this.elements.bootStatus.textContent = "ASSET LOADING";
    this.elements.loadingDetail.textContent = detail;
    this.elements.loadingPercent.textContent = `${percent}%`;
    this.elements.loadingBar.style.transform = `scaleX(${normalized})`;
    this.elements.loadingProgress.setAttribute("aria-valuenow", percent.toString());
  }

  ready(platform: PlatformKind): void {
    this.elements.bootStatus.textContent = "런타임 정상";
    this.elements.bootOverlay.hidden = true;
    this.elements.platformKind.textContent =
      platform === "electron" ? "Electron" : "Browser";
    this.elements.runtimeMessage.textContent =
      "렌더러와 독립된 60 Hz simulation clock이 실행 중입니다.";
  }

  failed(message: string): void {
    this.elements.bootOverlay.hidden = false;
    this.elements.bootOverlay.classList.add("is-error");
    this.elements.bootStatus.textContent = "초기화 실패";
    this.elements.loadingDetail.textContent = message;
    this.elements.loadingPercent.textContent = "ERROR";
    this.elements.loadingBar.style.transform = "scaleX(1)";
    this.elements.loadingProgress.setAttribute("aria-valuenow", "100");
    this.elements.runtimeMessage.textContent = message;
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
