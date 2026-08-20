import { describe, expect, it } from "vitest";
import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import { FixedStepClock } from "../../src/sim/world/fixed-step-clock";
import {
  SIMULATION_HZ,
  SimulationWorld,
  type SimulationSnapshot,
} from "../../src/sim/world/world";

const PRIMARY: CommandIntent = {
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  slot: 0,
};
const SPECIAL: CommandIntent = {
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  slot: 1,
};
const CHASE: CommandIntent = {
  type: "dash",
  fighterId: PLAYER_FIGHTER_ID,
};
const M3_REPLAY_TICKS = 360;

function scriptedIntents(tick: number): readonly CommandIntent[] {
  const direction =
    tick <= 120
      ? { x: 1, y: 0 }
      : tick <= 240
        ? { x: 1, y: -1 }
        : tick <= 360
          ? { x: 0, y: 1 }
          : tick <= 540
            ? { x: 1, y: 0 }
            : { x: -1, y: 0 };

  const intents: CommandIntent[] = [
    { type: "move", fighterId: PLAYER_FIGHTER_ID, direction },
  ];

  if ([30, 210, 420].includes(tick)) {
    intents.push({ type: "dash", fighterId: PLAYER_FIGHTER_ID });
  }

  if ([90, 330].includes(tick)) {
    intents.push({ type: "lock-target", fighterId: PLAYER_FIGHTER_ID });
  }

  return intents;
}

function runAtRenderRate(renderHz: number): SimulationSnapshot {
  const clock = new FixedStepClock({ hz: SIMULATION_HZ, maxCatchUpSteps: 5 });
  const world = new SimulationWorld(HANGAR_TEST_BATTLE);
  clock.reset(0);

  for (let frame = 1; frame <= renderHz * 10; frame += 1) {
    clock.advance((frame * 1_000) / renderHz, () => {
      const nextTick = world.getFrame().current.tick + 1;
      world.step(scriptedIntents(nextTick));
    });
  }

  return world.getFrame().current;
}

function m3Recipe(): BattleRecipe {
  return {
    ...HANGAR_TEST_BATTLE,
    player: {
      ...HANGAR_TEST_BATTLE.player,
      spawn: { x: 0, y: 0, elevation: 0 },
    },
    enemy: {
      ...HANGAR_TEST_BATTLE.enemy,
      spawn: { x: 100, y: 0, elevation: 0 },
    },
  };
}

function recordM3Replay(): ReadonlyMap<number, readonly CommandIntent[]> {
  const replay = new Map<number, readonly CommandIntent[]>();
  const world = new SimulationWorld(m3Recipe());
  let stage = 0;

  for (let tick = 1; tick <= M3_REPLAY_TICKS; tick += 1) {
    const { player, enemy } = world.getFrame().current;
    let intent: CommandIntent | undefined;

    if (stage === 0) {
      intent = PRIMARY;
    } else if (
      stage === 1 &&
      player.attackId === "mech-ground-1" &&
      player.actionFrame >= 10 &&
      player.hitStopFrames === 0
    ) {
      intent = PRIMARY;
    } else if (
      stage === 2 &&
      player.attackId === "mech-ground-2" &&
      player.actionFrame >= 13 &&
      player.hitStopFrames === 0
    ) {
      intent = SPECIAL;
    } else if (
      stage === 3 &&
      player.attackId === "mech-launcher" &&
      player.actionFrame >= 11 &&
      player.hitStopFrames === 0 &&
      enemy.locomotion === "airborne"
    ) {
      intent = CHASE;
    } else if (stage === 4 && player.homingTargetId !== null) {
      const planeDistance = Math.hypot(
        player.body.position.x - enemy.body.position.x,
        player.body.position.y - enemy.body.position.y,
      );
      const elevationDistance = Math.abs(
        player.body.position.elevation - enemy.body.position.elevation,
      );
      if (planeDistance < 105 && elevationDistance < 58) {
        intent = PRIMARY;
      }
    } else if (
      stage === 5 &&
      player.attackId === "mech-air-1" &&
      player.actionFrame >= 9 &&
      player.hitStopFrames === 0
    ) {
      intent = PRIMARY;
    } else if (
      stage === 6 &&
      player.attackId === "mech-air-2" &&
      player.actionFrame >= 10 &&
      player.hitStopFrames === 0
    ) {
      intent = SPECIAL;
    }

    const intents = intent === undefined ? [] : [intent];
    if (intent !== undefined) {
      replay.set(tick, intents);
      stage += 1;
    }
    world.step(intents);
    world.drainEvents();
  }

  if (stage !== 7 || world.getFrame().current.enemy.health !== 420) {
    throw new Error(
      `Failed to record the full M3 replay: stage=${stage}, enemyHealth=${world.getFrame().current.enemy.health}`,
    );
  }

  return replay;
}

function runM3Replay(
  renderHz: number,
  replay: ReadonlyMap<number, readonly CommandIntent[]>,
  skipFrames = false,
): SimulationSnapshot {
  const clock = new FixedStepClock({ hz: SIMULATION_HZ, maxCatchUpSteps: 5 });
  const world = new SimulationWorld(m3Recipe());
  const totalFrames = renderHz * (M3_REPLAY_TICKS / SIMULATION_HZ);
  const skipStart = renderHz * 2;
  const skipEnd = skipStart + Math.max(1, Math.round(renderHz * 0.05));
  clock.reset(0);

  for (let frame = 1; frame <= totalFrames; frame += 1) {
    if (skipFrames && frame >= skipStart && frame < skipEnd) {
      continue;
    }

    clock.advance((frame * 1_000) / renderHz, () => {
      const nextTick = world.getFrame().current.tick + 1;
      world.step(replay.get(nextTick) ?? []);
      world.drainEvents();
    });
  }

  return world.getFrame().current;
}

describe("render-rate independent simulation", () => {
  it("produces the identical 600th tick at 60, 120, and 144 Hz rendering", () => {
    const at60 = runAtRenderRate(60);
    const at120 = runAtRenderRate(120);
    const at144 = runAtRenderRate(144);

    expect(at60.tick).toBe(600);
    expect(at120).toEqual(at60);
    expect(at144).toEqual(at60);
  });

  it("keeps the full M3 air combo identical across render rates and catch-up", () => {
    const replay = recordM3Replay();
    const at60 = runM3Replay(60, replay);
    const at120 = runM3Replay(120, replay);
    const at144 = runM3Replay(144, replay);
    const afterDroppedFrames = runM3Replay(60, replay, true);

    expect(replay.size).toBe(7);
    expect(at60.tick).toBe(M3_REPLAY_TICKS);
    expect(at60.enemy.health).toBe(420);
    expect(at120).toEqual(at60);
    expect(at144).toEqual(at60);
    expect(afterDroppedFrames).toEqual(at60);
  });
});
