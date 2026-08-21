import { describe, expect, it } from "vitest";
import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import {
  createBattleReplay,
  parseBattleReplay,
  runBattleReplay,
  serializeBattleReplay,
  type InputFrame,
} from "../../src/sim/replay/battle-replay";
import {
  AIR_COMBO_REPLAY,
  AIR_COMBO_REPLAY_TICKS,
} from "../../src/testing/replays/air-combo-replay";

function emptyFrames(count: number): readonly InputFrame[] {
  return Array.from({ length: count }, () => ({ intents: [] }));
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
          { type: "dash", fighterId: PLAYER_FIGHTER_ID },
          { type: "attack", fighterId: PLAYER_FIGHTER_ID, slot: 1 },
          { type: "lock-target", fighterId: PLAYER_FIGHTER_ID },
        ],
      },
    ]);

    expect(parseBattleReplay(serializeBattleReplay(replay))).toEqual(replay);
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
    expect(first.stateHashes.at(-1)).toBe("ca05d879");
    expect(hitIds).toEqual([
      "mech-ground-1",
      "mech-ground-2",
      "mech-launcher",
      "mech-air-1",
      "mech-air-2",
      "mech-finisher",
    ]);
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
              { type: "attack", fighterId: PLAYER_FIGHTER_ID + 1, slot: 0 },
            ],
          },
        ],
      }),
    ).toThrow(/player fighter/iu);
  });
});
