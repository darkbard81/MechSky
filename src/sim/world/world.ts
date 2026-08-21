import type { ActiveHitbox, AttackLibrary } from "../combat/attack-definition";
import { validateEnemyAiRecipe } from "../ai/enemy-ai";
import { attackDuration } from "../combat/attack-definition";
import {
  advanceAction,
  beginAttack,
  clearAction,
  currentHitbox,
  requireAttack,
  resolveAttackStart,
} from "../combat/attack-system";
import { HitResolver } from "../combat/hit-system";
import {
  cancelTagsAt,
  resolveAttackPhase,
  type AttackPhase,
} from "../combat/attack-timeline";
import type { CommandIntent } from "../input/command-intent";
import {
  clampVectorMagnitude,
  moveVectorToward,
  normalizeOrZero,
  vectorLength,
  ZERO_VECTOR,
  type Vector2,
} from "../math/vector2";
import type { BattleRecipe, FighterRecipe } from "./battle-recipe";
import {
  createIdleAction,
  type ActionKind,
  type Body,
  type EntityId,
  type Fighter,
  type FighterState,
  type LocomotionState,
  type WorldPosition,
} from "./entity";
import type { SimEvent } from "./sim-event";

export const SIMULATION_HZ = 60;
const STEP_SECONDS = 1 / SIMULATION_HZ;

export type BattleOutcome = "ongoing" | "victory" | "defeat";

export interface BodySnapshot {
  readonly position: Readonly<WorldPosition>;
  readonly velocity: Readonly<Vector2>;
  readonly verticalVelocity: number;
  readonly radius: number;
  readonly bodyHeight: number;
}

export interface FighterSnapshot {
  readonly id: EntityId;
  readonly body: BodySnapshot;
  readonly facing: Readonly<Vector2>;
  readonly locomotion: LocomotionState;
  readonly state: FighterState;
  readonly health: number;
  readonly maximumHealth: number;
  readonly actionKind: ActionKind;
  readonly attackId: string | null;
  readonly actionFrame: number;
  readonly actionDuration: number;
  readonly attackPhase: AttackPhase | null;
  readonly hitStopFrames: number;
  readonly comboHits: number;
  readonly maximumSpeed: number;
  readonly dashSpeed: number;
  readonly dashDurationTicks: number;
  readonly dashCooldownDurationTicks: number;
  readonly dashCooldownTicks: number;
  readonly dashSequence: number;
  readonly lockedTargetId: EntityId | null;
  readonly homingTargetId: EntityId | null;
  readonly groundSlamPending: boolean;
  readonly downedFrames: number;
  readonly downedDurationFrames: number;
}

export interface SimulationSnapshot {
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly battleOutcome: BattleOutcome;
  readonly inputLocked: boolean;
  readonly arena: {
    readonly center: Readonly<Vector2>;
    readonly radius: number;
  };
  readonly player: FighterSnapshot;
  readonly enemy: FighterSnapshot;
  /** Live attack hitboxes this frame, for debug overlays only. */
  readonly hitboxes: readonly Readonly<ActiveHitbox>[];
}

export interface SimulationFrame {
  readonly previous: SimulationSnapshot;
  readonly current: SimulationSnapshot;
}

interface TickCommands {
  readonly attackSlot: number | null;
  readonly dashRequested: boolean;
  readonly lockRequested: boolean;
  readonly move: Vector2;
}

function validateFighterRecipe(recipe: FighterRecipe, label: string, arenaRadius: number): void {
  const coordinates = [recipe.spawn.x, recipe.spawn.y, recipe.spawn.elevation];

  if (coordinates.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`${label} spawn must use finite coordinates.`);
  }

  if (recipe.spawn.elevation < 0) {
    throw new RangeError(`${label} spawn elevation must not be negative.`);
  }

  if (!Number.isFinite(recipe.radius) || recipe.radius <= 0 || recipe.radius >= arenaRadius) {
    throw new RangeError(`${label} radius must fit inside the arena.`);
  }

  if (!Number.isFinite(recipe.bodyHeight) || recipe.bodyHeight <= 0) {
    throw new RangeError(`${label} body height must be greater than zero.`);
  }

  if (!Number.isFinite(recipe.health) || recipe.health <= 0) {
    throw new RangeError(`${label} health must be greater than zero.`);
  }

  const movement = recipe.movement;
  const positiveValues = [
    movement.acceleration,
    movement.deceleration,
    movement.maximumSpeed,
    movement.dashSpeed,
  ];

  if (positiveValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError(`${label} movement speeds and acceleration must be positive.`);
  }

  if (movement.dashSpeed <= movement.maximumSpeed) {
    throw new RangeError(`${label} dash speed must exceed ordinary movement speed.`);
  }

  if (
    !Number.isInteger(movement.dashDurationTicks) ||
    movement.dashDurationTicks < 1 ||
    !Number.isInteger(movement.dashCooldownTicks) ||
    movement.dashCooldownTicks < movement.dashDurationTicks
  ) {
    throw new RangeError(`${label} dash duration and cooldown must be valid tick counts.`);
  }
}

