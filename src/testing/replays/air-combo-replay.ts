import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../content/arenas/hangar-test";
import type { CommandIntent } from "../../sim/input/command-intent";
import {
  createBattleReplay,
  type InputFrame,
} from "../../sim/replay/battle-replay";
import type { BattleRecipe } from "../../sim/world/battle-recipe";

export const AIR_COMBO_REPLAY_TICKS = 167;
export const AIR_COMBO_SCREENSHOT_TICK = 91;

const PRIMARY: CommandIntent = Object.freeze({
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  button: "A",
});
const SPECIAL: CommandIntent = Object.freeze({
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  button: "B",
});
const CHASE: CommandIntent = Object.freeze({
  type: "search-dash",
  fighterId: PLAYER_FIGHTER_ID,
  pressed: true,
  held: true,
});

const INPUT_AT_TICK: Readonly<Record<number, CommandIntent>> = Object.freeze({
  1: PRIMARY,
  15: PRIMARY,
  35: SPECIAL,
  53: CHASE,
  55: PRIMARY,
  68: PRIMARY,
  83: SPECIAL,
});

export const AIR_COMBO_REPLAY_RECIPE: BattleRecipe = Object.freeze({
  ...HANGAR_TEST_BATTLE,
  player: {
    ...HANGAR_TEST_BATTLE.player,
    spawn: { x: 0, y: 0, elevation: 0 },
  },
  enemy: {
    ...HANGAR_TEST_BATTLE.enemy,
    spawn: { x: 100, y: 0, elevation: 0 },
  },
  enemyAi: {
    ...HANGAR_TEST_BATTLE.enemyAi,
    reactionDelayFrames: 10_000,
  },
});

const INPUT_FRAMES: readonly InputFrame[] = Object.freeze(
  Array.from({ length: AIR_COMBO_REPLAY_TICKS }, (_, index): InputFrame => {
    const intent = INPUT_AT_TICK[index + 1];
    return Object.freeze({
      intents: intent === undefined ? Object.freeze([]) : Object.freeze([intent]),
    });
  }),
);

export const AIR_COMBO_REPLAY = createBattleReplay(
  AIR_COMBO_REPLAY_RECIPE,
  INPUT_FRAMES,
);
