import type {
  AttackDefinition,
  ComboChain,
} from "../../sim/combat/attack-definition";

export const MECH_FINISHER_CHAIN_ID = "mech-finisher";

export const MECH_FINISHER = {
  id: "mech-finisher",
  tags: ["melee", "air", "finisher"],
  startupFrames: 7,
  activeFrames: 5,
  recoveryFrames: 18,
  damage: 140,
  hitStunFrames: 36,
  hitStopFrames: 9,
  knockback: 55,
  launchVelocity: -980,
  selfVerticalVelocity: -360,
  groundSlam: true,
  forwardImpulse: 105,
  hitbox: {
    forwardOffset: 52,
    radius: 82,
    minimumElevation: -54,
    maximumElevation: 160,
  },
  cancels: [],
} as const satisfies AttackDefinition;

export const MECH_FINISHER_CHAIN = {
  id: MECH_FINISHER_CHAIN_ID,
  attacks: [MECH_FINISHER.id],
} as const satisfies ComboChain;
