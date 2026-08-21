import { describe, expect, it } from "vitest";
import { BattleSession } from "../../src/app/battle-session";
import {
  PERFORMANCE_BUDGETS,
  RuntimePerformanceMonitor,
} from "../../src/app/runtime-performance";
import { HANGAR_TEST_BATTLE } from "../../src/content/arenas/hangar-test";

describe("M7 runtime performance instrumentation", () => {
  it("aggregates bounded timing samples without retaining per-frame history", () => {
    const monitor = new RuntimePerformanceMonitor(() => 0);
    monitor.recordSimulation(0.8);
    monitor.recordSimulation(1.2);
    monitor.recordCollisionHit(0.25);
    monitor.recordAi(0.1);
    monitor.recordFrame(16);
    monitor.recordFrame(18);
    monitor.recordFrame(40);
    monitor.recordFrame(500);

    const snapshot = monitor.snapshot();
    expect(snapshot.simulation).toEqual({
      averageMilliseconds: 1,
      maximumMilliseconds: 1.2,
      samples: 2,
    });
    expect(snapshot.frame.samples).toBe(3);
    expect(snapshot.frame.spikeCount).toBe(1);
    expect(snapshot.frame.framesPerSecond).toBeCloseTo(1_000 / (74 / 3));
    expect(snapshot.budgets).toBe(PERFORMANCE_BUDGETS);

    monitor.reset();
    expect(monitor.snapshot().simulation.samples).toBe(0);
    expect(monitor.snapshot().frame.spikeCount).toBe(0);
  });

  it("observes AI, simulation, and collision-hit phases without changing state", () => {
    let nowMilliseconds = 0;
    const monitor = new RuntimePerformanceMonitor(() => {
      nowMilliseconds += 0.05;
      return nowMilliseconds;
    });
    const observed = new BattleSession(
      HANGAR_TEST_BATTLE,
      HANGAR_TEST_BATTLE.seed,
      monitor,
    );
    const unobserved = new BattleSession(HANGAR_TEST_BATTLE);

    for (let tick = 0; tick < 60; tick += 1) {
      observed.step([]);
      unobserved.step([]);
      observed.drainEvents();
      unobserved.drainEvents();
    }

    const performance = monitor.snapshot();
    expect(observed.frame).toEqual(unobserved.frame);
    expect(performance.ai.samples).toBe(60);
    expect(performance.simulation.samples).toBe(60);
    expect(performance.collisionHit.samples).toBe(60);
    expect(performance.ai.averageMilliseconds).toBeGreaterThan(0);
    expect(performance.simulation.averageMilliseconds).toBeGreaterThan(0);
    expect(performance.collisionHit.averageMilliseconds).toBeGreaterThan(0);
  });
});
