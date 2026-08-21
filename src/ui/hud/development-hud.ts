import type { PlatformKind } from "../../platform/platform";
import type { InputControl, InputSource } from "../../input/player-input";
import type { Vector2 } from "../../sim/math/vector2";
import type {
  ActionKind,
  FighterState,
  LocomotionState,
  WorldPosition,
} from "../../sim/world/entity";
import type { AttackPhase } from "../../sim/combat/attack-timeline";

export interface DevelopmentHudElements {
  readonly bootOverlay: HTMLElement;
  readonly bootStatus: HTMLElement;
  readonly loadingBar: HTMLElement;
  readonly loadingDetail: HTMLElement;
  readonly loadingPercent: HTMLElement;
  readonly loadingProgress: HTMLElement;
  readonly simTick: HTMLElement;
  readonly simAlpha: HTMLElement;
  readonly playerPosition: HTMLElement;
  readonly playerVelocity: HTMLElement;
  readonly playerState: HTMLElement;
  readonly dashCooldown: HTMLElement;
  readonly targetLock: HTMLElement;
  readonly inputSource: HTMLElement;
  readonly combatAction: HTMLElement;
  readonly platformKind: HTMLElement;
  readonly runtimeMessage: HTMLElement;
}

export interface DevelopmentHudState {
  readonly actionFrame: number;
  readonly actionDuration: number;
  readonly actionKind: ActionKind;
  readonly alpha: number;
  readonly attackId: string | null;
  readonly attackPhase: AttackPhase | null;
  readonly dashCooldownTicks: number;
  readonly fighterState: FighterState;
  readonly locomotion: LocomotionState;
  readonly homing: boolean;
  readonly inputControl: InputControl;
  readonly inputSource: InputSource;
  readonly locked: boolean;
  readonly platform: PlatformKind;
  readonly position: Readonly<WorldPosition>;
  readonly tick: number;
  readonly velocity: Readonly<Vector2>;
  readonly verticalVelocity: number;
}

export class DevelopmentHud {
  private lastInputLabel = "";
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
      "적의 접근과 반격을 읽고 지상 2타 → Launcher → Homing → 공중 2타 → Finisher를 연결합니다.";
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
    this.elements.simAlpha.textContent = state.alpha.toFixed(2);
    const inputLabel = `${state.inputSource.toUpperCase()} · ${state.inputControl}`;
    if (inputLabel !== this.lastInputLabel) {
      this.lastInputLabel = inputLabel;
      this.elements.inputSource.textContent = inputLabel;
    }

    if (state.tick === this.lastTick) {
      return;
    }

    this.lastTick = state.tick;
    this.elements.simTick.textContent = state.tick.toString();
    this.elements.playerPosition.textContent = `${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, Z ${state.position.elevation.toFixed(1)}`;
    this.elements.playerVelocity.textContent = `${state.velocity.x.toFixed(1)}, ${state.velocity.y.toFixed(1)}, Z ${state.verticalVelocity.toFixed(1)}`;
    this.elements.playerState.textContent = `${state.locomotion.toUpperCase()} · ${state.fighterState.toUpperCase()}${state.homing ? " · HOMING" : ""}`;
    this.elements.dashCooldown.textContent =
      state.dashCooldownTicks === 0
        ? "READY"
        : `${(state.dashCooldownTicks / 60).toFixed(2)}s`;
    this.elements.targetLock.textContent = state.locked ? "LOCKED" : "SEARCH";
    this.elements.targetLock.dataset["locked"] = state.locked.toString();
    this.presentCombat(state);
  }

  private presentCombat(state: DevelopmentHudState): void {
    this.elements.combatAction.textContent = describeAction(state);
  }

  showMessage(message: string): void {
    this.elements.runtimeMessage.textContent = message;
  }
}

function describeAction(state: DevelopmentHudState): string {
  if (state.actionKind === "hitstun") {
    return "HITSTUN";
  }

  if (state.actionKind !== "attack" || state.attackId === null) {
    return "NONE";
  }

  const phase = state.attackPhase === null ? "" : ` ${state.attackPhase.toUpperCase()}`;
  return `${state.attackId.toUpperCase()}${phase} ${state.actionFrame}/${state.actionDuration}`;
}
