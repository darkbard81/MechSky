import type { ComboChain } from "../../sim/combat/attack-definition";
import { MECH_GROUND_1 } from "./mech-ground-combo";

export const ENEMY_MECH_STRIKE_CHAIN_ID = "enemy-mech-strike";

export const ENEMY_MECH_STRIKE_CHAIN = {
  id: ENEMY_MECH_STRIKE_CHAIN_ID,
  attacks: [MECH_GROUND_1.id],
} as const satisfies ComboChain;
