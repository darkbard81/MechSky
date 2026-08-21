import type { Fighter } from "../world/entity";

/**
 * The fighter that distance-based attack contexts and Search Dash measure
 * against. Callers pass the candidate roster instead of reading a concrete
 * `enemy` field so multi-enemy scoring can replace the body without moving the
 * contract.
 */
export function resolveCombatTarget(
  fighter: Fighter,
  candidates: readonly Fighter[],
): Fighter | null {
  let fallback: Fighter | null = null;

  for (const candidate of candidates) {
    if (candidate.id === fighter.id || candidate.health <= 0) {
      continue;
    }

    if (candidate.id === fighter.lockedTargetId) {
      return candidate;
    }

    fallback ??= candidate;
  }

  return fallback;
}

/**
 * Planar ground gap. Elevation stays out on purpose: a launched target must not
 * flip from short to long range just by rising.
 */
export function combatTargetDistance(fighter: Fighter, target: Fighter): number {
  return Math.hypot(
    target.body.position.x - fighter.body.position.x,
    target.body.position.y - fighter.body.position.y,
  );
}
