import { describe, expect, it } from "vitest";
import { projectFighter } from "../../src/render/actors/fighter-projection";

describe("fighter 2.5D projection", () => {
  it("raises only the sprite while actor and shadow remain at ground position", () => {
    const grounded = projectFighter({ x: 40, y: 75, elevation: 0 });
    const airborne = projectFighter({ x: 40, y: 75, elevation: 220 });

    expect(airborne.actor).toEqual(grounded.actor);
    expect(airborne.shadow).toEqual(grounded.shadow);
    expect(grounded.spriteOffsetY).toBe(0);
    expect(airborne.spriteOffsetY).toBe(-220);
  });
});
