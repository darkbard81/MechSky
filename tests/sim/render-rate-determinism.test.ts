import { describe, expect, it } from "vitest";
import { HANGAR_TEST_BATTLE, PLAYER_FIGHTER_ID } from "../../src/content/arenas/hangar-test";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import { FixedStepClock } from "../../src/sim/world/fixed-step-clock";
import { SIMULATION_HZ, SimulationWorld, type SimulationSnapshot } from "../../src/sim/world/world";

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

describe("render-rate independent simulation", () => {
  it("produces the identical 600th tick at 60, 120, and 144 Hz rendering", () => {
    const at60 = runAtRenderRate(60);
    const at120 = runAtRenderRate(120);
    const at144 = runAtRenderRate(144);

    expect(at60.tick).toBe(600);
    expect(at120).toEqual(at60);
    expect(at144).toEqual(at60);
  });
});
