import { describe, expect, it } from "vitest";
import { HANGAR_TEST_BATTLE } from "../../src/content/arenas/hangar-test";
import { SimulationWorld, type SimulationSnapshot } from "../../src/sim/world/world";
import {
  BattleHud,
  battleControlLabels,
  type BattleHudElements,
} from "../../src/ui/hud/battle-hud";

function createElement(): HTMLElement {
  return {
    dataset: {},
    style: { transform: "" },
    textContent: "",
  } as unknown as HTMLElement;
}

function createElements(): BattleHudElements {
  return {
    playerHealth: createElement(),
    playerHealthBar: createElement(),
    enemyHealth: createElement(),
    enemyHealthBar: createElement(),
    boostStatus: createElement(),
    boostBar: createElement(),
    comboCounter: createElement(),
    lockStatus: createElement(),
    controlMove: createElement(),
    controlAttack: createElement(),
    controlSpecial: createElement(),
    controlDash: createElement(),
    controlLock: createElement(),
    controlPause: createElement(),
  };
}

describe("battle HUD control guide", () => {
  it("switches the complete guide from keyboard to Steam Deck controls", () => {
    expect(battleControlLabels("keyboard")).toEqual({
      move: "WASD / 방향키 이동",
      attack: "Z 주 공격",
      special: "X Launcher / Finisher",
      dash: "Shift Dash / Homing",
      lock: "Tab Lock-on",
      pause: "Esc 일시 정지",
    });
    expect(battleControlLabels("gamepad")).toEqual({
      move: "왼쪽 스틱 이동",
      attack: "A 주 공격",
      special: "X Launcher / Finisher",
      dash: "B Dash / Homing",
      lock: "LB Lock-on",
      pause: "Menu 일시 정지",
    });
  });

  it("presents health, boost, combo, and lock state from the simulation snapshot", () => {
    const initial = new SimulationWorld(HANGAR_TEST_BATTLE).getFrame().current;
    const elements = createElements();
    const hud = new BattleHud(elements);
    const snapshot: SimulationSnapshot = {
      ...initial,
      player: {
        ...initial.player,
        comboHits: 3,
        dashCooldownTicks: initial.player.dashCooldownDurationTicks / 2,
        health: 750,
        lockedTargetId: initial.enemy.id,
      },
      enemy: {
        ...initial.enemy,
        health: 450,
      },
    };

    hud.present(snapshot, "gamepad");

    expect(elements.playerHealth.textContent).toBe("750 / 1000");
    expect(elements.playerHealthBar.style.transform).toBe("scaleX(0.75)");
    expect(elements.enemyHealth.textContent).toBe("450 / 900");
    expect(elements.enemyHealthBar.style.transform).toBe("scaleX(0.5)");
    expect(elements.boostStatus.textContent).toBe("CHARGING");
    expect(elements.boostBar.style.transform).toBe("scaleX(0.5)");
    expect(elements.comboCounter.textContent).toBe("3 HIT");
    expect(elements.comboCounter.dataset["active"]).toBe("true");
    expect(elements.lockStatus.textContent).toBe("LOCK ON");
    expect(elements.lockStatus.dataset["locked"]).toBe("true");
    expect(elements.controlMove.textContent).toBe("왼쪽 스틱 이동");
  });

  it("re-presents every battle value after reset", () => {
    const initial = new SimulationWorld(HANGAR_TEST_BATTLE).getFrame().current;
    const elements = createElements();
    const hud = new BattleHud(elements);

    hud.present(initial, "keyboard");
    elements.playerHealth.textContent = "stale";
    elements.enemyHealth.textContent = "stale";
    elements.boostStatus.textContent = "stale";
    elements.comboCounter.textContent = "stale";
    elements.lockStatus.textContent = "stale";
    hud.reset();
    hud.present(initial, "keyboard");

    expect(elements.playerHealth.textContent).toBe("1000 / 1000");
    expect(elements.enemyHealth.textContent).toBe("900 / 900");
    expect(elements.boostStatus.textContent).toBe("READY");
    expect(elements.comboCounter.textContent).toBe("0 HIT");
    expect(elements.lockStatus.textContent).toBe("NO LOCK");
  });
});