function validateRecipe(recipe: BattleRecipe): void {
  if (!Number.isInteger(recipe.seed) || recipe.seed < 1 || recipe.seed > 0xffff_ffff) {
    throw new RangeError("Battle seed must be an unsigned non-zero 32-bit integer.");
  }

  validateEnemyAiRecipe(recipe.enemyAi);

  if (!Number.isFinite(recipe.arena.center.x) || !Number.isFinite(recipe.arena.center.y)) {
    throw new RangeError("Arena center must use finite coordinates.");
  }

  if (!Number.isFinite(recipe.arena.radius) || recipe.arena.radius <= 0) {
    throw new RangeError("Arena radius must be greater than zero.");
  }

  validateFighterRecipe(recipe.player, "Player", recipe.arena.radius);
  validateFighterRecipe(recipe.enemy, "Enemy", recipe.arena.radius);

  if (recipe.player.id === recipe.enemy.id) {
    throw new RangeError("Player and enemy must use distinct entity ids.");
  }

  for (const fighter of [recipe.player, recipe.enemy]) {
    const distance = Math.hypot(
      fighter.spawn.x - recipe.arena.center.x,
      fighter.spawn.y - recipe.arena.center.y,
    );

    if (distance > recipe.arena.radius - fighter.radius) {
      throw new RangeError("Every spawn must keep the whole body inside the arena.");
    }
  }

  const combat = recipe.combat;
  if (
    !Number.isInteger(combat.inputBufferFrames) ||
    combat.inputBufferFrames < 0 ||
    !Number.isInteger(combat.comboResetFrames) ||
    combat.comboResetFrames < 1
  ) {
    throw new RangeError("Combat buffer and combo reset windows must be valid frame counts.");
  }

  const positiveCombatValues = [
    combat.gravity,
    combat.maximumFallSpeed,
    combat.homingSpeed,
    combat.homingVerticalSpeed,
  ];
  if (positiveCombatValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Combat gravity, fall speed, and homing speeds must be positive.");
  }

  if (
    !Number.isInteger(combat.homingDurationTicks) ||
    combat.homingDurationTicks < 1 ||
    !Number.isInteger(combat.downedFrames) ||
    combat.downedFrames < 1
  ) {
    throw new RangeError("Homing duration and knockdown duration must be valid tick counts.");
  }

  for (const chain of Object.values(combat.library.chains)) {
    for (const attackId of chain.attacks) {
      requireAttack(combat.library, attackId);
    }
  }

  for (const fighter of [recipe.player, recipe.enemy]) {
    for (const chainId of [
      ...fighter.attackChains.grounded,
      ...fighter.attackChains.airborne,
    ]) {
      if (chainId !== null && combat.library.chains[chainId] === undefined) {
        throw new RangeError(`Attack chain '${chainId}' is not in the attack library.`);
      }
    }
  }
}

function copyFighterRecipe(recipe: FighterRecipe): FighterRecipe {
  return {
    id: recipe.id,
    spawn: { ...recipe.spawn },
    radius: recipe.radius,
    bodyHeight: recipe.bodyHeight,
    health: recipe.health,
    attackChains: {
      grounded: [...recipe.attackChains.grounded],
      airborne: [...recipe.attackChains.airborne],
    },
    movement: { ...recipe.movement },
  };
}

