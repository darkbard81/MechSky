import type {
  AttackDefinition,
  ComboChain,
} from "../../sim/combat/attack-definition";

export const MECH_AIR_CHAIN_ID = "mech-air";

export const MECH_AIR_1 = {
  id: "mech-air-1",
  tags: ["melee", "air"],
  startupFrames: 5,
  activeFrames: 4,
  recoveryFrames: 11,
  damage: 50,
  hitStunFrames: 25,
  hitStopFrames: 4,
  knockback: 75,
  launchVelocity: 180,
  selfVerticalVelocity: 500,
  groundSlam: false,
  forwardImpulse: 115,
  hitbox: {
    forwardOffset: 56,
    radius: 72,
    minimumElevation: -24,
    maximumElevation: 132,
  },
  cancels: [{ fromFrame: 9, into: ["air"], requiresHit: true }],
} as const satisfies AttackDefinition;

export const MECH_AIR_2 = {
  id: "mech-air-2",
  tags: ["melee", "air"],
  startupFrames: 6,
  activeFrames: 4,
  recoveryFrames: 13,
  damage: 65,
  hitStunFrames: 28,
  hitStopFrames: 5,
  knockback: 90,
  launchVelocity: 120,
  selfVerticalVelocity: 450,
  groundSlam: false,
  forwardImpulse: 125,
  hitbox: {
    forwardOffset: 60,
    radius: 76,
    minimumElevation: -32,
    maximumElevation: 140,
  },
  cancels: [{ fromFrame: 10, into: ["finisher"], requiresHit: true }],
} as const satisfies AttackDefinition;

export const MECH_AIR_COMBO = {
  id: MECH_AIR_CHAIN_ID,
  attacks: [MECH_AIR_1.id, MECH_AIR_2.id],
} as const satisfies ComboChain;
