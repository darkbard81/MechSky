import type { AttackButton } from "../input/command-intent";
import { vectorLength, type Vector2 } from "../math/vector2";

/**
 * Which loadout row an attack request reads. This is input routing only. A
 * context never implies a weapon kind, a locomotion state, or a movement mode,
 * so a projectile can sit in short range and a kick can sit in long range.
 */
export type AttackContext =
  | "short-range"
  | "search-dash"
  | "long-range"
  | "normal-dash";

/**
 * Circular order the same-button slot search walks. Deliberately separate from
 * the preferred-context rules below: those pick where the walk starts, this
 * picks where it goes next. Merging the two into one priority list would make
 * a held direction silently reorder the fallbacks.
 */
export const ATTACK_CONTEXT_CYCLE = [
  "short-range",
  "search-dash",
  "long-range",
  "normal-dash",
] as const satisfies readonly AttackContext[];

const ATTACK_CONTEXT_CODES: Readonly<Record<AttackContext, string>> = Object.freeze({
  "short-range": "SR",
  "search-dash": "SD",
  "long-range": "LR",
  "normal-dash": "ND",
});

export interface AttackContextInput {
  readonly move: Readonly<Vector2>;
  readonly searchDashPressed: boolean;
  readonly searchDashHeld: boolean;
  readonly searchDashActive: boolean;
  /** Planar gap to the combat target, or null when there is no valid target. */
  readonly targetDistance: number | null;
  readonly searchRange: number;
}

/**
 * The request-time attack intent, frozen when the button is buffered. Recomputing
 * the context on the frame the attack finally starts would let a direction the
 * player already released decide which weapon fires.
 */
export interface BufferedAttackRequest {
  readonly button: AttackButton;
  readonly preferredContext: AttackContext;
  readonly requestedTick: number;
}

export function isAttackContext(value: string): value is AttackContext {
  return value in ATTACK_CONTEXT_CODES;
}

/** Two-letter form used by debug overlays and slot labels. */
export function attackContextCode(context: AttackContext): string {
  return ATTACK_CONTEXT_CODES[context];
}

/**
 * Decides the first slot a button press aims at. Direction beats the Search
 * Dash button, which beats the distance test; used slots and weapon selection
 * are not this function's business.
 */
export function resolvePreferredAttackContext(
  input: AttackContextInput,
): AttackContext {
  if (vectorLength(input.move) > Number.EPSILON) {
    return "normal-dash";
  }

  if (
    input.searchDashPressed ||
    input.searchDashHeld ||
    input.searchDashActive
  ) {
    return "search-dash";
  }

  if (
    input.targetDistance !== null &&
    input.targetDistance <= input.searchRange
  ) {
    return "short-range";
  }

  return "long-range";
}
