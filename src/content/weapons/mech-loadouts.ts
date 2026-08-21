import type { ContextualLoadout } from "../../sim/combat/loadout";
import {
  ENEMY_BASIC_STRIKE_ID,
  MECH_BASIC_COMBO_ID,
  MECH_SPECIAL_ID,
} from "./mech-weapons";

/**
 * M7 migration loadout. The same two weapons sit in all four contexts so the
 * approved vertical slice keeps its exact Z/X behaviour no matter which context
 * the press resolves to; C stays empty until real contextual weapons land.
 */
export const MECH_PLAYER_LOADOUT = {
  "short-range": { A: MECH_BASIC_COMBO_ID, B: MECH_SPECIAL_ID, C: null },
  "search-dash": { A: MECH_BASIC_COMBO_ID, B: MECH_SPECIAL_ID, C: null },
  "long-range": { A: MECH_BASIC_COMBO_ID, B: MECH_SPECIAL_ID, C: null },
  "normal-dash": { A: MECH_BASIC_COMBO_ID, B: MECH_SPECIAL_ID, C: null },
} as const satisfies ContextualLoadout;

export const ENEMY_MECH_LOADOUT = {
  "short-range": { A: ENEMY_BASIC_STRIKE_ID, B: null, C: null },
  "search-dash": { A: ENEMY_BASIC_STRIKE_ID, B: null, C: null },
  "long-range": { A: ENEMY_BASIC_STRIKE_ID, B: null, C: null },
  "normal-dash": { A: ENEMY_BASIC_STRIKE_ID, B: null, C: null },
} as const satisfies ContextualLoadout;
