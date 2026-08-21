import {
  ATTACK_CONTEXT_CYCLE,
  attackContextCode,
  type AttackContext,
} from "./attack-context";
import type { AttackButton } from "../input/command-intent";

export const ATTACK_BUTTONS = ["A", "B", "C"] as const satisfies readonly AttackButton[];
export const LOADOUT_SLOT_COUNT =
  ATTACK_CONTEXT_CYCLE.length * ATTACK_BUTTONS.length;

/** Every mounting position, `weaponId` or null. Twelve slots, no holes. */
export type ContextualLoadout = Readonly<
  Record<AttackContext, Readonly<Record<AttackButton, string | null>>>
>;

export interface LoadoutSelection {
  readonly context: AttackContext;
  readonly button: AttackButton;
  readonly weaponId: string;
  readonly slotIndex: number;
}

export function isAttackButton(value: string): value is AttackButton {
  return (ATTACK_BUTTONS as readonly string[]).includes(value);
}

/**
 * Mounting position, not weapon identity. The same weapon in two slots stays
 * two slots, so a combo may fire it twice.
 */
export function loadoutSlotIndex(
  context: AttackContext,
  button: AttackButton,
): number {
  const contextIndex = ATTACK_CONTEXT_CYCLE.indexOf(context);
  const buttonIndex = ATTACK_BUTTONS.indexOf(button);

  if (contextIndex < 0 || buttonIndex < 0) {
    throw new RangeError(`Loadout slot ${context}/${button} does not exist.`);
  }

  return contextIndex * ATTACK_BUTTONS.length + buttonIndex;
}

/** Debug form of a slot index, such as `SR-A`. */
export function loadoutSlotLabel(slotIndex: number): string {
  const context = ATTACK_CONTEXT_CYCLE[Math.floor(slotIndex / ATTACK_BUTTONS.length)];
  const button = ATTACK_BUTTONS[slotIndex % ATTACK_BUTTONS.length];

  if (context === undefined || button === undefined) {
    throw new RangeError(`Loadout slot index ${slotIndex} is out of range.`);
  }

  return `${attackContextCode(context)}-${button}`;
}

/**
 * Walks the fixed SR → SD → LR → ND ring starting at `preferredContext` and
 * wrapping exactly once, and returns the first slot in this button's column
 * that holds a weapon and is not excluded.
 *
 * `excludedSlotsMask` carries every slot the caller has ruled out: spent
 * earlier in this combo, or holding a weapon with no entry for the fighter's
 * current locomotion. Cancel rules stay with the attack timeline; a selection
 * here is a candidate, not permission to swing.
 */
export function selectLoadoutWeapon(
  loadout: ContextualLoadout,
  button: AttackButton,
  preferredContext: AttackContext,
  excludedSlotsMask: number,
): LoadoutSelection | null {
  const start = ATTACK_CONTEXT_CYCLE.indexOf(preferredContext);

  if (start < 0) {
    throw new RangeError(`Attack context '${preferredContext}' is not in the cycle.`);
  }

  for (let step = 0; step < ATTACK_CONTEXT_CYCLE.length; step += 1) {
    const context =
      ATTACK_CONTEXT_CYCLE[(start + step) % ATTACK_CONTEXT_CYCLE.length];

    if (context === undefined) {
      throw new RangeError("Attack context cycle index went out of range.");
    }

    const weaponId = loadout[context][button];
    if (weaponId === null) {
      continue;
    }

    const slotIndex = loadoutSlotIndex(context, button);
    if ((excludedSlotsMask & (1 << slotIndex)) !== 0) {
      continue;
    }

    return { context, button, weaponId, slotIndex };
  }

  return null;
}
