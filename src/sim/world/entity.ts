import type { Vector2 } from "../math/vector2";

export type EntityId = number;

export interface WorldPosition {
  x: number;
  y: number;
  elevation: number;
}

export interface CombatBody extends WorldPosition {
  radius: number;
  bodyHeight: number;
}

export interface Body {
  readonly position: WorldPosition;
  readonly velocity: Vector2;
  readonly radius: number;
  readonly bodyHeight: number;
}

export type FighterState = "idle" | "moving" | "dashing";

export interface Fighter {
  readonly id: EntityId;
  readonly body: Body;
  readonly movement: {
    readonly acceleration: number;
    readonly deceleration: number;
    readonly maximumSpeed: number;
    readonly dashSpeed: number;
    readonly dashDurationTicks: number;
    readonly dashCooldownTicks: number;
  };
  facing: Vector2;
  dashDirection: Vector2;
  dashEndExclusiveTick: number;
  dashReadyTick: number;
  dashSequence: number;
  lockedTargetId: EntityId | null;
  state: FighterState;
}
