import type { EntityId } from "../world/entity";

export type AttackTag = "melee" | "ground" | "air" | "dash" | "launcher" | "finisher";

/**
 * Hitbox geometry only. The frames it is live for come from the attack
 * timeline, so an attack can never disagree with its own active window.
 */
export interface AttackHitboxSpec {
  /** Distance in front of the attacker, along its facing direction. */
  readonly forwardOffset: number;
  readonly radius: number;
  readonly minimumElevation: number;
  readonly maximumElevation: number;
}

export interface CancelRule {
  /** First action frame the cancel is allowed on. */
  readonly fromFrame: number;
  readonly into: readonly AttackTag[];
  /** When true the cancel only opens after this attack connected. */
  readonly requiresHit: boolean;
}

export interface AttackDefinition {
  readonly id: string;
  readonly tags: readonly AttackTag[];
  readonly startupFrames: number;
  readonly activeFrames: number;
  readonly recoveryFrames: number;
  readonly damage: number;
  readonly hitStunFrames: number;
  /** Action-clock freeze applied to attacker and victim on a connect. */
  readonly hitStopFrames: number;
  readonly knockback: number;
  /** Forward lunge applied to the attacker on startup. */
  readonly forwardImpulse: number;
  readonly hitbox: AttackHitboxSpec;
  readonly cancels: readonly CancelRule[];
}

/** Ordered attack ids reachable from one attack button. */
export interface ComboChain {
  readonly id: string;
  readonly attacks: readonly string[];
}

export interface AttackLibrary {
  readonly attacks: Readonly<Record<string, AttackDefinition>>;
  readonly chains: Readonly<Record<string, ComboChain>>;
}

export interface ActiveHitbox {
  readonly attackId: string;
  readonly ownerId: EntityId;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly minimumElevation: number;
  readonly maximumElevation: number;
}

export function attackDuration(definition: AttackDefinition): number {
  return (
    definition.startupFrames + definition.activeFrames + definition.recoveryFrames
  );
}

export function validateAttackDefinition(definition: AttackDefinition): void {
  const frameCounts = [
    definition.startupFrames,
    definition.activeFrames,
    definition.recoveryFrames,
  ];

  if (frameCounts.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new RangeError(
      `Attack '${definition.id}' must use non-negative integer frame counts.`,
    );
  }

  if (definition.activeFrames < 1) {
    throw new RangeError(`Attack '${definition.id}' must stay active for a frame.`);
  }

  if (!Number.isFinite(definition.damage) || definition.damage <= 0) {
    throw new RangeError(`Attack '${definition.id}' must deal positive damage.`);
  }

  if (
    !Number.isInteger(definition.hitStunFrames) ||
    definition.hitStunFrames < 0 ||
    !Number.isInteger(definition.hitStopFrames) ||
    definition.hitStopFrames < 0
  ) {
    throw new RangeError(`Attack '${definition.id}' has invalid stun or stop frames.`);
  }

  const { hitbox } = definition;
  if (!Number.isFinite(hitbox.radius) || hitbox.radius <= 0) {
    throw new RangeError(`Attack '${definition.id}' needs a positive hitbox radius.`);
  }

  if (hitbox.maximumElevation <= hitbox.minimumElevation) {
    throw new RangeError(
      `Attack '${definition.id}' needs a non-empty hitbox elevation interval.`,
    );
  }

  const duration = attackDuration(definition);
  for (const rule of definition.cancels) {
    if (!Number.isInteger(rule.fromFrame) || rule.fromFrame < 0 || rule.fromFrame >= duration) {
      throw new RangeError(
        `Attack '${definition.id}' has a cancel rule outside its ${duration} frame timeline.`,
      );
    }

    if (rule.into.length === 0) {
      throw new RangeError(`Attack '${definition.id}' has a cancel rule with no tags.`);
    }
  }
}
