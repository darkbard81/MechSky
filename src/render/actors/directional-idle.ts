import type { Vector2 } from "../../sim/math/vector2";
import type { FighterState } from "../../sim/world/entity";

export const DIRECTIONAL_IDLE_CELL_SIZE = 256;
export const DIRECTIONAL_IDLE_FRAME_COUNT = 4;
export const DIRECTIONAL_IDLE_TICKS_PER_FRAME = 12;
export const DIRECTIONAL_IDLE_SHEET_SIZE =
  DIRECTIONAL_IDLE_CELL_SIZE * DIRECTIONAL_IDLE_FRAME_COUNT;

export const DIRECTIONAL_IDLE_DIRECTIONS = [
  "front",
  "left",
  "right",
  "back",
] as const;

export type DirectionalIdleDirection =
  (typeof DIRECTIONAL_IDLE_DIRECTIONS)[number];

export interface DirectionalIdleFrameAddress {
  readonly column: number;
  readonly height: number;
  readonly row: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const DIRECTION_ROW: Readonly<Record<DirectionalIdleDirection, number>> =
  Object.freeze({
    front: 0,
    left: 1,
    right: 2,
    back: 3,
  });

export function resolveDirectionalIdleDirection(
  facing: Readonly<Vector2>,
): DirectionalIdleDirection {
  const horizontalMagnitude = Math.abs(facing.x);
  const verticalMagnitude = Math.abs(facing.y);

  if (
    !Number.isFinite(horizontalMagnitude) ||
    !Number.isFinite(verticalMagnitude) ||
    (horizontalMagnitude === 0 && verticalMagnitude === 0)
  ) {
    return "front";
  }

  if (verticalMagnitude >= horizontalMagnitude) {
    return facing.y >= 0 ? "front" : "back";
  }

  return facing.x >= 0 ? "right" : "left";
}

export function resolveDirectionalIdleFrameIndex(
  tick: number,
  state: FighterState,
): number {
  if (state !== "idle" || !Number.isFinite(tick) || tick <= 0) {
    return 0;
  }

  const wholeTick = Math.floor(tick);
  return (
    Math.floor(wholeTick / DIRECTIONAL_IDLE_TICKS_PER_FRAME) %
    DIRECTIONAL_IDLE_FRAME_COUNT
  );
}

export function directionalIdleFrameAddress(
  direction: DirectionalIdleDirection,
  frameIndex: number,
): DirectionalIdleFrameAddress {
  if (
    !Number.isInteger(frameIndex) ||
    frameIndex < 0 ||
    frameIndex >= DIRECTIONAL_IDLE_FRAME_COUNT
  ) {
    throw new RangeError(
      `Directional idle frame index must be between 0 and ${DIRECTIONAL_IDLE_FRAME_COUNT - 1}.`,
    );
  }

  const row = DIRECTION_ROW[direction];
  return {
    column: frameIndex,
    height: DIRECTIONAL_IDLE_CELL_SIZE,
    row,
    width: DIRECTIONAL_IDLE_CELL_SIZE,
    x: frameIndex * DIRECTIONAL_IDLE_CELL_SIZE,
    y: row * DIRECTIONAL_IDLE_CELL_SIZE,
  };
}

export function resolveDirectionalIdleFrameAddress(
  facing: Readonly<Vector2>,
  tick: number,
  state: FighterState,
): DirectionalIdleFrameAddress {
  return directionalIdleFrameAddress(
    resolveDirectionalIdleDirection(facing),
    resolveDirectionalIdleFrameIndex(tick, state),
  );
}
