import type { PlatformKind } from "../../platform/platform";
import type { InputControl, InputSource } from "../../input/player-input";
import type { Vector2 } from "../../sim/math/vector2";
import type { ActionKind, FighterState, WorldPosition } from "../../sim/world/entity";
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
  readonly comboCounter: HTMLElement;
  readonly enemyHealth: HTMLElement;
  readonly enemyHealthBar: HTMLElement;
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
  readonly comboHits: number;
  readonly dashCooldownTicks: number;
  readonly enemyHealth: number;
  readonly enemyMaximumHealth: number;
  readonly fighterState: FighterState;
  readonly inputControl: InputControl;
  readonly inputSource: InputSource;
  readonly locked: boolean;
  readonly platform: PlatformKind;
  readonly position: Readonly<WorldPosition>;
  readonly tick: number;
  readonly velocity: Readonly<Vector2>;
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
      "이동은 WASD·방향키·NumPad 또는 왼쪽 스틱, J/A로 공격, Shift/B로 Dash, Tab/LB로 Lock합니다. J를 다시 눌러 2타로 잇습니다.";
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

    if (state.tick === this.lastTick) {
      return;
    }

    this.lastTick = state.tick;
    this.elements.simTick.textContent = state.tick.toString();
    this.elements.playerPosition.textContent = `${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}`;
    this.elements.playerVelocity.textContent = `${state.velocity.x.toFixed(1)}, ${state.velocity.y.toFixed(1)}`;
    this.elements.playerState.textContent = state.fighterState.toUpperCase();
    this.elements.dashCooldown.textContent =
      state.dashCooldownTicks === 0
        ? "READY"
        : `${(state.dashCooldownTicks / 60).toFixed(2)}s`;
    this.elements.targetLock.textContent = state.locked ? "LOCKED" : "SEARCH";
    this.elements.targetLock.dataset["locked"] = state.locked.toString();
    this.elements.inputSource.textContent = `${state.inputSource.toUpperCase()} · ${state.inputControl}`;
    this.presentCombat(state);
  }

  private presentCombat(state: DevelopmentHudState): void {
    this.elements.combatAction.textContent = describeAction(state);
    this.elements.comboCounter.textContent = state.comboHits.toString();
    this.elements.comboCounter.dataset["active"] = (state.comboHits > 0).toString();
    this.elements.enemyHealth.textContent = `${state.enemyHealth} / ${state.enemyMaximumHealth}`;

    const ratio =
      state.enemyMaximumHealth === 0
        ? 0
        : Math.min(1, Math.max(0, state.enemyHealth / state.enemyMaximumHealth));
    this.elements.enemyHealthBar.style.transform = `scaleX(${ratio})`;
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
