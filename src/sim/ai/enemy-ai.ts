import type { CommandIntent } from "../input/command-intent";
import { normalizeOrZero, vectorLength, type Vector2 } from "../math/vector2";
import { SeededPrng } from "../math/seeded-prng";
import type { EntityId } from "../world/entity";
import type { FighterSnapshot, SimulationSnapshot } from "../world/world";

/** Cap on how hard spacing pulls straight toward or away from the target. */
const MAXIMUM_RADIAL_CORRECTION = 0.34;
/** Sideways weight that turns spacing into a circle-strafe instead of a shuffle. */
const ORBIT_TANGENT_WEIGHT = 0.42;

export type EnemyAiState =
  | "observing"
  | "approaching"
  | "spacing"
  | "attacking"
  | "evading"
  | "recovering";

export interface EnemyAiRecipe {
  readonly reactionDelayFrames: number;
  readonly hitRecoveryFrames: number;
  readonly attackCooldownFrames: number;
  readonly evadeCooldownFrames: number;
  readonly evadeDurationFrames: number;
  readonly minimumRange: number;
  readonly preferredRange: number;
  readonly maximumRange: number;
  readonly evadeTriggerRange: number;
  readonly aimErrorRadians: number;
}

export function validateEnemyAiRecipe(recipe: EnemyAiRecipe): void {
  const frameValues = [
    recipe.reactionDelayFrames,
    recipe.hitRecoveryFrames,
    recipe.attackCooldownFrames,
    recipe.evadeCooldownFrames,
    recipe.evadeDurationFrames,
  ];

  if (frameValues.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new RangeError("Enemy AI timing values must be positive frame counts.");
  }

  if (
    !Number.isFinite(recipe.minimumRange) ||
    !Number.isFinite(recipe.preferredRange) ||
    !Number.isFinite(recipe.maximumRange) ||
    recipe.minimumRange <= 0 ||
    recipe.minimumRange >= recipe.preferredRange ||
    recipe.preferredRange >= recipe.maximumRange
  ) {
    throw new RangeError("Enemy AI ranges must be positive and strictly increasing.");
  }

  if (
    !Number.isFinite(recipe.evadeTriggerRange) ||
    recipe.evadeTriggerRange <= recipe.minimumRange
  ) {
    throw new RangeError("Enemy AI evade range must exceed its minimum range.");
  }

  if (
    !Number.isFinite(recipe.aimErrorRadians) ||
    recipe.aimErrorRadians < 0 ||
    recipe.aimErrorRadians > Math.PI / 3
  ) {
    throw new RangeError("Enemy AI aim error must be between zero and PI / 3 radians.");
  }
}

function fighterById(
  snapshot: SimulationSnapshot,
  id: EntityId,
): FighterSnapshot {
  if (snapshot.player.id === id) {
    return snapshot.player;
  }

  if (snapshot.enemy.id === id) {
    return snapshot.enemy;
  }

  throw new RangeError(`Snapshot has no fighter with id ${id}.`);
}

function rotate(direction: Readonly<Vector2>, radians: number): Vector2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: direction.x * cosine - direction.y * sine,
    y: direction.x * sine + direction.y * cosine,
  };
}

/** Produces the same CommandIntent contract as the keyboard/gamepad adapter. */
export class EnemyAiController {
  private random: SeededPrng;
  private readonly moveDirection: Vector2 = { x: 0, y: 0 };
  private nextDecisionTick: number;
  private attackReadyTick = 0;
  private evadeReadyTick = 0;
  private evadeEndTick = 0;
  private recoveryEndTick = 0;
  private recoveringFromHit = false;
  private currentState: EnemyAiState = "observing";

  constructor(
    private readonly fighterId: EntityId,
    private readonly targetId: EntityId,
    private readonly recipe: EnemyAiRecipe,
    seed: number,
  ) {
    validateEnemyAiRecipe(recipe);

    if (fighterId === targetId) {
      throw new RangeError("Enemy AI cannot target the fighter it drives.");
    }

    this.random = new SeededPrng(seed);
    this.nextDecisionTick = recipe.reactionDelayFrames;
  }

  get state(): EnemyAiState {
    return this.currentState;
  }

