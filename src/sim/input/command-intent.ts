import type { EntityId } from "../world/entity";
import type { Vector2 } from "../math/vector2";

export interface MoveIntent {
  readonly type: "move";
  readonly fighterId: EntityId;
  readonly direction: Readonly<Vector2>;
}

export interface DashIntent {
  readonly type: "dash";
  readonly fighterId: EntityId;
}

export interface LockTargetIntent {
  readonly type: "lock-target";
  readonly fighterId: EntityId;
}

export type CommandIntent = MoveIntent | DashIntent | LockTargetIntent;
