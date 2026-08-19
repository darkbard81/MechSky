import { describe, expect, it } from "vitest";
import {
  calculateBattleLayout,
  REFERENCE_VIEWPORT,
} from "../../src/render/battle-layout";

describe("battle layout", () => {
  it("uses the 1024 by 768 reference viewport with one world scale", () => {
    const layout = calculateBattleLayout(
      REFERENCE_VIEWPORT.width,
      REFERENCE_VIEWPORT.height,
    );

    expect(layout.width).toBe(1024);
    expect(layout.height).toBe(768);
    expect(layout.actorScale).toBe(1);
    expect(layout.cameraAnchorX).toBeCloseTo(450.56);
    expect(layout.cameraAnchorY).toBeCloseTo(476.16);
  });

  it("clamps one uniform world scale at desktop size", () => {
    const layout = calculateBattleLayout(1920, 1080);

    expect(layout.actorScale).toBe(1.28);
    expect(layout.cameraAnchorX).toBeCloseTo(844.8);
    expect(layout.cameraAnchorY).toBeCloseTo(669.6);
  });

  it("keeps the camera anchor inside a compact battle surface", () => {
    const layout = calculateBattleLayout(520, 400);

    expect(layout.actorScale).toBe(0.88);
    expect(layout.cameraAnchorX).toBeCloseTo(249.6);
    expect(layout.cameraAnchorY).toBeCloseTo(248);
  });
});
