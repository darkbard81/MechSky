import { describe, expect, it } from "vitest";
import { SIMULATION_HZ, SimulationWorld } from "../../src/sim/world/world";

describe("SimulationWorld", () => {
  it("keeps previous and current snapshots for interpolation", () => {
    const world = new SimulationWorld();

    world.step();
    world.step();

    expect(world.getFrame()).toEqual({
      previous: { tick: 1, elapsedSeconds: 1 / SIMULATION_HZ },
      current: { tick: 2, elapsedSeconds: 2 / SIMULATION_HZ },
    });
  });
});
