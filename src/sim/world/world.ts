import type { CommandIntent } from "../input/command-intent";
import {
  clampVectorMagnitude,
  moveVectorToward,
  normalizeOrZero,
  vectorLength,
  ZERO_VECTOR,
  type Vector2,
} from "../math/vector2";
import type { BattleRecipe } from "./battle-recipe";
import type {
  Body,
  EntityId,
  Fighter,
  FighterState,
  WorldPosition,
} from "./entity";

export const SIMULATION_HZ = 60;
const STEP_SECONDS = 1 / SIMULATION_HZ;

export interface BodySnapshot {
  readonly position: Readonly<WorldPosition>;
  readonly velocity: Readonly<Vector2>;
  readonly radius: number;
  readonly bodyHeight: number;
}

export interface FighterSnapshot {
  readonly id: EntityId;
  readonly body: BodySnapshot;
  readonly facing: Readonly<Vector2>;
  readonly state: FighterState;
  readonly maximumSpeed: number;
  readonly dashSpeed: number;
  readonly dashCooldownTicks: number;
  readonly dashSequence: number;
  readonly lockedTargetId: EntityId | null;
}

export interface SimulationSnapshot {
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly arena: {
    readonly center: Readonly<Vector2>;
    readonly radius: number;
  };
  readonly player: FighterSnapshot;
  readonly target: {
    readonly id: EntityId;
    readonly position: Readonly<WorldPosition>;
  };
}

export interface SimulationFrame {
  readonly previous: SimulationSnapshot;
  readonly current: SimulationSnapshot;
}

interface TickCommands {
  readonly dashRequested: boolean;
  readonly lockRequested: boolean;
  readonly move: Vector2;
}

function validateRecipe(recipe: BattleRecipe): void {
  const finiteCoordinates = [
    recipe.arena.center.x,
    recipe.arena.center.y,
    recipe.player.spawn.x,
    recipe.player.spawn.y,
    recipe.player.spawn.elevation,
    recipe.target.position.x,
    recipe.target.position.y,
    recipe.target.position.elevation,
  ];

  if (finiteCoordinates.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Battle positions must use finite coordinates.");
  }

  if (!Number.isFinite(recipe.arena.radius) || recipe.arena.radius <= 0) {
    throw new RangeError("Arena radius must be greater than zero.");
  }

  if (
    !Number.isFinite(recipe.player.radius) ||
    recipe.player.radius <= 0 ||
    recipe.player.radius >= recipe.arena.radius
  ) {
    throw new RangeError("Player radius must fit inside the arena.");
  }

  if (!Number.isFinite(recipe.player.bodyHeight) || recipe.player.bodyHeight <= 0) {
    throw new RangeError("Player body height must be greater than zero.");
  }

  const movement = recipe.player.movement;
  const positiveValues = [
    movement.acceleration,
    movement.deceleration,
    movement.maximumSpeed,
    movement.dashSpeed,
  ];

  if (positiveValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Movement speeds and acceleration must be positive.");
  }

  if (movement.dashSpeed <= movement.maximumSpeed) {
    throw new RangeError("Dash speed must be greater than ordinary movement speed.");
  }

  if (
    !Number.isInteger(movement.dashDurationTicks) ||
    movement.dashDurationTicks < 1 ||
    !Number.isInteger(movement.dashCooldownTicks) ||
    movement.dashCooldownTicks < movement.dashDurationTicks
  ) {
    throw new RangeError("Dash duration and cooldown must be valid tick counts.");
  }

  const spawnDistance = Math.hypot(
    recipe.player.spawn.x - recipe.arena.center.x,
    recipe.player.spawn.y - recipe.arena.center.y,
  );
  if (spawnDistance > recipe.arena.radius - recipe.player.radius) {
    throw new RangeError("Player spawn must keep the entire body inside the arena.");
  }

  const targetDistance = Math.hypot(
    recipe.target.position.x - recipe.arena.center.x,
    recipe.target.position.y - recipe.arena.center.y,
  );
  if (targetDistance > recipe.arena.radius) {
    throw new RangeError("Target position must be inside the arena.");
  }
}

