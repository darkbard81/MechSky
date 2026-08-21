import { MECH_AIR_CHAIN_ID } from "../attacks/mech-air-combo";
import { MECH_ATTACK_LIBRARY } from "../attacks/mech-attack-library";
import { MECH_FINISHER_CHAIN_ID } from "../attacks/mech-finisher";
import { MECH_GROUND_CHAIN_ID } from "../attacks/mech-ground-combo";
import { MECH_LAUNCHER_CHAIN_ID } from "../attacks/mech-launcher";
import { ENEMY_MECH, ENEMY_MECH_ID } from "../actors/enemy-mech";
import type { BattleRecipe } from "../../sim/world/battle-recipe";

export const PLAYER_FIGHTER_ID = 1;
export const ENEMY_FIGHTER_ID = ENEMY_MECH_ID;

export const HANGAR_TEST_BATTLE: BattleRecipe = Object.freeze({
  seed: 0x4d_35_41_49,
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
    attackChains: {
      grounded: [MECH_GROUND_CHAIN_ID, MECH_LAUNCHER_CHAIN_ID],
      airborne: [MECH_AIR_CHAIN_ID, MECH_FINISHER_CHAIN_ID],
    },
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
  enemyAi: {
    reactionDelayFrames: 14,
    hitRecoveryFrames: 24,
    attackCooldownFrames: 78,
    evadeCooldownFrames: 180,
    evadeDurationFrames: 8,
    minimumRange: 92,
    preferredRange: 116,
    maximumRange: 136,
    evadeTriggerRange: 178,
    aimErrorRadians: 0.08,
  },
  combat: {
    library: MECH_ATTACK_LIBRARY,
    inputBufferFrames: 9,
    comboResetFrames: 45,
    hitstunFriction: 900,
    gravity: 1_200,
    maximumFallSpeed: 1_050,
    homingDurationTicks: 24,
    homingSpeed: 720,
    homingVerticalSpeed: 840,
    downedFrames: 48,
  },
});
