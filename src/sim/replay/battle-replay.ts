import { EnemyAiController } from "../ai/enemy-ai";
import type { CommandIntent } from "../input/command-intent";
import type { BattleRecipe } from "../world/battle-recipe";
import type { SimEvent } from "../world/sim-event";
import {
  SimulationWorld,
  type SimulationSnapshot,
} from "../world/world";

export const BATTLE_REPLAY_VERSION = 1;
const UINT32_MAX = 0xffff_ffff;
const FNV_OFFSET_BASIS = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;

export interface InputFrame {
  readonly intents: readonly CommandIntent[];
}

export interface BattleReplay {
  readonly version: typeof BATTLE_REPLAY_VERSION;
  readonly recipe: BattleRecipe;
  readonly seed: number;
  readonly inputFrames: readonly InputFrame[];
}

export interface BattleReplayRun {
  readonly finalSnapshot: SimulationSnapshot;
  /** Index zero is the initial snapshot; every later entry maps to one input frame. */
  readonly stateHashes: readonly string[];
  readonly events: readonly SimEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireReplaySeed(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    typeof value !== "number" ||
    value < 1 ||
    value > UINT32_MAX
  ) {
    throw new RangeError("Replay seed must be an unsigned non-zero 32-bit integer.");
  }

  return value;
}

function cloneIntent(value: unknown, playerId: number): CommandIntent {
  if (!isRecord(value) || value["fighterId"] !== playerId) {
    throw new RangeError("Every replay intent must target the recipe player fighter.");
  }

  switch (value["type"]) {
    case "move": {
      const direction = value["direction"];
      if (
        !isRecord(direction) ||
        typeof direction["x"] !== "number" ||
        !Number.isFinite(direction["x"]) ||
        typeof direction["y"] !== "number" ||
        !Number.isFinite(direction["y"])
      ) {
        throw new RangeError("Replay MoveIntent direction must use finite numbers.");
      }

      return Object.freeze({
        type: "move",
        fighterId: playerId,
        direction: Object.freeze({ x: direction["x"], y: direction["y"] }),
      });
    }
    case "attack": {
      const slot = value["slot"];
      if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
        throw new RangeError("Replay AttackIntent slot must be a non-negative integer.");
      }

      return Object.freeze({ type: "attack", fighterId: playerId, slot });
    }
    case "dash":
      return Object.freeze({ type: "dash", fighterId: playerId });
    case "lock-target":
      return Object.freeze({ type: "lock-target", fighterId: playerId });
    default:
      throw new RangeError("Replay intent type is not supported.");
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function cloneRecipe(value: unknown, seed: number): BattleRecipe {
  if (!isRecord(value)) {
    throw new RangeError("Replay recipe must be an object.");
  }

  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(value)) as unknown;
  } catch (error: unknown) {
    throw new RangeError(
      `Replay recipe must be JSON serializable: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }

  if (!isRecord(clone)) {
    throw new RangeError("Replay recipe did not serialize to an object.");
  }

  const candidate = { ...clone, seed } as unknown as BattleRecipe;
  try {
    const world = new SimulationWorld(candidate);
    world.drainEvents();
    new EnemyAiController(
      candidate.enemy.id,
      candidate.player.id,
      candidate.enemyAi,
      seed,
    );
  } catch (error: unknown) {
    throw new RangeError(
      `Replay recipe is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }

  return deepFreeze(candidate);
}

function parseReplayValue(value: unknown): BattleReplay {
  if (!isRecord(value) || value["version"] !== BATTLE_REPLAY_VERSION) {
    throw new RangeError(`Replay version must be ${BATTLE_REPLAY_VERSION}.`);
  }

  const seed = requireReplaySeed(value["seed"]);
  const recipe = cloneRecipe(value["recipe"], seed);
  const inputFrames = value["inputFrames"];
  if (!Array.isArray(inputFrames)) {
    throw new RangeError("Replay inputFrames must be an array.");
  }

  const frames = inputFrames.map((frame, index): InputFrame => {
    if (!isRecord(frame) || !Array.isArray(frame["intents"])) {
      throw new RangeError(`Replay input frame ${index} must contain an intents array.`);
    }

    return Object.freeze({
      intents: Object.freeze(
        frame["intents"].map((intent) => cloneIntent(intent, recipe.player.id)),
      ),
    });
  });

  return Object.freeze({
    version: BATTLE_REPLAY_VERSION,
    recipe,
    seed,
    inputFrames: Object.freeze(frames),
  });
}

export function createBattleReplay(
  recipe: BattleRecipe,
  inputFrames: readonly InputFrame[],
  seed = recipe.seed,
): BattleReplay {
  return parseReplayValue({
    version: BATTLE_REPLAY_VERSION,
    recipe,
    seed,
    inputFrames,
  });
}

export function parseBattleReplay(value: unknown): BattleReplay {
  if (typeof value !== "string") {
    return parseReplayValue(value);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error: unknown) {
    throw new RangeError(
      `Replay JSON is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }

  return parseReplayValue(parsed);
}

export function serializeBattleReplay(replay: BattleReplay): string {
  return JSON.stringify(parseReplayValue(replay), null, 2);
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new RangeError("State hashes only accept finite numbers.");
      }
      return Object.is(value, -0) ? "0" : String(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
      }
      return `{${Object.keys(value)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`,
        )
        .join(",")}}`;
    default:
      throw new RangeError("State hashes only accept JSON-compatible values.");
  }
}

export function hashSimulationSnapshot(snapshot: SimulationSnapshot): string {
  const serialized = stableSerialize(snapshot);
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function runBattleReplay(replayValue: BattleReplay): BattleReplayRun {
  const replay = parseReplayValue(replayValue);
  const world = new SimulationWorld({ ...replay.recipe, seed: replay.seed });
  const enemyAi = new EnemyAiController(
    replay.recipe.enemy.id,
    replay.recipe.player.id,
    replay.recipe.enemyAi,
    replay.seed,
  );
  const stateHashes = [hashSimulationSnapshot(world.getFrame().current)];
  const events: SimEvent[] = [];

  for (const inputFrame of replay.inputFrames) {
    const aiIntents = enemyAi.decide(world.getFrame().current);
    world.step([...inputFrame.intents, ...aiIntents]);
    events.push(...world.drainEvents());
    stateHashes.push(hashSimulationSnapshot(world.getFrame().current));
  }

  return Object.freeze({
    finalSnapshot: world.getFrame().current,
    stateHashes: Object.freeze(stateHashes),
    events: Object.freeze(events),
  });
}