  decide(snapshot: SimulationSnapshot): readonly CommandIntent[] {
    const self = fighterById(snapshot, this.fighterId);
    const target = fighterById(snapshot, this.targetId);
    const tick = snapshot.tick;

    if (self.health === 0 || target.health === 0) {
      this.stop("observing");
      return this.moveOnly();
    }

    if (
      self.actionKind === "hitstun" ||
      self.locomotion === "downed" ||
      self.locomotion === "airborne"
    ) {
      this.recoveringFromHit = true;
      this.recoveryEndTick = tick + this.recipe.hitRecoveryFrames;
      this.stop("recovering");
      return this.moveOnly();
    }

    if (this.recoveringFromHit) {
      if (tick < this.recoveryEndTick) {
        this.stop("recovering");
        return this.moveOnly();
      }
      this.recoveringFromHit = false;
      this.nextDecisionTick = tick;
    }

    if (self.actionKind === "attack") {
      this.stop("attacking");
      return this.moveOnly();
    }

    if (tick < this.evadeEndTick) {
      this.currentState = "evading";
      return this.moveOnly();
    }

    if (tick < this.nextDecisionTick) {
      return this.moveOnly();
    }

    this.nextDecisionTick = tick + this.recipe.reactionDelayFrames;
    const toTarget = {
      x: target.body.position.x - self.body.position.x,
      y: target.body.position.y - self.body.position.y,
    };
    const distance = vectorLength(toTarget);
    const direction = normalizeOrZero(toTarget);

    if (
      target.actionKind === "attack" &&
      target.locomotion === "grounded" &&
      distance <= this.recipe.evadeTriggerRange &&
      tick >= this.evadeReadyTick
    ) {
      this.setMove(rotate({ x: -direction.x, y: -direction.y }, this.aimError()));
      this.currentState = "evading";
      this.evadeEndTick = tick + this.recipe.evadeDurationFrames;
      this.evadeReadyTick = tick + this.recipe.evadeCooldownFrames;
      return [
        ...this.moveOnly(),
        { type: "dash", fighterId: this.fighterId },
      ];
    }

    if (distance > this.recipe.maximumRange) {
      this.setMove(rotate(direction, this.aimError()));
      this.currentState = "approaching";
      return this.moveOnly();
    }

    if (distance < this.recipe.minimumRange) {
      this.setMove(rotate({ x: -direction.x, y: -direction.y }, this.aimError()));
      this.currentState = "spacing";
      return this.moveOnly();
    }

    if (tick >= this.attackReadyTick && target.locomotion === "grounded") {
      this.setMove(rotate(direction, this.aimError()));
      this.currentState = "attacking";
      this.attackReadyTick = tick + this.recipe.attackCooldownFrames;
      return [
        ...this.moveOnly(),
        { type: "attack", fighterId: this.fighterId, slot: 0 },
      ];
    }

    const tangentSign = this.random.nextSigned() < 0 ? -1 : 1;
    const radialCorrection = Math.min(
      MAXIMUM_RADIAL_CORRECTION,
      Math.max(
        -MAXIMUM_RADIAL_CORRECTION,
        (distance - this.recipe.preferredRange) /
          (this.recipe.maximumRange - this.recipe.minimumRange),
      ),
    );
    this.setMove({
      x:
        direction.x * radialCorrection -
        direction.y * tangentSign * ORBIT_TANGENT_WEIGHT,
      y:
        direction.y * radialCorrection +
        direction.x * tangentSign * ORBIT_TANGENT_WEIGHT,
    });
    this.currentState = "spacing";
    return this.moveOnly();
  }

  reset(seed: number): void {
    this.random = new SeededPrng(seed);
    this.moveDirection.x = 0;
    this.moveDirection.y = 0;
    this.nextDecisionTick = this.recipe.reactionDelayFrames;
    this.attackReadyTick = 0;
    this.evadeReadyTick = 0;
    this.evadeEndTick = 0;
    this.recoveryEndTick = 0;
    this.recoveringFromHit = false;
    this.currentState = "observing";
  }

  private aimError(): number {
    return this.random.nextSigned() * this.recipe.aimErrorRadians;
  }

  private setMove(direction: Readonly<Vector2>): void {
    this.moveDirection.x = direction.x;
    this.moveDirection.y = direction.y;
  }

  private stop(state: EnemyAiState): void {
    this.moveDirection.x = 0;
    this.moveDirection.y = 0;
    this.currentState = state;
  }

  private moveOnly(): readonly CommandIntent[] {
    return [
      {
        type: "move",
        fighterId: this.fighterId,
        direction: { ...this.moveDirection },
      },
    ];
  }
}
