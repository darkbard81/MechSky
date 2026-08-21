import type {
  WeaponDefinition,
  WeaponLibrary,
} from "../../sim/combat/weapon-definition";
import { ENEMY_MECH_STRIKE_CHAIN_ID } from "../attacks/enemy-mech-strike";
import { MECH_AIR_CHAIN_ID } from "../attacks/mech-air-combo";
import { MECH_FINISHER_CHAIN_ID } from "../attacks/mech-finisher";
import { MECH_GROUND_CHAIN_ID } from "../attacks/mech-ground-combo";
import { MECH_LAUNCHER_CHAIN_ID } from "../attacks/mech-launcher";

export const MECH_BASIC_COMBO_ID = "mech-basic-combo";
export const MECH_SPECIAL_ID = "mech-special";
export const ENEMY_BASIC_STRIKE_ID = "enemy-basic-strike";

/** Ground and air melee chains behind one mounting position. */
export const MECH_BASIC_COMBO = {
  id: MECH_BASIC_COMBO_ID,
  entryChains: {
    grounded: MECH_GROUND_CHAIN_ID,
    airborne: MECH_AIR_CHAIN_ID,
  },
} as const satisfies WeaponDefinition;

/** Launcher on the ground, ground-slam finisher in the air. */
export const MECH_SPECIAL = {
  id: MECH_SPECIAL_ID,
  entryChains: {
    grounded: MECH_LAUNCHER_CHAIN_ID,
    airborne: MECH_FINISHER_CHAIN_ID,
  },
} as const satisfies WeaponDefinition;

export const ENEMY_BASIC_STRIKE = {
  id: ENEMY_BASIC_STRIKE_ID,
  entryChains: {
    grounded: ENEMY_MECH_STRIKE_CHAIN_ID,
    airborne: null,
  },
} as const satisfies WeaponDefinition;

export const MECH_WEAPON_LIBRARY = {
  weapons: {
    [MECH_BASIC_COMBO.id]: MECH_BASIC_COMBO,
    [MECH_SPECIAL.id]: MECH_SPECIAL,
    [ENEMY_BASIC_STRIKE.id]: ENEMY_BASIC_STRIKE,
  },
} as const satisfies WeaponLibrary;