function copyRecipe(recipe: BattleRecipe): BattleRecipe {
  return {
    seed: recipe.seed,
    arena: {
      center: { ...recipe.arena.center },
      radius: recipe.arena.radius,
    },
    player: copyFighterRecipe(recipe.player),
    enemy: copyFighterRecipe(recipe.enemy),
    enemyAi: { ...recipe.enemyAi },
    combat: { ...recipe.combat },
  };
}

function createBody(recipe: FighterRecipe): Body {
  return {
    position: { ...recipe.spawn },
    velocity: { ...ZERO_VECTOR },
    verticalVelocity: 0,
    radius: recipe.radius,
    bodyHeight: recipe.bodyHeight,
  };
}

function createFighter(recipe: FighterRecipe, facing: Vector2): Fighter {
  return {
    id: recipe.id,
    body: createBody(recipe),
    movement: { ...recipe.movement },
    maximumHealth: recipe.health,
    health: recipe.health,
    facing: { ...facing },
    dashDirection: { ...facing },
    dashEndExclusiveTick: 0,
    dashReadyTick: 0,
    dashSequence: 0,
    lockedTargetId: null,
    locomotion: recipe.spawn.elevation > 0 ? "airborne" : "grounded",
    state: "idle",
    action: createIdleAction(),
    hitStopFrames: 0,
    attackBufferFrames: 0,
    bufferedAttackSlot: null,
    comboHits: 0,
    comboResetFrames: 0,
    attackChains: {
      grounded: [...recipe.attackChains.grounded],
      airborne: [...recipe.attackChains.airborne],
    },
    homingTargetId: null,
    homingEndExclusiveTick: 0,
    groundSlamPending: false,
    downedFrames: 0,
  };
}

function reduceCommands(
  intents: readonly CommandIntent[],
  fighterId: EntityId,
): TickCommands {
  let attackSlot: number | null = null;
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
      case "attack":
        if (Number.isInteger(intent.slot) && intent.slot >= 0) {
          attackSlot = intent.slot;
        }
        break;
      case "lock-target":
        lockRequested = true;
        break;
    }
  }

  return { attackSlot, dashRequested, lockRequested, move };
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

function decelerate(fighter: Fighter, rate: number): void {
  const velocity = moveVectorToward(
    fighter.body.velocity,
    ZERO_VECTOR,
    rate * STEP_SECONDS,
  );
  fighter.body.velocity.x = velocity.x;
  fighter.body.velocity.y = velocity.y;
}

export class SimulationWorld {
  private readonly player: Fighter;
  private readonly enemy: Fighter;
  private readonly recipe: BattleRecipe;
  private readonly library: AttackLibrary;
  private readonly hits = new HitResolver();
  private events: SimEvent[] = [];
  private tick = 0;
  private battleOutcome: BattleOutcome = "ongoing";
  private battleEnding: Exclude<BattleOutcome, "ongoing"> | null = null;
  private previousSnapshot: SimulationSnapshot;
  private currentSnapshot: SimulationSnapshot;

  constructor(recipe: BattleRecipe) {
    validateRecipe(recipe);
    this.recipe = copyRecipe(recipe);
    this.library = this.recipe.combat.library;

    const toEnemy = normalizeOrZero({
      x: this.recipe.enemy.spawn.x - this.recipe.player.spawn.x,
      y: this.recipe.enemy.spawn.y - this.recipe.player.spawn.y,
    });
    this.player = createFighter(this.recipe.player, toEnemy.x === 0 && toEnemy.y === 0 ? { x: 1, y: 0 } : toEnemy);
    this.enemy = createFighter(this.recipe.enemy, { x: -toEnemy.x, y: -toEnemy.y });

    this.currentSnapshot = this.createSnapshot(0);
    this.previousSnapshot = this.createSnapshot(0);
  }

