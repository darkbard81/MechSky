import type { InputSource } from "../../input/player-input";
import type { FighterSnapshot, SimulationSnapshot } from "../../sim/world/world";

export interface BattleHudElements {
  readonly playerHealth: HTMLElement;
  readonly playerHealthBar: HTMLElement;
  readonly enemyHealth: HTMLElement;
  readonly enemyHealthBar: HTMLElement;
  readonly boostStatus: HTMLElement;
  readonly boostBar: HTMLElement;
  readonly comboCounter: HTMLElement;
  readonly lockStatus: HTMLElement;
  readonly controlMove: HTMLElement;
  readonly controlAttack: HTMLElement;
  readonly controlSpecial: HTMLElement;
  readonly controlDash: HTMLElement;
  readonly controlLock: HTMLElement;
  readonly controlPause: HTMLElement;
}

export interface BattleControlLabels {
  readonly move: string;
  readonly attack: string;
  readonly special: string;
  readonly dash: string;
  readonly lock: string;
  readonly pause: string;
}

export function battleControlLabels(source: InputSource): BattleControlLabels {
  return source === "gamepad"
    ? {
        move: "왼쪽 스틱 이동",
        attack: "A 주 공격",
        special: "X Launcher / Finisher",
        dash: "B Dash / Homing",
        lock: "LB Lock-on",
        pause: "Menu 일시 정지",
      }
    : {
        move: "WASD / 방향키 이동",
        attack: "Z 주 공격",
        special: "X Launcher / Finisher",
        dash: "Shift Dash / Homing",
        lock: "Tab Lock-on",
        pause: "Esc 일시 정지",
      };
}

export class BattleHud {
  private lastPlayerHealth = -1;
  private lastEnemyHealth = -1;
  private lastBoostCooldown = -1;
  private lastCombo = -1;
  private lastLocked = false;
  private lastInputSource: InputSource | null = null;

  constructor(private readonly elements: BattleHudElements) {}

  present(snapshot: SimulationSnapshot, inputSource: InputSource): void {
    this.presentHealth(snapshot.player, snapshot.enemy);
    this.presentBoost(snapshot.player);

    if (snapshot.player.comboHits !== this.lastCombo) {
      this.lastCombo = snapshot.player.comboHits;
      this.elements.comboCounter.textContent = `${snapshot.player.comboHits} HIT`;
      this.elements.comboCounter.dataset["active"] = (
        snapshot.player.comboHits > 0
      ).toString();
    }

    const locked = snapshot.player.lockedTargetId === snapshot.enemy.id;
    if (locked !== this.lastLocked) {
      this.lastLocked = locked;
      this.elements.lockStatus.textContent = locked ? "LOCK ON" : "NO LOCK";
      this.elements.lockStatus.dataset["locked"] = locked.toString();
    }

    if (inputSource !== this.lastInputSource) {
      this.lastInputSource = inputSource;
      this.presentControls(inputSource);
    }
  }

  reset(): void {
    this.lastPlayerHealth = -1;
    this.lastEnemyHealth = -1;
    this.lastBoostCooldown = -1;
    this.lastCombo = -1;
    this.lastLocked = true;
  }

  private presentHealth(player: FighterSnapshot, enemy: FighterSnapshot): void {
    if (player.health !== this.lastPlayerHealth) {
      this.lastPlayerHealth = player.health;
      this.elements.playerHealth.textContent = `${player.health} / ${player.maximumHealth}`;
      this.elements.playerHealthBar.style.transform = `scaleX(${healthRatio(player)})`;
    }

    if (enemy.health !== this.lastEnemyHealth) {
      this.lastEnemyHealth = enemy.health;
      this.elements.enemyHealth.textContent = `${enemy.health} / ${enemy.maximumHealth}`;
      this.elements.enemyHealthBar.style.transform = `scaleX(${healthRatio(enemy)})`;
    }
  }

  private presentBoost(player: FighterSnapshot): void {
    if (player.dashCooldownTicks === this.lastBoostCooldown) {
      return;
    }

    this.lastBoostCooldown = player.dashCooldownTicks;
    const ratio =
      player.dashCooldownTicks === 0
        ? 1
        : 1 - player.dashCooldownTicks / player.dashCooldownDurationTicks;
    this.elements.boostBar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    this.elements.boostStatus.textContent =
      player.dashCooldownTicks === 0 ? "READY" : "CHARGING";
  }

  private presentControls(source: InputSource): void {
    const labels = battleControlLabels(source);
    this.elements.controlMove.textContent = labels.move;
    this.elements.controlAttack.textContent = labels.attack;
    this.elements.controlSpecial.textContent = labels.special;
    this.elements.controlDash.textContent = labels.dash;
    this.elements.controlLock.textContent = labels.lock;
    this.elements.controlPause.textContent = labels.pause;
  }
}

function healthRatio(fighter: FighterSnapshot): number {
  return fighter.maximumHealth === 0
    ? 0
    : Math.min(1, Math.max(0, fighter.health / fighter.maximumHealth));
}
