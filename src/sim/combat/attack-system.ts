import type { ActiveHitbox, AttackDefinition, AttackLibrary } from "./attack-definition";
import { attackDuration } from "./attack-definition";
import { canCancelInto, isHitboxLive, resolveAttackPhase } from "./attack-timeline";
import type { Fighter } from "../world/entity";

export interface AttackStart {
  readonly attackId: string;
  readonly chainId: string;
  readonly chainIndex: number;
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

function boundChainId(fighter: Fighter, slot: number): string | null {
  const bindings =
    fighter.locomotion === "airborne"
      ? fighter.attackChains.airborne
      : fighter.attackChains.grounded;
  return bindings[slot] ?? null;
}

/** A fighter can open a new attack only from a neutral, unlocked action. */
function isActionable(fighter: Fighter): boolean {
  return fighter.action.kind === "none" && fighter.hitStopFrames === 0;
}

/**
 * Decides what the fighter's buffered attack request should start this frame,
 * or null when nothing is allowed yet. Buffer expiry is handled by the caller
 * so a consumed request and an expired one stay distinguishable.
 */
export function resolveAttackStart(
  fighter: Fighter,
  library: AttackLibrary,
): AttackStart | null {
  const slot = fighter.bufferedAttackSlot;
  if (
    fighter.attackBufferFrames <= 0 ||
    fighter.hitStopFrames > 0 ||
    slot === null ||
    fighter.locomotion === "downed"
  ) {
    return null;
  }

  const requestedChainId = boundChainId(fighter, slot);
  if (requestedChainId === null) {
    return null;
  }

  if (isActionable(fighter)) {
    const attackId = chainAttackId(library, requestedChainId, 0);
    return attackId === undefined
      ? null
      : { attackId, chainId: requestedChainId, chainIndex: 0 };
  }

  if (fighter.action.kind !== "attack" || fighter.action.attackId === null) {
    return null;
  }

  const current = requireAttack(library, fighter.action.attackId);
  const sameChain = fighter.action.chainId === requestedChainId;
  const nextIndex = sameChain ? fighter.action.chainIndex + 1 : 0;
  const nextId = chainAttackId(library, requestedChainId, nextIndex);

  if (nextId === undefined) {
    return null;
  }

  const next = requireAttack(library, nextId);
  if (!canCancelInto(current, fighter.action.frame, fighter.action.hasConnected, next)) {
    return null;
  }

  return { attackId: nextId, chainId: requestedChainId, chainIndex: nextIndex };
}

export function beginAttack(fighter: Fighter, start: AttackStart): void {
  fighter.action.kind = "attack";
  fighter.action.attackId = start.attackId;
  fighter.action.chainId = start.chainId;
  fighter.action.frame = 0;
  fighter.action.hasConnected = false;
  fighter.action.chainIndex = start.chainIndex;
  fighter.action.hitTargets.clear();
  fighter.state = "attacking";
  fighter.attackBufferFrames = 0;
  fighter.bufferedAttackSlot = null;
}

export function clearAction(fighter: Fighter): void {
  fighter.action.kind = "none";
  fighter.action.attackId = null;
  fighter.action.chainId = null;
  fighter.action.frame = 0;
  fighter.action.hasConnected = false;
  fighter.action.chainIndex = -1;
  fighter.action.hitTargets.clear();
}

export function beginHitstun(fighter: Fighter, frames: number): void {
  fighter.action.kind = "hitstun";
  fighter.action.attackId = null;
  fighter.action.chainId = null;
  fighter.action.frame = 0;
  fighter.action.hasConnected = false;
  fighter.action.chainIndex = frames;
  fighter.action.hitTargets.clear();
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
