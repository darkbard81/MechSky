import type { AttackLibrary } from "../combat/attack-definition";
import type { ContextualLoadout } from "../combat/loadout";
import type { WeaponLibrary } from "../combat/weapon-definition";
import type { EnemyAiRecipe } from "../ai/enemy-ai";
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
  readonly loadout: ContextualLoadout;
}

export interface CombatRecipe {
  readonly library: AttackLibrary;
  readonly weapons: WeaponLibrary;
  /** Planar radius inside which a target reads as short range instead of long. */
  readonly searchRange: number;
  /** Frames a pressed attack stays buffered before it is discarded. */
  readonly inputBufferFrames: number;
  /** Idle frames after the last connect before the combo counter resets. */
  readonly comboResetFrames: number;
  /** Idle frames that close a combo session and free every loadout slot. */
  readonly comboSessionIdleFrames: number;
  readonly hitstunFriction: number;
  readonly gravity: number;
  readonly maximumFallSpeed: number;
  readonly homingDurationTicks: number;
  readonly homingSpeed: number;
  readonly homingVerticalSpeed: number;
  /** Planar gap the chaser holds once it reaches its target. */
  readonly homingStopDistance: number;
  readonly downedFrames: number;
}

export interface BattleRecipe {
  readonly seed: number;
  readonly arena: ArenaRecipe;
  readonly player: FighterRecipe;
  readonly enemy: FighterRecipe;
  readonly enemyAi: EnemyAiRecipe;
  readonly combat: CombatRecipe;
}
