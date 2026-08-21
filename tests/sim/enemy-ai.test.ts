import { describe, expect, it } from "vitest";
import {
  HANGAR_TEST_BATTLE,
  ENEMY_FIGHTER_ID,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import { EnemyAiController } from "../../src/sim/ai/enemy-ai";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import { SimulationWorld } from "../../src/sim/world/world";
import type { SimulationSnapshot } from "../../src/sim/world/world";

function closeRangeRecipe(distance: number): BattleRecipe {
  return {
    ...HANGAR_TEST_BATTLE,
    player: {
      ...HANGAR_TEST_BATTLE.player,
      spawn: { x: 0, y: 0, elevation: 0 },
    },
    enemy: {
      ...HANGAR_TEST_BATTLE.enemy,
      spawn: { x: distance, y: 0, elevation: 0 },
    },
  };
}

function createAi(seed = HANGAR_TEST_BATTLE.seed): EnemyAiController {
  return new EnemyAiController(
    ENEMY_FIGHTER_ID,
    PLAYER_FIGHTER_ID,
    HANGAR_TEST_BATTLE.enemyAi,
    seed,
  );
}

function advanceWithoutAi(world: SimulationWorld, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    world.step();
    world.drainEvents();
  }
}

describe("enemy AI CommandIntent decisions", () => {
  it("rejects a controller that targets the fighter it drives", () => {
    expect(
      () =>
        new EnemyAiController(
          ENEMY_FIGHTER_ID,
          ENEMY_FIGHTER_ID,
          HANGAR_TEST_BATTLE.enemyAi,
          HANGAR_TEST_BATTLE.seed,
        ),
    ).toThrow(/cannot target/iu);
  });

  it("rejects fighter ids that are absent from the supplied snapshot", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const ai = new EnemyAiController(
      ENEMY_FIGHTER_ID + 100,
      PLAYER_FIGHTER_ID,
      HANGAR_TEST_BATTLE.enemyAi,
      HANGAR_TEST_BATTLE.seed,
    );

    expect(() => ai.decide(world.getFrame().current)).toThrow(/no fighter/iu);
  });

  it("waits for its readable reaction delay, then approaches through MoveIntent", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const ai = createAi();

    for (let tick = 0; tick < HANGAR_TEST_BATTLE.enemyAi.reactionDelayFrames; tick += 1) {
      const intents = ai.decide(world.getFrame().current);
      expect(intents).toEqual([
        {
          type: "move",
          fighterId: ENEMY_FIGHTER_ID,
          direction: { x: 0, y: 0 },
        },
      ]);
      world.step();
    }

    const intents = ai.decide(world.getFrame().current);
    const move = intents[0];
    expect(move?.type).toBe("move");
    expect(move?.fighterId).toBe(ENEMY_FIGHTER_ID);
    expect(ai.state).toBe("approaching");
    if (move?.type !== "move") {
      throw new Error("Enemy AI did not emit a MoveIntent.");
    }
    expect(Math.hypot(move.direction.x, move.direction.y)).toBeCloseTo(1);
  });

  it("uses a single-slot attack intent at its preferred range", () => {
    const world = new SimulationWorld(
      closeRangeRecipe(HANGAR_TEST_BATTLE.enemyAi.preferredRange),
    );
    const ai = createAi();
    advanceWithoutAi(world, HANGAR_TEST_BATTLE.enemyAi.reactionDelayFrames);

    const intents = ai.decide(world.getFrame().current);
    expect(intents).toContainEqual({
      type: "attack",
      fighterId: ENEMY_FIGHTER_ID,
      slot: 0,
    });
    expect(ai.state).toBe("attacking");
  });

  it("backs away when the target crosses its minimum range", () => {
    const world = new SimulationWorld(closeRangeRecipe(60));
    const ai = createAi();
    advanceWithoutAi(world, HANGAR_TEST_BATTLE.enemyAi.reactionDelayFrames);

    const intents = ai.decide(world.getFrame().current);
    const move = intents[0];
    if (move?.type !== "move") {
      throw new Error("Enemy AI did not emit a spacing MoveIntent.");
    }
    const toPlayer = { x: -1, y: 0 };
    const towardPlayer =
      move.direction.x * toPlayer.x + move.direction.y * toPlayer.y;
    expect(ai.state).toBe("spacing");
    expect(towardPlayer).toBeLessThan(0);
  });

  it("evades a telegraphed nearby attack with move plus dash intents", () => {
    const world = new SimulationWorld(closeRangeRecipe(170));
    const ai = createAi();
    const attack: CommandIntent = {
      type: "attack",
      fighterId: PLAYER_FIGHTER_ID,
      slot: 0,
    };

    world.step([attack]);
    advanceWithoutAi(
      world,
      HANGAR_TEST_BATTLE.enemyAi.reactionDelayFrames - 1,
    );
    const intents = ai.decide(world.getFrame().current);

    expect(intents).toContainEqual({
      type: "dash",
      fighterId: ENEMY_FIGHTER_ID,
    });
    expect(ai.state).toBe("evading");
  });

  it("replays identical aim error and decisions from the same seed", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const first = createAi();
    const second = createAi();
    const firstLog: CommandIntent[][] = [];
    const secondLog: CommandIntent[][] = [];

    for (let tick = 0; tick < 90; tick += 1) {
      firstLog.push([...first.decide(world.getFrame().current)]);
      secondLog.push([...second.decide(world.getFrame().current)]);
      world.step();
    }

    expect(secondLog).toEqual(firstLog);
  });

  it("changes its bounded aim error when the battle seed changes", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    advanceWithoutAi(world, HANGAR_TEST_BATTLE.enemyAi.reactionDelayFrames);
    const first = createAi(HANGAR_TEST_BATTLE.seed);
    const second = createAi(HANGAR_TEST_BATTLE.seed + 1);
    const firstMove = first.decide(world.getFrame().current)[0];
    const secondMove = second.decide(world.getFrame().current)[0];

    expect(firstMove).not.toEqual(secondMove);
  });

  it("waits through hit recovery before making a new decision", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const ai = createAi();
    const base = world.getFrame().current;
    const snapshotAt = (
      tick: number,
      actionKind: SimulationSnapshot["enemy"]["actionKind"],
    ): SimulationSnapshot => ({
      ...base,
      tick,
      enemy: {
        ...base.enemy,
        actionKind,
        state: actionKind === "hitstun" ? "hitstun" : "idle",
      },
    });

    ai.decide(snapshotAt(20, "hitstun"));
    expect(ai.state).toBe("recovering");
    ai.decide(snapshotAt(43, "none"));
    expect(ai.state).toBe("recovering");
    const afterRecovery = ai.decide(snapshotAt(44, "none"));
    expect(ai.state).toBe("approaching");
    expect(afterRecovery[0]).toEqual(
      expect.objectContaining({ type: "move", fighterId: ENEMY_FIGHTER_ID }),
    );
  });
});