  step(intents: readonly CommandIntent[] = []): void {
    if (this.battleOutcome !== "ongoing") {
      return;
    }

    this.previousSnapshot = this.currentSnapshot;

    const tick = this.tick + 1;
    const activeIntents = this.battleEnding === null ? intents : [];
    const playerCommands = reduceCommands(activeIntents, this.player.id);
    const enemyCommands = reduceCommands(activeIntents, this.enemy.id);

    this.updateDownedFighters();
    this.updateAttackBuffer(this.player, playerCommands);
    this.updateAttackBuffer(this.enemy, enemyCommands);
    this.updateLock(this.player, this.enemy, playerCommands);
    this.updateLock(this.enemy, this.player, enemyCommands);
    this.applyCommandFacing(this.player, playerCommands);
    this.applyCommandFacing(this.enemy, enemyCommands);
    this.startBufferedAttack(this.player, this.enemy);
    this.startBufferedAttack(this.enemy, this.player);
    this.updateMovement(this.player, this.enemy, playerCommands, tick);
    this.updateMovement(this.enemy, this.player, enemyCommands, tick);
    this.moveFighters();
    this.resolveHits();
    this.advanceActions();
    this.updateCombo(this.player);
    this.updateCombo(this.enemy);

    this.tick = tick;
    this.battleEnding ??=
      this.player.health === 0
        ? "defeat"
        : this.enemy.health === 0
          ? "victory"
          : null;
    if (
      (this.battleEnding === "victory" && this.enemy.locomotion === "downed") ||
      (this.battleEnding === "defeat" && this.player.locomotion === "downed")
    ) {
      this.battleOutcome = this.battleEnding;
    }
    this.currentSnapshot = this.createSnapshot(tick);
  }

  getFrame(): SimulationFrame {
    return {
      previous: this.previousSnapshot,
      current: this.currentSnapshot,
    };
  }

  /** Events produced since the last drain. Renderer and UI consume these. */
  drainEvents(): readonly SimEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  private updateAttackBuffer(fighter: Fighter, commands: TickCommands): void {
    if (commands.attackSlot !== null) {
      fighter.attackBufferFrames = this.recipe.combat.inputBufferFrames;
      fighter.bufferedAttackSlot = commands.attackSlot;
      return;
    }

    if (fighter.attackBufferFrames > 0) {
      fighter.attackBufferFrames -= 1;
      if (fighter.attackBufferFrames === 0) {
        fighter.bufferedAttackSlot = null;
      }
    }
  }

  private updateLock(
    fighter: Fighter,
    target: Fighter,
    commands: TickCommands,
  ): void {
    if (!commands.lockRequested) {
      return;
    }

    fighter.lockedTargetId = fighter.lockedTargetId === null ? target.id : null;
  }

  private applyCommandFacing(fighter: Fighter, commands: TickCommands): void {
    if (
      fighter.action.kind !== "none" ||
      fighter.locomotion !== "grounded" ||
      vectorLength(commands.move) <= Number.EPSILON
    ) {
      return;
    }

    fighter.facing = normalizeOrZero(commands.move);
  }

  private startBufferedAttack(fighter: Fighter, target: Fighter): void {
    const start = resolveAttackStart(fighter, this.library);

    if (start === null) {
      return;
    }

    const definition = requireAttack(this.library, start.attackId);
    beginAttack(fighter, start);

    fighter.homingTargetId = null;
    fighter.homingEndExclusiveTick = 0;

    if (fighter.lockedTargetId === target.id) {
      const toTarget = normalizeOrZero({
        x: target.body.position.x - fighter.body.position.x,
        y: target.body.position.y - fighter.body.position.y,
      });
      if (toTarget.x !== 0 || toTarget.y !== 0) {
        fighter.facing = toTarget;
      }
    }

    fighter.body.velocity.x = fighter.facing.x * definition.forwardImpulse;
    fighter.body.velocity.y = fighter.facing.y * definition.forwardImpulse;
    if (definition.selfVerticalVelocity !== 0) {
      fighter.body.verticalVelocity = definition.selfVerticalVelocity;
      fighter.locomotion = "airborne";
    }

    this.events.push({
      type: "attack-started",
      attackId: definition.id,
      attackerId: fighter.id,
      chainIndex: start.chainIndex,
    });
  }

