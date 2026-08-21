import type { ActiveHitbox, AttackDefinition, AttackLibrary } from "./attack-definition";
import { attackDuration } from "./attack-definition";
import { canCancelInto, isHitboxLive, resolveAttackPhase } from "./attack-timeline";
import { ATTACK_CONTEXT_CYCLE, type AttackContext } from "./attack-context";
import { endComboSession, markLoadoutSlotUsed } from "./combo-session";
import {
  ATTACK_BUTTONS,
  loadoutSlotIndex,
  selectLoadoutWeapon,
  type ContextualLoadout,
} from "./loadout";
import {
  requireWeapon,
  weaponEntryChainId,
  type WeaponLibrary,
} from "./weapon-definition";
import type { AttackButton } from "../input/command-intent";
import type { Fighter, LocomotionState } from "../world/entity";

export interface AttackStart {
  readonly attackId: string;
  readonly chainId: string;
  readonly chainIndex: number;
  readonly weaponId: string;
  readonly button: AttackButton;
  readonly context: AttackContext;
  readonly slotIndex: number;
  /** False while a weapon walks its own chain; those steps cost no new slot. */
  readonly consumesSlot: boolean;
}

export function requireAttack(
  library: AttackLibrary,
  attackId: string,
): AttackDefinition {
  const definition = library.attacks[attackId];

  if (definition === undefined) {
    throw new RangeError(`Attack '${attackId}' is not in the attack library.`);
  }

  return definition;
}

function chainAttackId(
  library: AttackLibrary,
  chainId: string,
  index: number,
): string | undefined {
  return library.chains[chainId]?.attacks[index];
}

/**
 * Slots the fighter cannot enter right now because their weapon has no entry
 * chain for its locomotion. Folding this into the excluded mask lets the cycle
 * walk past a ground-only mount while airborne instead of refusing the input.
 */
function unusableSlotsMask(
  loadout: ContextualLoadout,
  weapons: WeaponLibrary,
  locomotion: LocomotionState,
): number {
  let mask = 0;

  for (const context of ATTACK_CONTEXT_CYCLE) {
    for (const button of ATTACK_BUTTONS) {
      const weaponId = loadout[context][button];
      if (weaponId === null) {
        continue;
      }

      const weapon = requireWeapon(weapons, weaponId);
      if (weaponEntryChainId(weapon, locomotion) === null) {
        mask |= 1 << loadoutSlotIndex(context, button);
      }
    }
  }

  return mask;
}

/** A fighter can open a new attack only from a neutral, unlocked action. */
function isActionable(fighter: Fighter): boolean {
  return fighter.action.kind === "none" && fighter.hitStopFrames === 0;
}

/** True while the active weapon still has an unplayed step for this button. */
function hasChainContinuation(
  fighter: Fighter,
  library: AttackLibrary,
  button: AttackButton,
): boolean {
  const action = fighter.action;

  return (
    action.kind === "attack" &&
    action.chainId !== null &&
    action.sourceButton === button &&
    chainAttackId(library, action.chainId, action.chainIndex + 1) !== undefined
  );
}

/**
 * Advances the active weapon's own chain. The slot was already spent when the
 * weapon entered, so a 1st-to-2nd hit never touches the used mask.
 */
function resolveChainContinuation(
  fighter: Fighter,
  library: AttackLibrary,
): AttackStart | null {
  const action = fighter.action;

  if (
    action.attackId === null ||
    action.chainId === null ||
    action.weaponId === null ||
    action.sourceButton === null ||
    action.sourceContext === null ||
    action.sourceSlotIndex === null
  ) {
    return null;
  }

  const nextIndex = action.chainIndex + 1;
  const nextId = chainAttackId(library, action.chainId, nextIndex);
  if (nextId === undefined) {
    return null;
  }

  const current = requireAttack(library, action.attackId);
  const next = requireAttack(library, nextId);
  if (!canCancelInto(current, action.frame, action.hasConnected, next)) {
    return null;
  }

  return {
    attackId: nextId,
    chainId: action.chainId,
    chainIndex: nextIndex,
    weaponId: action.weaponId,
    button: action.sourceButton,
    context: action.sourceContext,
    slotIndex: action.sourceSlotIndex,
    consumesSlot: false,
  };
}

/**
 * Decides what the fighter's buffered attack request should start this frame,
 * or null when nothing is allowed yet. Buffer expiry is handled by the caller
 * so a consumed request and an expired one stay distinguishable.
 *
 * The loadout only nominates a weapon. `canCancelInto` still decides whether
 * the swing is legal, so a selection can never route around the tag graph.
 */
export function resolveAttackStart(
  fighter: Fighter,
  library: AttackLibrary,
  weapons: WeaponLibrary,
): AttackStart | null {
  const request = fighter.bufferedAttack;
  if (
    fighter.attackBufferFrames <= 0 ||
    fighter.hitStopFrames > 0 ||
    request === null ||
    fighter.locomotion === "downed"
  ) {
    return null;
  }

  if (hasChainContinuation(fighter, library, request.button)) {
    return resolveChainContinuation(fighter, library);
  }

  const selection = selectLoadoutWeapon(
    fighter.loadout,
    request.button,
    request.preferredContext,
    fighter.comboSession.usedLoadoutSlotsMask |
      unusableSlotsMask(fighter.loadout, weapons, fighter.locomotion),
  );
  if (selection === null) {
    return null;
  }

  const weapon = requireWeapon(weapons, selection.weaponId);
  const chainId = weaponEntryChainId(weapon, fighter.locomotion);
  if (chainId === null) {
    return null;
  }

  const attackId = chainAttackId(library, chainId, 0);
  if (attackId === undefined) {
    return null;
  }

  const start: AttackStart = {
    attackId,
    chainId,
    chainIndex: 0,
    weaponId: selection.weaponId,
    button: selection.button,
    context: selection.context,
    slotIndex: selection.slotIndex,
    consumesSlot: true,
  };

  if (isActionable(fighter)) {
    return start;
  }

  if (fighter.action.kind !== "attack" || fighter.action.attackId === null) {
    return null;
  }

  const current = requireAttack(library, fighter.action.attackId);
  const next = requireAttack(library, attackId);
  if (!canCancelInto(current, fighter.action.frame, fighter.action.hasConnected, next)) {
    return null;
  }

  return start;
}

