import type { FighterRecipe } from "../../sim/world/battle-recipe";

/**
 * Vertical-slice training target: it can be launched, juggled, knocked down,
 * and wake up, but it does not act. Enemy AI arrives in M5.
 */
export const ENEMY_MECH_ID = 2;

export const ENEMY_MECH = {
  id: ENEMY_MECH_ID,
  spawn: { x: 155, y: -34, elevation: 0 },
  radius: 30,
  bodyHeight: 112,
  health: 900,
  attackChains: {
    grounded: [null, null],
    airborne: [null, null],
  },
  movement: {
    acceleration: 900,
    deceleration: 1_500,
    maximumSpeed: 0.001,
    dashSpeed: 0.002,
    dashDurationTicks: 1,
    dashCooldownTicks: 1,
  },
} as const satisfies FighterRecipe;