  private updateMovement(
    fighter: Fighter,
    target: Fighter,
    commands: TickCommands,
    tick: number,
  ): void {
    if (fighter.locomotion === "downed") {
      fighter.state = "downed";
      return;
    }

    if (fighter.hitStopFrames > 0) {
      return;
    }

    if (commands.dashRequested && tick >= fighter.dashReadyTick) {
      if (this.canStartHomingChase(fighter, target)) {
        this.beginHomingChase(fighter, target, tick);
      } else if (
        fighter.action.kind === "none" &&
        fighter.locomotion === "grounded"
      ) {
        this.beginGroundDash(fighter, commands.move, tick);
      }
    }

    if (fighter.homingTargetId !== null) {
      if (tick < fighter.homingEndExclusiveTick) {
        this.updateHomingChase(fighter, target);
        return;
      }
      fighter.homingTargetId = null;
    }

    if (fighter.action.kind === "hitstun") {
      decelerate(fighter, this.recipe.combat.hitstunFriction);
      return;
    }

    if (fighter.action.kind === "attack") {
      decelerate(fighter, fighter.movement.deceleration);
      return;
    }

    const moveMagnitude = vectorLength(commands.move);
    const hasMoveInput = moveMagnitude > Number.EPSILON;

    if (tick < fighter.dashEndExclusiveTick) {
      fighter.facing = { ...fighter.dashDirection };
      fighter.body.velocity.x = fighter.dashDirection.x * fighter.movement.dashSpeed;
      fighter.body.velocity.y = fighter.dashDirection.y * fighter.movement.dashSpeed;
      fighter.state = "dashing";
      return;
    }

    if (fighter.locomotion === "airborne") {
      decelerate(fighter, fighter.movement.deceleration);
      fighter.state = "idle";
      return;
    }

    if (hasMoveInput) {
      fighter.facing = normalizeOrZero(commands.move);
    }

    const targetVelocity = {
      x: commands.move.x * fighter.movement.maximumSpeed,
      y: commands.move.y * fighter.movement.maximumSpeed,
    };
    const rate = hasMoveInput
      ? fighter.movement.acceleration
      : fighter.movement.deceleration;
    const velocity = moveVectorToward(
      fighter.body.velocity,
      targetVelocity,
      rate * STEP_SECONDS,
    );
    fighter.body.velocity.x = velocity.x;
    fighter.body.velocity.y = velocity.y;
    fighter.state = vectorLength(velocity) > 0.01 ? "moving" : "idle";
  }

  private beginGroundDash(
    fighter: Fighter,
    move: Readonly<Vector2>,
    tick: number,
  ): void {
    const hasMoveInput = vectorLength(move) > Number.EPSILON;
    fighter.dashDirection = hasMoveInput
      ? normalizeOrZero(move)
      : { ...fighter.facing };
    fighter.dashEndExclusiveTick = tick + fighter.movement.dashDurationTicks;
    fighter.dashReadyTick = tick + fighter.movement.dashCooldownTicks;
    fighter.dashSequence += 1;
  }

  private canStartHomingChase(fighter: Fighter, target: Fighter): boolean {
    if (
      target.locomotion !== "airborne" ||
      target.health === 0 ||
      fighter.action.kind === "hitstun"
    ) {
      return false;
    }

    if (fighter.action.kind === "none") {
      return true;
    }

    if (fighter.action.attackId === null) {
      return false;
    }

    const definition = requireAttack(this.library, fighter.action.attackId);
    return cancelTagsAt(
      definition,
      fighter.action.frame,
      fighter.action.hasConnected,
    ).includes("dash");
  }

  private beginHomingChase(
    fighter: Fighter,
    target: Fighter,
    tick: number,
  ): void {
    if (fighter.action.kind === "attack") {
      clearAction(fighter);
    }

    fighter.lockedTargetId = target.id;
    fighter.homingTargetId = target.id;
    fighter.homingEndExclusiveTick = tick + this.recipe.combat.homingDurationTicks;
    fighter.dashEndExclusiveTick = 0;
    fighter.dashReadyTick = tick + fighter.movement.dashCooldownTicks;
    fighter.dashSequence += 1;
    fighter.locomotion = "airborne";
    fighter.state = "dashing";
    this.updateHomingChase(fighter, target);

    this.events.push({
      type: "homing-started",
      fighterId: fighter.id,
      targetId: target.id,
    });
  }

