import type { AttackLibrary } from "../../sim/combat/attack-definition";
import { MECH_AIR_1, MECH_AIR_2, MECH_AIR_COMBO } from "./mech-air-combo";
import { MECH_FINISHER, MECH_FINISHER_CHAIN } from "./mech-finisher";
import {
  MECH_GROUND_1,
  MECH_GROUND_2,
  MECH_GROUND_COMBO,
} from "./mech-ground-combo";
import { MECH_LAUNCHER, MECH_LAUNCHER_CHAIN } from "./mech-launcher";

export const MECH_ATTACK_LIBRARY = {
  attacks: {
    [MECH_GROUND_1.id]: MECH_GROUND_1,
    [MECH_GROUND_2.id]: MECH_GROUND_2,
    [MECH_LAUNCHER.id]: MECH_LAUNCHER,
    [MECH_AIR_1.id]: MECH_AIR_1,
    [MECH_AIR_2.id]: MECH_AIR_2,
    [MECH_FINISHER.id]: MECH_FINISHER,
  },
  chains: {
    [MECH_GROUND_COMBO.id]: MECH_GROUND_COMBO,
    [MECH_LAUNCHER_CHAIN.id]: MECH_LAUNCHER_CHAIN,
    [MECH_AIR_COMBO.id]: MECH_AIR_COMBO,
    [MECH_FINISHER_CHAIN.id]: MECH_FINISHER_CHAIN,
  },
} as const satisfies AttackLibrary;
