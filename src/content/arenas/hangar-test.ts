import { MECH_ATTACK_LIBRARY, MECH_GROUND_CHAIN_ID } from "../attacks/mech-ground-combo";
import { ENEMY_MECH, ENEMY_MECH_ID } from "../actors/enemy-mech";
import type { BattleRecipe } from "../../sim/world/battle-recipe";

export const PLAYER_FIGHTER_ID = 1;
export const TRAINING_TARGET_ID = ENEMY_MECH_ID;

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
    health: 1_000,
    chainId: MECH_GROUND_CHAIN_ID,
    movement: {
      acceleration: 1_050,
      deceleration: 1_350,
      maximumSpeed: 255,
      dashSpeed: 640,
      dashDurationTicks: 10,
      dashCooldownTicks: 48,
    },
  },
  enemy: ENEMY_MECH,
  combat: {
    library: MECH_ATTACK_LIBRARY,
    inputBufferFrames: 9,
    comboResetFrames: 45,
    hitstunFriction: 900,
  },
});
