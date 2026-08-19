import type { EntityId, WorldPosition } from "./entity";

export interface ArenaRecipe {
  readonly center: Readonly<{ x: number; y: number }>;
  readonly radius: number;
}

export interface MovementRecipe {
  readonly acceleration: number;
  readonly deceleration: number;
  readonly maximumSpeed: number;
  readonly dashSpeed: number;
  readonly dashDurationTicks: number;
  readonly dashCooldownTicks: number;
}

export interface FighterRecipe {
  readonly id: EntityId;
  readonly spawn: Readonly<WorldPosition>;
  readonly radius: number;
  readonly bodyHeight: number;
  readonly movement: MovementRecipe;
}

export interface TargetRecipe {
  readonly id: EntityId;
  readonly position: Readonly<WorldPosition>;
}

export interface BattleRecipe {
  readonly arena: ArenaRecipe;
  readonly player: FighterRecipe;
  readonly target: TargetRecipe;
}