export function beginAttack(fighter: Fighter, start: AttackStart): void {
  fighter.action.kind = "attack";
  fighter.action.attackId = start.attackId;
  fighter.action.chainId = start.chainId;
  fighter.action.frame = 0;
  fighter.action.hasConnected = false;
  fighter.action.chainIndex = start.chainIndex;
  fighter.action.hitTargets.clear();
  fighter.action.weaponId = start.weaponId;
  fighter.action.sourceButton = start.button;
  fighter.action.sourceContext = start.context;
  fighter.action.sourceSlotIndex = start.slotIndex;
  fighter.state = "attacking";
  fighter.attackBufferFrames = 0;
  fighter.bufferedAttack = null;

  // The mounting position is spent the moment its weapon actually enters.
  if (start.consumesSlot) {
    markLoadoutSlotUsed(fighter.comboSession, start.slotIndex);
  }
}

export function clearAction(fighter: Fighter): void {
  fighter.action.kind = "none";
  fighter.action.attackId = null;
  fighter.action.chainId = null;
  fighter.action.frame = 0;
  fighter.action.hasConnected = false;
  fighter.action.chainIndex = -1;
  fighter.action.hitTargets.clear();
  fighter.action.weaponId = null;
  fighter.action.sourceButton = null;
  fighter.action.sourceContext = null;
  fighter.action.sourceSlotIndex = null;
}

export function beginHitstun(fighter: Fighter, frames: number): void {
  endComboSession(fighter.comboSession, "interrupted");
  clearAction(fighter);
  fighter.action.kind = "hitstun";
  fighter.action.chainIndex = frames;
  fighter.state = "hitstun";
}

/** Live hitbox for this frame, placed in front of the fighter's facing. */
export function currentHitbox(
  fighter: Fighter,
  library: AttackLibrary,
): ActiveHitbox | null {
  if (fighter.action.kind !== "attack" || fighter.action.attackId === null) {
    return null;
  }

  const definition = requireAttack(library, fighter.action.attackId);
  if (!isHitboxLive(definition, fighter.action.frame)) {
    return null;
  }

  const { hitbox } = definition;
  const base = fighter.body.position;

  return {
    attackId: definition.id,
    ownerId: fighter.id,
    x: base.x + fighter.facing.x * hitbox.forwardOffset,
    y: base.y + fighter.facing.y * hitbox.forwardOffset,
    radius: hitbox.radius,
    minimumElevation: base.elevation + hitbox.minimumElevation,
    maximumElevation: base.elevation + hitbox.maximumElevation,
  };
}

export interface ActionAdvance {
  readonly attackFinished: boolean;
  readonly attackConnected: boolean;
  readonly finishedAttackId: string | null;
  readonly hitstunEnded: boolean;
}

const IDLE_ADVANCE: ActionAdvance = Object.freeze({
  attackFinished: false,
  attackConnected: false,
  finishedAttackId: null,
  hitstunEnded: false,
});

/**
 * Advances one fighter's action clock by a frame. Hit-stop freezes this clock
 * only; the world tick and the input buffer keep running elsewhere.
 */
export function advanceAction(
  fighter: Fighter,
  library: AttackLibrary,
): ActionAdvance {
  if (fighter.hitStopFrames > 0) {
    fighter.hitStopFrames -= 1;
    return IDLE_ADVANCE;
  }

  if (fighter.action.kind === "attack" && fighter.action.attackId !== null) {
    const definition = requireAttack(library, fighter.action.attackId);
    fighter.action.frame += 1;

    if (resolveAttackPhase(definition, fighter.action.frame) === "finished") {
      const connected = fighter.action.hasConnected;
      clearAction(fighter);
      fighter.state = "idle";
      return {
        attackFinished: true,
        attackConnected: connected,
        finishedAttackId: definition.id,
        hitstunEnded: false,
      };
    }

    return IDLE_ADVANCE;
  }

  if (fighter.action.kind === "hitstun") {
    fighter.action.frame += 1;

    if (fighter.action.frame >= fighter.action.chainIndex) {
      clearAction(fighter);
      fighter.state = "idle";
      return { ...IDLE_ADVANCE, hitstunEnded: true };
    }

    return IDLE_ADVANCE;
  }

  return IDLE_ADVANCE;
}

export function attackProgress(
  fighter: Fighter,
  library: AttackLibrary,
): { readonly frame: number; readonly duration: number } | null {
  if (fighter.action.kind !== "attack" || fighter.action.attackId === null) {
    return null;
  }

  const definition = requireAttack(library, fighter.action.attackId);
  return { frame: fighter.action.frame, duration: attackDuration(definition) };
}
