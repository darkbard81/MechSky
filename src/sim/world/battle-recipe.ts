import type { AttackLibrary } from "../combat/attack-definition";
import type { EntityId, MovementProfile, WorldPosition } from "./entity";

export interface ArenaRecipe {
  readonly center: Readonly<{ x: number; y: number }>;
  readonly radius: number;
}

export type MovementRecipe = MovementProfile;

export interface FighterRecipe {
  readonly id: EntityId;
  readonly spawn: Readonly<WorldPosition>;
  readonly radius: number;
  readonly bodyHeight: number;
  readonly health: number;
  readonly movement: MovementRecipe;
  readonly attackChains: {
    readonly grounded: readonly (string | null)[];
    readonly airborne: readonly (string | null)[];
  };
}

export interface CombatRecipe {
  readonly library: AttackLibrary;
  /** Frames a pressed attack stays buffered before it is discarded. */
  readonly inputBufferFrames: number;
  /** Idle frames after the last connect before the combo counter resets. */
  readonly comboResetFrames: number;
  readonly hitstunFriction: number;
  readonly gravity: number;
  readonly maximumFallSpeed: number;
  readonly homingDurationTicks: number;
  readonly homingSpeed: number;
  readonly homingVerticalSpeed: number;
  readonly downedFrames: number;
}

export interface BattleRecipe {
  readonly arena: ArenaRecipe;
  readonly player: FighterRecipe;
  readonly enemy: FighterRecipe;
  readonly combat: CombatRecipe;
}
