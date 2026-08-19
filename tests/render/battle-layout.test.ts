import { describe, expect, it } from "vitest";
import {
  calculateBattleLayout,
  REFERENCE_VIEWPORT,
} from "../../src/render/battle-layout";

describe("battle layout", () => {
  it("uses the 1024 by 768 reference viewport without distorting actors", () => {
    const layout = calculateBattleLayout(
      REFERENCE_VIEWPORT.width,
      REFERENCE_VIEWPORT.height,
    );

    expect(layout.width).toBe(1024);
    expect(layout.height).toBe(768);
    expect(layout.actorScale).toBe(1);
    expect(layout.playerX).toBeLessThan(layout.targetX);
    expect(layout.targetReticleY).toBeLessThan(layout.groundY);
  });

  it("uses one uniform actor scale at desktop size", () => {
    const layout = calculateBattleLayout(1920, 1080);

    expect(layout.actorScale).toBe(1.28);
    expect(layout.playerX).toBeCloseTo(652.8);
    expect(layout.targetX).toBe(1344);
  });
});