  private updateHomingChase(fighter: Fighter, target: Fighter): void {
    const toTarget = {
      x: target.body.position.x - fighter.body.position.x,
      y: target.body.position.y - fighter.body.position.y,
    };
    const direction = normalizeOrZero(toTarget);
    const distance = vectorLength(toTarget);
    const planarSpeed = distance > 92 ? this.recipe.combat.homingSpeed : 0;

    if (direction.x !== 0 || direction.y !== 0) {
      fighter.facing = direction;
    }
    fighter.body.velocity.x = direction.x * planarSpeed;
    fighter.body.velocity.y = direction.y * planarSpeed;

    const elevationError =
      target.body.position.elevation + target.body.bodyHeight * 0.12 -
      fighter.body.position.elevation;
    fighter.body.verticalVelocity = Math.min(
      this.recipe.combat.homingVerticalSpeed,
      Math.max(-this.recipe.combat.homingVerticalSpeed, elevationError * 10),
    );
    fighter.state = "dashing";
  }

  private moveFighters(): void {
    for (const fighter of [this.player, this.enemy]) {
      if (fighter.hitStopFrames > 0) {
        continue;
      }

      integrateBody(fighter.body);
      this.integrateElevation(fighter);

      if (constrainToArena(fighter.body, this.recipe)) {
        fighter.dashEndExclusiveTick = Math.min(
          fighter.dashEndExclusiveTick,
          this.tick + 2,
        );
      }
    }
  }

  private integrateElevation(fighter: Fighter): void {
    if (fighter.locomotion !== "airborne") {
      return;
    }

    fighter.body.verticalVelocity = Math.max(
      -this.recipe.combat.maximumFallSpeed,
      fighter.body.verticalVelocity - this.recipe.combat.gravity * STEP_SECONDS,
    );
    fighter.body.position.elevation += fighter.body.verticalVelocity * STEP_SECONDS;

    if (fighter.body.position.elevation > 0) {
      return;
    }

    const impactSpeed = Math.abs(fighter.body.verticalVelocity);
    fighter.body.position.elevation = 0;
    fighter.body.verticalVelocity = 0;
    fighter.homingTargetId = null;
    fighter.homingEndExclusiveTick = 0;

    if (fighter.groundSlamPending || fighter.health === 0) {
      this.enterKnockdown(fighter, impactSpeed);
      return;
    }

    fighter.locomotion = "grounded";
    if (fighter.action.kind === "none") {
      fighter.state = "idle";
    }
    this.events.push({
      type: "fighter-landed",
      fighterId: fighter.id,
      x: fighter.body.position.x,
      y: fighter.body.position.y,
      impactSpeed,
    });
  }

  private enterKnockdown(fighter: Fighter, impactSpeed: number): void {
    fighter.groundSlamPending = false;
    fighter.locomotion = "downed";
    fighter.downedFrames = this.recipe.combat.downedFrames;
    fighter.state = "downed";
    fighter.body.velocity.x = 0;
    fighter.body.velocity.y = 0;
    clearAction(fighter);

    this.events.push({
      type: "ground-impact",
      fighterId: fighter.id,
      x: fighter.body.position.x,
      y: fighter.body.position.y,
      impactSpeed,
      severity: Math.min(2, impactSpeed / 600),
    });
  }

  private updateDownedFighters(): void {
    for (const fighter of [this.player, this.enemy]) {
      if (fighter.locomotion !== "downed") {
        continue;
      }

      fighter.state = "downed";
      if (fighter.health === 0) {
        continue;
      }

      fighter.downedFrames = Math.max(0, fighter.downedFrames - 1);
      if (fighter.downedFrames > 0) {
        continue;
      }

      fighter.locomotion = "grounded";
      fighter.state = "idle";
      this.events.push({ type: "fighter-woke-up", fighterId: fighter.id });
    }
  }

  private resolveHits(): void {
    this.resolveFighterHit(this.player, this.enemy);
    this.resolveFighterHit(this.enemy, this.player);
  }

  private resolveFighterHit(attacker: Fighter, target: Fighter): void {
    if (attacker.health === 0) {
      return;
    }

    const hitbox = currentHitbox(attacker, this.library);
    const resolution = this.hits.resolve(attacker, hitbox, [target], this.library);

    for (const event of resolution.events) {
      this.events.push(event);
    }

    for (const targetId of resolution.defeatedIds) {
      this.events.push({ type: "target-defeated", targetId });
    }
  }