function createBody(recipe: BattleRecipe): Body {
  return {
    position: { ...recipe.player.spawn },
    velocity: { ...ZERO_VECTOR },
    radius: recipe.player.radius,
    bodyHeight: recipe.player.bodyHeight,
  };
}

function copyRecipe(recipe: BattleRecipe): BattleRecipe {
  return {
    arena: {
      center: { ...recipe.arena.center },
      radius: recipe.arena.radius,
    },
    player: {
      id: recipe.player.id,
      spawn: { ...recipe.player.spawn },
      radius: recipe.player.radius,
      bodyHeight: recipe.player.bodyHeight,
      movement: { ...recipe.player.movement },
    },
    target: {
      id: recipe.target.id,
      position: { ...recipe.target.position },
    },
  };
}

function createFighter(recipe: BattleRecipe): Fighter {
  return {
    id: recipe.player.id,
    body: createBody(recipe),
    movement: { ...recipe.player.movement },
    facing: { x: 1, y: 0 },
    dashDirection: { x: 1, y: 0 },
    dashEndExclusiveTick: 0,
    dashReadyTick: 0,
    dashSequence: 0,
    lockedTargetId: null,
    state: "idle",
  };
}

function reduceCommands(
  intents: readonly CommandIntent[],
  fighterId: EntityId,
): TickCommands {
  let dashRequested = false;
  let lockRequested = false;
  let move: Vector2 = { ...ZERO_VECTOR };

  for (const intent of intents) {
    if (intent.fighterId !== fighterId) {
      continue;
    }

    switch (intent.type) {
      case "move":
        move =
          Number.isFinite(intent.direction.x) && Number.isFinite(intent.direction.y)
            ? clampVectorMagnitude(intent.direction)
            : { ...ZERO_VECTOR };
        break;
      case "dash":
        dashRequested = true;
        break;
      case "lock-target":
        lockRequested = true;
        break;
    }
  }

  return { dashRequested, lockRequested, move };
}

function integrateBody(body: Body): void {
  body.position.x += body.velocity.x * STEP_SECONDS;
  body.position.y += body.velocity.y * STEP_SECONDS;
}

function constrainToArena(body: Body, recipe: BattleRecipe): boolean {
  const offsetX = body.position.x - recipe.arena.center.x;
  const offsetY = body.position.y - recipe.arena.center.y;
  const distance = Math.hypot(offsetX, offsetY);
  const maximumDistance = recipe.arena.radius - body.radius;

  if (distance <= maximumDistance) {
    return false;
  }

  const normal = normalizeOrZero({ x: offsetX, y: offsetY });
  body.position.x = recipe.arena.center.x + normal.x * maximumDistance;
  body.position.y = recipe.arena.center.y + normal.y * maximumDistance;

  const outwardSpeed = body.velocity.x * normal.x + body.velocity.y * normal.y;
  if (outwardSpeed > 0) {
    body.velocity.x -= normal.x * outwardSpeed;
    body.velocity.y -= normal.y * outwardSpeed;
  }

  return true;
}

function snapshotFighter(fighter: Fighter, tick: number): FighterSnapshot {
  return {
    id: fighter.id,
    body: {
      position: { ...fighter.body.position },
      velocity: { ...fighter.body.velocity },
      radius: fighter.body.radius,
      bodyHeight: fighter.body.bodyHeight,
    },
    facing: { ...fighter.facing },
    state: fighter.state,
    maximumSpeed: fighter.movement.maximumSpeed,
    dashSpeed: fighter.movement.dashSpeed,
    dashCooldownTicks: Math.max(0, fighter.dashReadyTick - tick),
    dashSequence: fighter.dashSequence,
    lockedTargetId: fighter.lockedTargetId,
  };
}

function freezeSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  Object.freeze(snapshot.arena.center);
  Object.freeze(snapshot.arena);
  Object.freeze(snapshot.player.body.position);
  Object.freeze(snapshot.player.body.velocity);
  Object.freeze(snapshot.player.body);
  Object.freeze(snapshot.player.facing);
  Object.freeze(snapshot.player);
  Object.freeze(snapshot.target.position);
  Object.freeze(snapshot.target);
  return Object.freeze(snapshot);
}

