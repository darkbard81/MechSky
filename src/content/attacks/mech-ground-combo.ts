import type {
  AttackDefinition,
  ComboChain,
} from "../../sim/combat/attack-definition";

export const MECH_GROUND_CHAIN_ID = "mech-ground";

/** First ground hit. A whiff cannot open the follow-up. */
export const MECH_GROUND_1 = {
  id: "mech-ground-1",
  tags: ["melee", "ground"],
  startupFrames: 6,
  activeFrames: 4,
  recoveryFrames: 13,
  damage: 60,
  hitStunFrames: 18,
  hitStopFrames: 4,
  knockback: 120,
  launchVelocity: 0,
  selfVerticalVelocity: 0,
  groundSlam: false,
  forwardImpulse: 150,
  hitbox: {
    forwardOffset: 52,
    radius: 60,
    minimumElevation: 0,
    maximumElevation: 90,
  },
  cancels: [{ fromFrame: 10, into: ["melee"], requiresHit: true }],
} as const satisfies AttackDefinition;

/** Second ground hit opens the X launcher only after it connects. */
export const MECH_GROUND_2 = {
  id: "mech-ground-2",
  tags: ["melee", "ground"],
  startupFrames: 8,
  activeFrames: 5,
  recoveryFrames: 20,
  damage: 90,
  hitStunFrames: 24,
  hitStopFrames: 7,
  knockback: 150,
  launchVelocity: 0,
  selfVerticalVelocity: 0,
  groundSlam: false,
  forwardImpulse: 190,
  hitbox: {
    forwardOffset: 62,
    radius: 68,
    minimumElevation: 0,
    maximumElevation: 100,
  },
  cancels: [{ fromFrame: 13, into: ["launcher"], requiresHit: true }],
} as const satisfies AttackDefinition;

export const MECH_GROUND_COMBO = {
  id: MECH_GROUND_CHAIN_ID,
  attacks: [MECH_GROUND_1.id, MECH_GROUND_2.id],
} as const satisfies ComboChain;