  private advanceActions(): void {
    for (const fighter of [this.player, this.enemy]) {
      const advance = advanceAction(fighter, this.library);

      if (advance.attackFinished && !advance.attackConnected && advance.finishedAttackId !== null) {
        this.events.push({
          type: "attack-whiffed",
          attackId: advance.finishedAttackId,
          attackerId: fighter.id,
        });
      }

      if (
        fighter.health === 0 &&
        fighter.locomotion === "grounded"
      ) {
        this.enterKnockdown(fighter, 0);
      }
    }
  }

  private updateCombo(fighter: Fighter): void {
    if (fighter.comboHits === 0) {
      return;
    }

    fighter.comboResetFrames += 1;

    if (fighter.comboResetFrames >= this.recipe.combat.comboResetFrames) {
      this.events.push({
        type: "combo-ended",
        attackerId: fighter.id,
        hits: fighter.comboHits,
      });
      fighter.comboHits = 0;
      fighter.comboResetFrames = 0;
    }
  }

  private snapshotFighter(fighter: Fighter, tick: number): FighterSnapshot {
    const definition =
      fighter.action.kind === "attack" && fighter.action.attackId !== null
        ? requireAttack(this.library, fighter.action.attackId)
        : null;

    return {
      id: fighter.id,
      body: {
        position: { ...fighter.body.position },
        velocity: { ...fighter.body.velocity },
        verticalVelocity: fighter.body.verticalVelocity,
        radius: fighter.body.radius,
        bodyHeight: fighter.body.bodyHeight,
      },
      facing: { ...fighter.facing },
      locomotion: fighter.locomotion,
      state: fighter.state,
      health: fighter.health,
      maximumHealth: fighter.maximumHealth,
      actionKind: fighter.action.kind,
      attackId: fighter.action.attackId,
      actionFrame: fighter.action.frame,
      actionDuration: definition === null ? 0 : attackDuration(definition),
      attackPhase:
        definition === null ? null : resolveAttackPhase(definition, fighter.action.frame),
      hitStopFrames: fighter.hitStopFrames,
      comboHits: fighter.comboHits,
      maximumSpeed: fighter.movement.maximumSpeed,
      dashSpeed: fighter.movement.dashSpeed,
      dashDurationTicks: fighter.movement.dashDurationTicks,
      dashCooldownDurationTicks: fighter.movement.dashCooldownTicks,
      dashCooldownTicks: Math.max(0, fighter.dashReadyTick - tick),
      dashSequence: fighter.dashSequence,
      lockedTargetId: fighter.lockedTargetId,
      homingTargetId: fighter.homingTargetId,
      groundSlamPending: fighter.groundSlamPending,
      downedFrames: fighter.downedFrames,
      downedDurationFrames: this.recipe.combat.downedFrames,
    };
  }

  private createSnapshot(tick: number): SimulationSnapshot {
    const playerHitbox = currentHitbox(this.player, this.library);
    const enemyHitbox = currentHitbox(this.enemy, this.library);
    const hitboxes: ActiveHitbox[] = [];
    if (playerHitbox !== null) {
      hitboxes.push(Object.freeze({ ...playerHitbox }));
    }
    if (enemyHitbox !== null) {
      hitboxes.push(Object.freeze({ ...enemyHitbox }));
    }

    return freezeSnapshot({
      tick,
      elapsedSeconds: tick / SIMULATION_HZ,
      battleOutcome: this.battleOutcome,
      inputLocked: this.battleEnding !== null,
      arena: {
        center: { ...this.recipe.arena.center },
        radius: this.recipe.arena.radius,
      },
      player: this.snapshotFighter(this.player, tick),
      enemy: this.snapshotFighter(this.enemy, tick),
      hitboxes,
    });
  }
}

function freezeFighterSnapshot(snapshot: FighterSnapshot): void {
  Object.freeze(snapshot.body.position);
  Object.freeze(snapshot.body.velocity);
  Object.freeze(snapshot.body);
  Object.freeze(snapshot.facing);
  Object.freeze(snapshot);
}

function freezeSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  Object.freeze(snapshot.arena.center);
  Object.freeze(snapshot.arena);
  freezeFighterSnapshot(snapshot.player);
  freezeFighterSnapshot(snapshot.enemy);
  Object.freeze(snapshot.hitboxes);
  return Object.freeze(snapshot);
}
