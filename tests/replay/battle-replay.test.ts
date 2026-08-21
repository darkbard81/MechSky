import { describe, expect, it } from "vitest";
import { ATTACK_CONTEXT_CYCLE } from "../../src/sim/combat/attack-context";
import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import {
  BATTLE_REPLAY_VERSION,
  createBattleReplay,
  hashSimulationSnapshot,
  parseBattleReplay,
  runBattleReplay,
  serializeBattleReplay,
  type InputFrame,
} from "../../src/sim/replay/battle-replay";
import { SimulationWorld } from "../../src/sim/world/world";
import {
  AIR_COMBO_REPLAY,
  AIR_COMBO_REPLAY_TICKS,
} from "../../src/testing/replays/air-combo-replay";

function emptyFrames(count: number): readonly InputFrame[] {
  return Array.from({ length: count }, () => ({ intents: [] }));
}

/** The v2 shape: numeric attack slots and per-locomotion chain arrays. */
function legacyReplayValue(): Record<string, unknown> {
  const recipe = AIR_COMBO_REPLAY.recipe;
  const combat: Record<string, unknown> = { ...recipe.combat };
  for (const field of [
    "weapons",
    "searchRange",
    "comboSessionIdleFrames",
    "homingStopDistance",
  ]) {
    delete combat[field];
  }
  const legacyFighter = (
    fighter: typeof recipe.player,
    grounded: readonly (string | null)[],
    airborne: readonly (string | null)[],
  ): Record<string, unknown> => {
    const rest: Record<string, unknown> = { ...fighter };
    delete rest["loadout"];
    return { ...rest, attackChains: { grounded, airborne } };
  };

  return {
    ...AIR_COMBO_REPLAY,
    version: 2,
    recipe: {
      ...recipe,
      combat,
      player: legacyFighter(
        recipe.player,
        ["mech-ground", "mech-launcher"],
        ["mech-air", "mech-finisher"],
      ),
      enemy: legacyFighter(recipe.enemy, ["enemy-mech-strike", null], [null, null]),
    },
    inputFrames: AIR_COMBO_REPLAY.inputFrames.map((frame) => ({
      intents: frame.intents.map((intent) =>
        intent.type === "attack"
          ? {
              type: "attack",
              fighterId: intent.fighterId,
              slot: intent.button === "A" ? 0 : 1,
            }
          : intent.type === "search-dash"
            ? { type: "dash", fighterId: intent.fighterId }
            : intent,
      ),
    })),
  };
}

