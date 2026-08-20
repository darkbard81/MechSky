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

export type FighterState =
  | "idle"
  | "moving"
  | "dashing"
  | "attacking"
  | "hitstun"
  | "downed";

/**
 * Locomotion, action, and flags stay separate so combinations like
 * "airborne + attacking + invulnerable" never need their own enum member.
 */
export type ActionKind = "none" | "attack" | "hitstun";

export interface ActionState {
  kind: ActionKind;
  attackId: string | null;
  /** Frames elapsed inside the current action. Frozen while hit-stopped. */
  frame: number;
  /** Whether the current attack has already connected. */
  hasConnected: boolean;
  /** Position of the current attack inside its combo chain. */
  chainIndex: number;
  /** Fighters already hit by the current attack, so one swing hits once. */
  hitTargets: Set<EntityId>;
}

export interface MovementProfile {
  readonly acceleration: number;
  readonly deceleration: number;
  readonly maximumSpeed: number;
  readonly dashSpeed: number;
  readonly dashDurationTicks: number;
  readonly dashCooldownTicks: number;
}

export interface Fighter {
  readonly id: EntityId;
  readonly body: Body;
  readonly movement: MovementProfile;
  readonly maximumHealth: number;
  health: number;
  facing: Vector2;
  dashDirection: Vector2;
  dashEndExclusiveTick: number;
  dashReadyTick: number;
  dashSequence: number;
  lockedTargetId: EntityId | null;
  state: FighterState;
  action: ActionState;
  /** Action-clock freeze from a connect. World ticks on; this actor does not. */
  hitStopFrames: number;
  /** Remaining life of a buffered attack request, in frames. */
  attackBufferFrames: number;
  comboHits: number;
  comboResetFrames: number;
  /** Chain this fighter uses for its attack button. */
  readonly chainId: string;
}

export function createIdleAction(): ActionState {
  return {
    kind: "none",
    attackId: null,
    frame: 0,
    hasConnected: false,
    chainIndex: -1,
    hitTargets: new Set<EntityId>(),
  };
}
