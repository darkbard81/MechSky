import { EnemyAiController } from "../ai/enemy-ai";
import { ATTACK_CONTEXT_CYCLE } from "../combat/attack-context";
import { isAttackButton } from "../combat/loadout";
import type { AttackButton, CommandIntent } from "../input/command-intent";
import type { BattleRecipe } from "../world/battle-recipe";
import type { SimEvent } from "../world/sim-event";
import {
  SimulationWorld,
  validateRecipe,
  type SimulationSnapshot,
} from "../world/world";

export const BATTLE_REPLAY_VERSION = 3;
const LEGACY_BATTLE_REPLAY_VERSIONS = [1, 2] as const;
const LEGACY_HOMING_STOP_DISTANCE = 92;
const LEGACY_SEARCH_RANGE = 180;
const LEGACY_COMBO_SESSION_IDLE_FRAMES = 45;
/** Legacy numeric attack slots, in the order the old adapter emitted them. */
const LEGACY_ATTACK_BUTTONS = ["A", "B"] as const satisfies readonly AttackButton[];
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

type ReplaySourceVersion =
  | (typeof LEGACY_BATTLE_REPLAY_VERSIONS)[number]
  | typeof BATTLE_REPLAY_VERSION;

function requireReplayVersion(value: unknown): ReplaySourceVersion {
  const supported: readonly number[] = [
    ...LEGACY_BATTLE_REPLAY_VERSIONS,
    BATTLE_REPLAY_VERSION,
  ];

  if (typeof value !== "number" || !supported.includes(value)) {
    throw new RangeError(`Replay version must be one of ${supported.join(", ")}.`);
  }

  return value as ReplaySourceVersion;
}

/** Legacy slot 0/1 map onto buttons A/B; there was no C. */
function legacyAttackButton(slot: unknown): AttackButton {
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
    throw new RangeError("Replay AttackIntent slot must be a non-negative integer.");
  }

  const button = LEGACY_ATTACK_BUTTONS[slot];
  if (button === undefined) {
    throw new RangeError(`Legacy attack slot ${slot} has no attack button.`);
  }

  return button;
}

function cloneIntent(
  value: unknown,
  playerId: number,
  sourceVersion: ReplaySourceVersion,
): CommandIntent {
  if (!isRecord(value) || value["fighterId"] !== playerId) {
    throw new RangeError("Every replay intent must target the recipe player fighter.");
  }

  const legacy = sourceVersion !== BATTLE_REPLAY_VERSION;

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
      const button = legacy
        ? legacyAttackButton(value["slot"])
        : value["button"];
      if (typeof button !== "string" || !isAttackButton(button)) {
        throw new RangeError("Replay AttackIntent button must be A, B, or C.");
      }

      return Object.freeze({ type: "attack", fighterId: playerId, button });
    }
    case "dash":
      if (!legacy) {
        throw new RangeError("Replay intent type is not supported.");
      }

      // A legacy dash frame is exactly one frame with the button down.
      return Object.freeze({
        type: "search-dash",
        fighterId: playerId,
        pressed: true,
        held: true,
      });
    case "search-dash": {
      const pressed = value["pressed"];
      const held = value["held"];
      if (typeof pressed !== "boolean" || typeof held !== "boolean") {
        throw new RangeError("Replay SearchDashIntent needs boolean pressed and held.");
      }

      return Object.freeze({
        type: "search-dash",
        fighterId: playerId,
        pressed,
        held,
      });
    }
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

/**
 * Rewrites a pre-M8 recipe into the 12-slot shape. Every legacy attack chain
 * becomes a weapon repeated across all four contexts, which is what preserves
 * the old meaning: back then one button reached one chain regardless of
 * direction or Search Dash. The simulation never sees the legacy shape.
 */
function migrateLegacyRecipe(clone: Record<string, unknown>): void {
  const combat = clone["combat"];
  if (!isRecord(combat)) {
    throw new RangeError("Legacy replay recipe must carry a combat section.");
  }

  combat["homingStopDistance"] ??= LEGACY_HOMING_STOP_DISTANCE;
  combat["searchRange"] ??= LEGACY_SEARCH_RANGE;
  combat["comboSessionIdleFrames"] ??= LEGACY_COMBO_SESSION_IDLE_FRAMES;

  const weapons: Record<string, unknown> = {};
  for (const label of ["player", "enemy"]) {
    const fighter = clone[label];
    if (!isRecord(fighter)) {
      throw new RangeError(`Legacy replay recipe must carry a ${label} fighter.`);
    }

    fighter["loadout"] = migrateLegacyFighter(fighter, label, weapons);
    delete fighter["attackChains"];
  }

  combat["weapons"] = { weapons };
}

function legacyChainId(chains: unknown, slot: number): string | null {
  if (!Array.isArray(chains)) {
    return null;
  }

  const chainId: unknown = chains[slot];
  return typeof chainId === "string" ? chainId : null;
}

function migrateLegacyFighter(
  fighter: Record<string, unknown>,
  label: string,
  weapons: Record<string, unknown>,
): Record<string, Record<string, string | null>> {
  const attackChains = fighter["attackChains"];
  if (!isRecord(attackChains)) {
    throw new RangeError(`Legacy ${label} recipe must carry attack chains.`);
  }

  const row: Record<string, string | null> = { A: null, B: null, C: null };
  for (const [slot, button] of LEGACY_ATTACK_BUTTONS.entries()) {
    const grounded = legacyChainId(attackChains["grounded"], slot);
    const airborne = legacyChainId(attackChains["airborne"], slot);
    if (grounded === null && airborne === null) {
      continue;
    }

    const weaponId = `legacy-${label}-${button.toLowerCase()}`;
    weapons[weaponId] = { id: weaponId, entryChains: { grounded, airborne } };
    row[button] = weaponId;
  }

  const loadout: Record<string, Record<string, string | null>> = {};
  for (const context of ATTACK_CONTEXT_CYCLE) {
    loadout[context] = { ...row };
  }

  return loadout;
}

function cloneRecipe(
  value: unknown,
  seed: number,
  sourceVersion: ReplaySourceVersion,
): BattleRecipe {
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

  if (sourceVersion !== BATTLE_REPLAY_VERSION) {
    migrateLegacyRecipe(clone);
  }

  const candidate = { ...clone, seed } as unknown as BattleRecipe;
  try {
    validateRecipe(candidate);
  } catch (error: unknown) {
    throw new RangeError(
      `Replay recipe is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      { cause: error },
    );
  }

  return deepFreeze(candidate);
}

function parseReplayValue(value: unknown): BattleReplay {
  if (!isRecord(value)) {
    throw new RangeError("Replay must be an object.");
  }

  const sourceVersion = requireReplayVersion(value["version"]);
  const seed = requireReplaySeed(value["seed"]);
  const recipe = cloneRecipe(value["recipe"], seed, sourceVersion);
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
        frame["intents"].map((intent) =>
          cloneIntent(intent, recipe.player.id, sourceVersion),
        ),
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
