import type { EntityId } from "../world/entity";
import type { Vector2 } from "../math/vector2";

/** The three attack buttons. Each one owns a column of four loadout slots. */
export type AttackButton = "A" | "B" | "C";

export interface MoveIntent {
  readonly type: "move";
  readonly fighterId: EntityId;
  readonly direction: Readonly<Vector2>;
}

/**
 * One D / Search Dash button. `pressed` is the rising edge that starts a dash
 * or homing chase; `held` is the continuous state the search-dash attack
 * context reads. Both travel because a replay of edges alone cannot tell the
 * simulation whether the button was still down.
 */
export interface SearchDashIntent {
  readonly type: "search-dash";
  readonly fighterId: EntityId;
  readonly pressed: boolean;
  readonly held: boolean;
}

export interface AttackIntent {
  readonly type: "attack";
  readonly fighterId: EntityId;
  readonly button: AttackButton;
}

export interface LockTargetIntent {
  readonly type: "lock-target";
  readonly fighterId: EntityId;
}

export type CommandIntent =
  | MoveIntent
  | SearchDashIntent
  | AttackIntent
  | LockTargetIntent;
