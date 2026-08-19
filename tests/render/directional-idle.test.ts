import { describe, expect, it } from "vitest";
import {
  DIRECTIONAL_IDLE_CELL_SIZE,
  DIRECTIONAL_IDLE_DIRECTIONS,
  DIRECTIONAL_IDLE_FRAME_COUNT,
  DIRECTIONAL_IDLE_SHEET_SIZE,
  DIRECTIONAL_IDLE_TICKS_PER_FRAME,
  directionalIdleFrameAddress,
  resolveDirectionalIdleDirection,
  resolveDirectionalIdleFrameAddress,
  resolveDirectionalIdleFrameIndex,
} from "../../src/render/actors/directional-idle";

describe("directional idle sprite selection", () => {
  it.each([
    [{ x: 0, y: 1 }, "front"],
    [{ x: 0, y: -1 }, "back"],
    [{ x: -1, y: 0 }, "left"],
    [{ x: 1, y: 0 }, "right"],
  ] as const)("maps facing %j to %s", (facing, expected) => {
    expect(resolveDirectionalIdleDirection(facing)).toBe(expected);
  });

  it("uses the vertical direction for diagonal ties and front for zero or invalid facing", () => {
    expect(resolveDirectionalIdleDirection({ x: 1, y: 1 })).toBe("front");
    expect(resolveDirectionalIdleDirection({ x: -1, y: -1 })).toBe("back");
    expect(resolveDirectionalIdleDirection({ x: 0.9, y: 0.2 })).toBe("right");
    expect(resolveDirectionalIdleDirection({ x: -0.2, y: 0.9 })).toBe("front");
    expect(resolveDirectionalIdleDirection({ x: 0, y: 0 })).toBe("front");
    expect(resolveDirectionalIdleDirection({ x: Number.NaN, y: 1 })).toBe("front");
  });

  it("locks the authored row order to front, left, right, back", () => {
    expect(directionalIdleFrameAddress("front", 0)).toMatchObject({ row: 0, y: 0 });
    expect(directionalIdleFrameAddress("left", 0)).toMatchObject({ row: 1, y: 256 });
    expect(directionalIdleFrameAddress("right", 0)).toMatchObject({ row: 2, y: 512 });
    expect(directionalIdleFrameAddress("back", 0)).toMatchObject({ row: 3, y: 768 });
  });

  it("advances idle frames on exact 12-tick boundaries and loops after four frames", () => {
    expect(DIRECTIONAL_IDLE_TICKS_PER_FRAME).toBe(12);
    expect(resolveDirectionalIdleFrameIndex(0, "idle")).toBe(0);
    expect(resolveDirectionalIdleFrameIndex(11, "idle")).toBe(0);
    expect(resolveDirectionalIdleFrameIndex(12, "idle")).toBe(1);
    expect(resolveDirectionalIdleFrameIndex(23, "idle")).toBe(1);
    expect(resolveDirectionalIdleFrameIndex(24, "idle")).toBe(2);
    expect(resolveDirectionalIdleFrameIndex(36, "idle")).toBe(3);
    expect(resolveDirectionalIdleFrameIndex(47, "idle")).toBe(3);
    expect(resolveDirectionalIdleFrameIndex(48, "idle")).toBe(0);
    expect(resolveDirectionalIdleFrameIndex(60, "idle")).toBe(1);
  });

  it("pins moving and dashing fighters to their directional frame zero", () => {
    expect(resolveDirectionalIdleFrameIndex(36, "moving")).toBe(0);
    expect(resolveDirectionalIdleFrameIndex(36, "dashing")).toBe(0);

    expect(
      resolveDirectionalIdleFrameAddress({ x: -1, y: 0 }, 36, "moving"),
    ).toMatchObject({ row: 1, column: 0, x: 0, y: 256 });
    expect(
      resolveDirectionalIdleFrameAddress({ x: 1, y: 0 }, 36, "dashing"),
    ).toMatchObject({ row: 2, column: 0, x: 0, y: 512 });
  });

  it("covers exactly sixteen unique 256 by 256 cells in the 1024 sheet", () => {
    const addresses = DIRECTIONAL_IDLE_DIRECTIONS.flatMap((direction) =>
      Array.from({ length: DIRECTIONAL_IDLE_FRAME_COUNT }, (_, frameIndex) =>
        directionalIdleFrameAddress(direction, frameIndex),
      ),
    );
    const uniqueOrigins = new Set(addresses.map(({ x, y }) => `${x},${y}`));

    expect(DIRECTIONAL_IDLE_CELL_SIZE).toBe(256);
    expect(DIRECTIONAL_IDLE_SHEET_SIZE).toBe(1024);
    expect(addresses).toHaveLength(16);
    expect(uniqueOrigins.size).toBe(16);
    expect(addresses.every(({ width, height }) => width === 256 && height === 256)).toBe(
      true,
    );
    expect(
      addresses.every(
        ({ x, y, width, height }) =>
          x >= 0 &&
          y >= 0 &&
          x + width <= DIRECTIONAL_IDLE_SHEET_SIZE &&
          y + height <= DIRECTIONAL_IDLE_SHEET_SIZE,
      ),
    ).toBe(true);
  });

  it("rejects invalid frame indices", () => {
    expect(() => directionalIdleFrameAddress("front", -1)).toThrow(RangeError);
    expect(() => directionalIdleFrameAddress("back", 4)).toThrow(RangeError);
    expect(() => directionalIdleFrameAddress("left", 1.5)).toThrow(RangeError);
  });
});
