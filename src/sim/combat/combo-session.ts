import { LOADOUT_SLOT_COUNT } from "./loadout";

/**
 * Why an open combo closed. `idle` is the M8 stand-in for Baldr's "Heat gauge
 * started cooling"; a later Heat milestone replaces that trigger without moving
 * the rest of this boundary.
 */
export type ComboSessionEndReason = "idle" | "interrupted";

/**
 * One combo's spent mounting positions. Kept apart from the hit counter on
 * purpose: a combo can stay open across a whiff, and the hit counter can reset
 * while the same combo is still running.
 */
export interface ComboSessionState {
  /** Lower 12 bits, one per loadout slot spent since this combo opened. */
  usedLoadoutSlotsMask: number;
  active: boolean;
  /** Consecutive frames the fighter has done nothing inside an open combo. */
  idleFrames: number;
  lastEndReason: ComboSessionEndReason | null;
}

export function createComboSession(): ComboSessionState {
  return {
    usedLoadoutSlotsMask: 0,
    active: false,
    idleFrames: 0,
    lastEndReason: null,
  };
}

export function isLoadoutSlotUsed(
  session: ComboSessionState,
  slotIndex: number,
): boolean {
  return (session.usedLoadoutSlotsMask & (1 << slotIndex)) !== 0;
}

/** Spends a mounting position. Chain steps inside one weapon never call this. */
export function markLoadoutSlotUsed(
  session: ComboSessionState,
  slotIndex: number,
): void {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= LOADOUT_SLOT_COUNT) {
    throw new RangeError(`Loadout slot index ${slotIndex} is out of range.`);
  }

  session.usedLoadoutSlotsMask |= 1 << slotIndex;
  session.active = true;
  session.idleFrames = 0;
  session.lastEndReason = null;
}

/** Returns true when this call is what closed an open combo. */
export function endComboSession(
  session: ComboSessionState,
  reason: ComboSessionEndReason,
): boolean {
  if (!session.active) {
    return false;
  }

  session.usedLoadoutSlotsMask = 0;
  session.active = false;
  session.idleFrames = 0;
  session.lastEndReason = reason;
  return true;
}

/**
 * Advances the idle countdown by one frame. `busy` is anything that keeps the
 * combo alive — swinging, frozen in hit-stop, or holding a buffered request.
 * Returns true on the frame the combo closes.
 */
export function advanceComboSession(
  session: ComboSessionState,
  busy: boolean,
  idleLimitFrames: number,
): boolean {
  if (!session.active) {
    return false;
  }

  if (busy) {
    session.idleFrames = 0;
    return false;
  }

  session.idleFrames += 1;
  if (session.idleFrames < idleLimitFrames) {
    return false;
  }

  return endComboSession(session, "idle");
}