describe("battle replay", () => {
  it("round-trips BattleRecipe, seed, and every InputFrame through JSON", () => {
    const serialized = serializeBattleReplay(AIR_COMBO_REPLAY);
    const parsed = parseBattleReplay(serialized);

    expect(parsed).toEqual(AIR_COMBO_REPLAY);
    expect(parsed.seed).toBe(HANGAR_TEST_BATTLE.seed);
    expect(parsed.inputFrames).toHaveLength(AIR_COMBO_REPLAY_TICKS);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.recipe.combat.library.attacks)).toBe(true);
  });

  it("preserves every player CommandIntent variant inside one input frame", () => {
    const replay = createBattleReplay(HANGAR_TEST_BATTLE, [
      {
        intents: [
          {
            type: "move",
            fighterId: PLAYER_FIGHTER_ID,
            direction: { x: 0.5, y: -0.25 },
          },
          {
            type: "search-dash",
            fighterId: PLAYER_FIGHTER_ID,
            pressed: true,
            held: false,
          },
          { type: "attack", fighterId: PLAYER_FIGHTER_ID, button: "B" },
          { type: "lock-target", fighterId: PLAYER_FIGHTER_ID },
        ],
      },
    ]);

    expect(parseBattleReplay(serializeBattleReplay(replay))).toEqual(replay);
  });

  it("rebuilds a pre-M8 recipe and its numeric attack slots as 12 loadout slots", () => {
    const migrated = parseBattleReplay({
      ...legacyReplayValue(),
      inputFrames: [
        {
          intents: [
            { type: "attack", fighterId: PLAYER_FIGHTER_ID, slot: 1 },
            { type: "dash", fighterId: PLAYER_FIGHTER_ID },
          ],
        },
      ],
    });
    const { loadout } = migrated.recipe.player;

    expect(migrated.version).toBe(BATTLE_REPLAY_VERSION);
    expect(migrated.recipe.combat.homingStopDistance).toBe(92);
    expect(migrated.recipe.combat.searchRange).toBeGreaterThan(0);
    expect(migrated.recipe.combat.comboSessionIdleFrames).toBeGreaterThan(0);

    // The old meaning was "one button reaches one chain, whatever the input
    // looked like", so every context holds the same legacy weapon.
    for (const context of ATTACK_CONTEXT_CYCLE) {
      expect(loadout[context]).toEqual({
        A: "legacy-player-a",
        B: "legacy-player-b",
        C: null,
      });
    }
    expect(migrated.recipe.combat.weapons.weapons["legacy-player-b"]).toEqual({
      id: "legacy-player-b",
      entryChains: { grounded: "mech-launcher", airborne: "mech-finisher" },
    });
    expect(migrated.recipe.combat.weapons.weapons["legacy-enemy-b"]).toBeUndefined();
    expect(migrated.inputFrames[0]?.intents).toEqual([
      { type: "attack", fighterId: PLAYER_FIGHTER_ID, button: "B" },
      {
        type: "search-dash",
        fighterId: PLAYER_FIGHTER_ID,
        pressed: true,
        held: true,
      },
    ]);
    expect(JSON.parse(serializeBattleReplay(migrated))).toMatchObject({
      version: BATTLE_REPLAY_VERSION,
    });
  });

  it("replays a migrated legacy recording to the same fight, deterministically", () => {
    const migrated = runBattleReplay(parseBattleReplay(legacyReplayValue()));
    const repeated = runBattleReplay(parseBattleReplay(legacyReplayValue()));
    const hitIds = migrated.events
      .filter((event) => event.type === "hit-landed")
      .map((event) => event.attackId);
    const reference = runBattleReplay(AIR_COMBO_REPLAY);

    expect(repeated.stateHashes).toEqual(migrated.stateHashes);
    // The synthesized weapon ids differ from the M8 loadout, so the hashes are
    // expected to differ; the fight the old recording described must not.
    expect(hitIds).toEqual(
      reference.events
        .filter((event) => event.type === "hit-landed")
        .map((event) => event.attackId),
    );
    expect(migrated.finalSnapshot.enemy.health).toBe(
      reference.finalSnapshot.enemy.health,
    );
    expect(migrated.finalSnapshot.player.body.position).toEqual(
      reference.finalSnapshot.player.body.position,
    );
  });

  it("reproduces every tick hash and the complete air-combo result twice", () => {
    const first = runBattleReplay(AIR_COMBO_REPLAY);
    const second = runBattleReplay(AIR_COMBO_REPLAY);
    const hitIds = first.events
      .filter((event) => event.type === "hit-landed")
      .map((event) => event.attackId);

    expect(second.stateHashes).toEqual(first.stateHashes);
    expect(second.finalSnapshot).toEqual(first.finalSnapshot);
    expect(first.stateHashes).toHaveLength(AIR_COMBO_REPLAY_TICKS + 1);
    expect(first.finalSnapshot.tick).toBe(AIR_COMBO_REPLAY_TICKS);
    expect(first.finalSnapshot.enemy.health).toBe(420);
    expect(first.stateHashes.at(-1)).toBe("030c2d73");
    expect(hitIds).toEqual([
      "mech-ground-1",
      "mech-ground-2",
      "mech-launcher",
      "mech-air-1",
      "mech-air-2",
      "mech-finisher",
    ]);
  });

  it("hashes combo-session idle progress that can change a later slot reset tick", () => {
    const snapshot = new SimulationWorld(HANGAR_TEST_BATTLE).getFrame().current;
    const progressed = {
      ...snapshot,
      player: {
        ...snapshot.player,
        comboSessionIdleFrames: snapshot.player.comboSessionIdleFrames + 1,
      },
    };

    expect(hashSimulationSnapshot(progressed)).not.toBe(
      hashSimulationSnapshot(snapshot),
    );
  });

  it("lets the explicit replay seed change seeded AI state", () => {
    const frames = emptyFrames(240);
    const first = runBattleReplay(
      createBattleReplay(HANGAR_TEST_BATTLE, frames, HANGAR_TEST_BATTLE.seed),
    );
    const second = runBattleReplay(
      createBattleReplay(HANGAR_TEST_BATTLE, frames, HANGAR_TEST_BATTLE.seed + 1),
    );

    expect(second.stateHashes).not.toEqual(first.stateHashes);
    expect(second.finalSnapshot).not.toEqual(first.finalSnapshot);
  });

  it("rejects malformed seeds, frames, and non-player intents at the boundary", () => {
    expect(() =>
      parseBattleReplay({
        ...AIR_COMBO_REPLAY,
        seed: 0,
      }),
    ).toThrow(/seed/iu);
    expect(() =>
      parseBattleReplay({
        ...AIR_COMBO_REPLAY,
        inputFrames: [{}],
      }),
    ).toThrow(/intents/iu);
    expect(() =>
      parseBattleReplay({
        ...AIR_COMBO_REPLAY,
        inputFrames: [
          {
            intents: [
              { type: "attack", fighterId: PLAYER_FIGHTER_ID + 1, button: "A" },
            ],
          },
        ],
      }),
    ).toThrow(/player fighter/iu);
  });
});
