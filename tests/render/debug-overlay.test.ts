import { describe, expect, it } from "vitest";
import {
  debugLayerForCode,
  isDebugLayerName,
} from "../../src/render/debug/debug-overlay";

describe("debug overlay controls", () => {
  it("maps world, combat, and performance layers without accepting arbitrary values", () => {
    expect(debugLayerForCode("F1")).toBe("collision");
    expect(debugLayerForCode("F2")).toBe("hitbox");
    expect(debugLayerForCode("F4")).toBe("velocity");
    expect(debugLayerForCode("F7")).toBe("combat");
    expect(debugLayerForCode("F8")).toBe("performance");
    expect(debugLayerForCode("KeyZ")).toBeNull();
    expect(isDebugLayerName("performance")).toBe(true);
    expect(isDebugLayerName("renderer-state")).toBe(false);
  });
});
