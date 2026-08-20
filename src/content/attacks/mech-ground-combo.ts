import type {
  AttackDefinition,
  AttackLibrary,
  ComboChain,
} from "../../sim/combat/attack-definition";

export const MECH_GROUND_CHAIN_ID = "mech-ground";

/**
 * First ground hit. The cancel window opens the frame after the hitbox closes
 * and only when the swing connected, so a whiff cannot chain.
 */
const MECH_GROUND_1 = {
  id: "mech-ground-1",
  tags: ["melee", "ground"],
  startupFrames: 6,
  activeFrames: 4,
  recoveryFrames: 13,
  damage: 60,
  hitStunFrames: 18,
  hitStopFrames: 4,
  knockback: 120,
  forwardImpulse: 150,
  hitbox: {
    forwardOffset: 52,
    radius: 60,
    minimumElevation: 0,
    maximumElevation: 90,
  },
  cancels: [{ fromFrame: 10, into: ["melee"], requiresHit: true }],
} as const satisfies AttackDefinition;

/** Second ground hit. Heavier, and it ends the chain for the M2 slice. */
const MECH_GROUND_2 = {
  id: "mech-ground-2",
  tags: ["melee", "ground"],
  startupFrames: 8,
  activeFrames: 5,
  recoveryFrames: 20,
  damage: 90,
  hitStunFrames: 24,
  hitStopFrames: 7,
  knockback: 260,
  forwardImpulse: 190,
  hitbox: {
    forwardOffset: 62,
    radius: 68,
    minimumElevation: 0,
    maximumElevation: 100,
  },
  cancels: [],
} as const satisfies AttackDefinition;

const MECH_GROUND_COMBO = {
  id: MECH_GROUND_CHAIN_ID,
  attacks: [MECH_GROUND_1.id, MECH_GROUND_2.id],
} as const satisfies ComboChain;

export const MECH_ATTACK_LIBRARY = {
  attacks: {
    [MECH_GROUND_1.id]: MECH_GROUND_1,
    [MECH_GROUND_2.id]: MECH_GROUND_2,
  },
  chains: {
    [MECH_GROUND_CHAIN_ID]: MECH_GROUND_COMBO,
  },
} as const satisfies AttackLibrary;
