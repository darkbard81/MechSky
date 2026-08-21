import { describe, expect, it } from "vitest";
import {
  HANGAR_TEST_BATTLE,
  ENEMY_FIGHTER_ID,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import { SimulationWorld } from "../../src/sim/world/world";

const ENEMY_ATTACK: CommandIntent = {
  type: "attack",
  fighterId: ENEMY_FIGHTER_ID,
  button: "A",
};

function duelRecipe(playerHealth = HANGAR_TEST_BATTLE.player.health): BattleRecipe {
  return {
    ...HANGAR_TEST_BATTLE,
    player: {
      ...HANGAR_TEST_BATTLE.player,
      spawn: { x: 0, y: 0, elevation: 0 },
      health: playerHealth,
    },
    enemy: {
      ...HANGAR_TEST_BATTLE.enemy,
      spawn: { x: 100, y: 0, elevation: 0 },
    },
  };
}

describe("enemy combat through the shared world path", () => {
  it("damages the player and drives the same hurt pose state", () => {
    const world = new SimulationWorld(duelRecipe());
    const facePlayer: CommandIntent = {
      type: "move",
      fighterId: ENEMY_FIGHTER_ID,
      direction: { x: -1, y: 0 },
    };

    world.step([facePlayer, ENEMY_ATTACK]);
    for (let tick = 0; tick < 8; tick += 1) {
      world.step();
    }

    const { player } = world.getFrame().current;
    expect(player.health).toBe(HANGAR_TEST_BATTLE.player.health - 60);
    expect(player.actionKind).toBe("hitstun");
    expect(player.state).toBe("hitstun");
  });

  it("locks simulation input after defeat", () => {
    const world = new SimulationWorld(duelRecipe(60));
    const facePlayer: CommandIntent = {
      type: "move",
      fighterId: ENEMY_FIGHTER_ID,
      direction: { x: -1, y: 0 },
    };

    world.step([facePlayer, ENEMY_ATTACK]);
    while (world.getFrame().current.battleOutcome === "ongoing") {
      world.step();
    }

    const terminal = world.getFrame();
    world.step([
      {
        type: "attack",
        fighterId: PLAYER_FIGHTER_ID,
        button: "A",
      },
    ]);
    expect(terminal.current.battleOutcome).toBe("defeat");
    expect(world.getFrame()).toEqual(terminal);
  });

  it("locks new input at zero HP but finishes airborne ground impact before victory", () => {
    const base = duelRecipe();
    const world = new SimulationWorld({
      ...base,
      player: {
        ...base.player,
        spawn: { x: 0, y: 0, elevation: 220 },
      },
      enemy: {
        ...base.enemy,
        spawn: { x: 100, y: 0, elevation: 220 },
        health: 140,
      },
    });
    const finisher: CommandIntent = {
      type: "attack",
      fighterId: PLAYER_FIGHTER_ID,
      button: "B",
    };

    world.step([finisher]);
    while (world.getFrame().current.enemy.health > 0) {
      world.step();
    }
    const atZero = world.getFrame().current;
    expect(atZero.inputLocked).toBe(true);
    expect(atZero.battleOutcome).toBe("ongoing");
    expect(atZero.enemy.locomotion).toBe("airborne");

    const playerAttack = atZero.player.attackId;
    world.step([
      { type: "attack", fighterId: PLAYER_FIGHTER_ID, button: "A" },
    ]);
    expect(world.getFrame().current.player.attackId).toBe(playerAttack);

    while (world.getFrame().current.battleOutcome === "ongoing") {
      world.step();
    }
    expect(world.getFrame().current.enemy.locomotion).toBe("downed");
    expect(world.getFrame().current.battleOutcome).toBe("victory");
  });
});