export class SimulationWorld {
  private readonly fighter: Fighter;
  private readonly recipe: BattleRecipe;
  private tick = 0;
  private previousSnapshot: SimulationSnapshot;
  private currentSnapshot: SimulationSnapshot;

  constructor(recipe: BattleRecipe) {
    validateRecipe(recipe);
    this.recipe = copyRecipe(recipe);
    this.fighter = createFighter(this.recipe);
    this.currentSnapshot = this.createSnapshot(0);
    this.previousSnapshot = this.createSnapshot(0);
  }

  step(intents: readonly CommandIntent[] = []): void {
    this.previousSnapshot = this.currentSnapshot;

    const tick = this.tick + 1;
    const commands = reduceCommands(intents, this.fighter.id);
    this.updateLock(commands);
    this.updateMovement(commands, tick);
    integrateBody(this.fighter.body);

    if (constrainToArena(this.fighter.body, this.recipe)) {
      this.fighter.dashEndExclusiveTick = Math.min(
        this.fighter.dashEndExclusiveTick,
        tick + 1,
      );
    }

    this.tick = tick;
    this.currentSnapshot = this.createSnapshot(tick);
  }

  getFrame(): SimulationFrame {
    return {
      previous: this.previousSnapshot,
      current: this.currentSnapshot,
    };
  }

  private updateLock(commands: TickCommands): void {
    if (!commands.lockRequested) {
      return;
    }

    this.fighter.lockedTargetId =
      this.fighter.lockedTargetId === null ? this.recipe.target.id : null;
  }

  private updateMovement(commands: TickCommands, tick: number): void {
    const moveMagnitude = vectorLength(commands.move);
    const hasMoveInput = moveMagnitude > Number.EPSILON;

    if (commands.dashRequested && tick >= this.fighter.dashReadyTick) {
      this.fighter.dashDirection = hasMoveInput
        ? normalizeOrZero(commands.move)
        : { ...this.fighter.facing };
      this.fighter.dashEndExclusiveTick =
        tick + this.fighter.movement.dashDurationTicks;
      this.fighter.dashReadyTick = tick + this.fighter.movement.dashCooldownTicks;
      this.fighter.dashSequence += 1;
    }

    if (tick < this.fighter.dashEndExclusiveTick) {
      this.fighter.facing = { ...this.fighter.dashDirection };
      this.fighter.body.velocity.x =
        this.fighter.dashDirection.x * this.fighter.movement.dashSpeed;
      this.fighter.body.velocity.y =
        this.fighter.dashDirection.y * this.fighter.movement.dashSpeed;
      this.fighter.state = "dashing";
      return;
    }

    if (hasMoveInput) {
      this.fighter.facing = normalizeOrZero(commands.move);
    }

    const targetVelocity = {
      x: commands.move.x * this.fighter.movement.maximumSpeed,
      y: commands.move.y * this.fighter.movement.maximumSpeed,
    };
    const rate = hasMoveInput
      ? this.fighter.movement.acceleration
      : this.fighter.movement.deceleration;
    const velocity = moveVectorToward(
      this.fighter.body.velocity,
      targetVelocity,
      rate * STEP_SECONDS,
    );
    this.fighter.body.velocity.x = velocity.x;
    this.fighter.body.velocity.y = velocity.y;
    this.fighter.state = vectorLength(velocity) > 0.01 ? "moving" : "idle";
  }

  private createSnapshot(tick: number): SimulationSnapshot {
    return freezeSnapshot({
      tick,
      elapsedSeconds: tick / SIMULATION_HZ,
      arena: {
        center: { ...this.recipe.arena.center },
        radius: this.recipe.arena.radius,
      },
      player: snapshotFighter(this.fighter, tick),
      target: {
        id: this.recipe.target.id,
        position: { ...this.recipe.target.position },
      },
    });
  }
}
