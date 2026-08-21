import type { FighterRecipe } from "../../sim/world/battle-recipe";
import { ENEMY_MECH_STRIKE_CHAIN_ID } from "../attacks/enemy-mech-strike";

export const ENEMY_MECH_ID = 2;

export const ENEMY_MECH = {
  id: ENEMY_MECH_ID,
  spawn: { x: 155, y: -34, elevation: 0 },
  radius: 30,
  bodyHeight: 112,
  health: 900,
  attackChains: {
    grounded: [ENEMY_MECH_STRIKE_CHAIN_ID, null],
    airborne: [null, null],
  },
  movement: {
    acceleration: 900,
    deceleration: 1_500,
    maximumSpeed: 205,
    dashSpeed: 520,
    dashDurationTicks: 8,
    dashCooldownTicks: 72,
  },
} as const satisfies FighterRecipe;
