import type { BattleRecipe } from "../../sim/world/battle-recipe";

export const PLAYER_FIGHTER_ID = 1;
export const TRAINING_TARGET_ID = 2;

export const HANGAR_TEST_BATTLE: BattleRecipe = Object.freeze({
  arena: {
    center: { x: 0, y: 0 },
    radius: 380,
  },
  player: {
    id: PLAYER_FIGHTER_ID,
    spawn: { x: -155, y: 72, elevation: 0 },
    radius: 28,
    bodyHeight: 112,
    movement: {
      acceleration: 1_050,
      deceleration: 1_350,
      maximumSpeed: 255,
      dashSpeed: 640,
      dashDurationTicks: 10,
      dashCooldownTicks: 48,
    },
  },
  target: {
    id: TRAINING_TARGET_ID,
    position: { x: 155, y: -34, elevation: 0 },
  },
});
