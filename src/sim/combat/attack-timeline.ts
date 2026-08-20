import {
  attackDuration,
  type AttackDefinition,
  type AttackTag,
} from "./attack-definition";

export type AttackPhase = "startup" | "active" | "recovery" | "finished";

export function resolveAttackPhase(
  definition: AttackDefinition,
  actionFrame: number,
): AttackPhase {
  if (actionFrame < 0) {
    throw new RangeError("Action frame must not be negative.");
  }

  if (actionFrame < definition.startupFrames) {
    return "startup";
  }

  if (actionFrame < definition.startupFrames + definition.activeFrames) {
    return "active";
  }

  if (actionFrame < attackDuration(definition)) {
    return "recovery";
  }

  return "finished";
}

export function isHitboxLive(
  definition: AttackDefinition,
  actionFrame: number,
): boolean {
  return resolveAttackPhase(definition, actionFrame) === "active";
}

/**
 * A cancel opens on its own frame and stays open for the rest of the attack.
 * `requiresHit` rules stay shut until the attack has connected, which is what
 * makes a whiffed first hit unable to chain into the second.
 */
export function cancelTagsAt(
  definition: AttackDefinition,
  actionFrame: number,
  hasConnected: boolean,
): readonly AttackTag[] {
  const tags = new Set<AttackTag>();

  for (const rule of definition.cancels) {
    if (actionFrame < rule.fromFrame) {
      continue;
    }

    if (rule.requiresHit && !hasConnected) {
      continue;
    }

    for (const tag of rule.into) {
      tags.add(tag);
    }
  }

  return [...tags];
}

export function canCancelInto(
  definition: AttackDefinition,
  actionFrame: number,
  hasConnected: boolean,
  target: AttackDefinition,
): boolean {
  const open = cancelTagsAt(definition, actionFrame, hasConnected);
  return target.tags.some((tag) => open.includes(tag));
}
