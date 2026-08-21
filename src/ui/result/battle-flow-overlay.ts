import type { GameFlowPresentation } from "../../app/game-flow";

export interface BattleFlowOverlayElements {
  readonly overlay: HTMLElement;
  readonly kicker: HTMLElement;
  readonly title: HTMLElement;
  readonly message: HTMLElement;
  readonly prompt: HTMLElement;
}

export class BattleFlowOverlay {
  private lastPhase = "";
  private lastPrompt = "";

  constructor(private readonly elements: BattleFlowOverlayElements) {}

  present(presentation: GameFlowPresentation): void {
    const visible = presentation.phase !== "active";
    this.elements.overlay.hidden = !visible;
    this.elements.overlay.dataset["phase"] = presentation.phase;

    if (!visible) {
      this.lastPhase = presentation.phase;
      return;
    }

    if (presentation.phase !== this.lastPhase) {
      this.lastPhase = presentation.phase;
      this.elements.kicker.textContent = presentation.kicker;
      this.elements.title.textContent = presentation.title;
      this.elements.message.textContent = presentation.message;
    }

    if (presentation.prompt !== this.lastPrompt) {
      this.lastPrompt = presentation.prompt;
      this.elements.prompt.textContent = presentation.prompt;
    }
  }
}
