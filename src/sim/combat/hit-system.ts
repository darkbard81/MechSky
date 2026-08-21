import type { ActiveHitbox, AttackLibrary } from "./attack-definition";
import { beginHitstun, requireAttack } from "./attack-system";
import { hitConnects, overlapElevation } from "../collision/hit-detection";
import { SpatialHash } from "../collision/spatial-hash";
import { normalizeOrZero } from "../math/vector2";
import type { Fighter } from "../world/entity";
import type { HitLandedEvent } from "../world/sim-event";

const HURTBOX_CELL_SIZE = 128;

export interface HitResolution {
  readonly events: readonly HitLandedEvent[];
  readonly defeatedIds: readonly number[];
}

/**
 * Candidate lookup goes through the spatial hash, then every candidate runs the
 * exact plane + height test. The grid never decides a hit on its own.
 */
export class HitResolver {
  private readonly hurtboxes = new SpatialHash(HURTBOX_CELL_SIZE);

  resolve(
    attacker: Fighter,
    hitbox: ActiveHitbox | null,
    targets: readonly Fighter[],
    library: AttackLibrary,
  ): HitResolution {
    if (hitbox === null) {
      return { events: [], defeatedIds: [] };
    }

    this.hurtboxes.clear();
    for (const target of targets) {
      // A downed fighter cannot move, act, or wake early, so leaving it
      // hittable would be a free loop with no counterplay.
      if (
        target.id === attacker.id ||
        target.health <= 0 ||
        target.locomotion === "downed"
      ) {
        continue;
      }

      this.hurtboxes.insert({
        id: target.id,
        x: target.body.position.x,
        y: target.body.position.y,
        radius: target.body.radius,
      });
    }

    const candidates = this.hurtboxes.query(hitbox.x, hitbox.y, hitbox.radius);
    if (candidates.length === 0) {
      return { events: [], defeatedIds: [] };
    }

    const definition = requireAttack(library, hitbox.attackId);
    const events: HitLandedEvent[] = [];
    const defeatedIds: number[] = [];

    for (const candidate of candidates) {
      if (attacker.action.hitTargets.has(candidate.id)) {
        continue;
      }

      const target = targets.find((fighter) => fighter.id === candidate.id);
      if (target === undefined) {
        continue;
      }

      const targetBox = {
        x: target.body.position.x,
        y: target.body.position.y,
        radius: target.body.radius,
        minimumElevation: target.body.position.elevation,
        maximumElevation: target.body.position.elevation + target.body.bodyHeight,
      };

      if (!hitConnects(hitbox, targetBox)) {
        continue;
      }

      attacker.action.hitTargets.add(target.id);
      attacker.action.hasConnected = true;
      attacker.comboHits += 1;
      attacker.comboResetFrames = 0;

      target.health = Math.max(0, target.health - definition.damage);

      const push = normalizeOrZero({
        x: target.body.position.x - attacker.body.position.x,
        y: target.body.position.y - attacker.body.position.y,
      });
      const direction =
        push.x === 0 && push.y === 0 ? { ...attacker.facing } : push;
      target.body.velocity.x = direction.x * definition.knockback;
      target.body.velocity.y = direction.y * definition.knockback;
      if (definition.launchVelocity !== 0) {
        target.body.verticalVelocity = definition.launchVelocity;
        target.locomotion = "airborne";
        // A fresh upward launch replaces whatever the previous hit queued,
        // so a slam cannot outlive the combo that set it.
        if (definition.launchVelocity > 0) {
          target.groundSlamPending = false;
        }
      }
      if (definition.groundSlam) {
        target.groundSlamPending = true;
      }

      beginHitstun(target, definition.hitStunFrames);
      target.hitStopFrames = definition.hitStopFrames;
      attacker.hitStopFrames = definition.hitStopFrames;

      events.push({
        type: "hit-landed",
        attackId: definition.id,
        attackerId: attacker.id,
        targetId: target.id,
        damage: definition.damage,
        comboCount: attacker.comboHits,
        remainingHealth: target.health,
        x: (hitbox.x + target.body.position.x) / 2,
        y: (hitbox.y + target.body.position.y) / 2,
        elevation: overlapElevation(hitbox, targetBox),
        severity: definition.damage / 100,
      });

      if (target.health === 0) {
        defeatedIds.push(target.id);
      }
    }

    return { events, defeatedIds };
  }
}
