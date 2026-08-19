import { describe, expect, it, vi } from "vitest";
import { FixedStepClock } from "../../src/sim/world/fixed-step-clock";

describe("FixedStepClock", () => {
  it("advances the simulation at the configured fixed frequency", () => {
    const clock = new FixedStepClock({ hz: 60, maxCatchUpSteps: 5 });
    const step = vi.fn();
    const stepMilliseconds = 1000 / 60;

    clock.reset(0);
    const result = clock.advance(stepMilliseconds * 3.5, step);

    expect(result.steps).toBe(3);
    expect(result.alpha).toBeCloseTo(0.5);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it("limits catch-up work after a long pause", () => {
    const clock = new FixedStepClock({ hz: 60, maxCatchUpSteps: 5 });
    const step = vi.fn();

    clock.reset(0);
    const result = clock.advance(10_000, step);

    expect(result.steps).toBe(5);
    expect(result.alpha).toBeLessThan(1);
    expect(step).toHaveBeenCalledTimes(5);
  });
});
