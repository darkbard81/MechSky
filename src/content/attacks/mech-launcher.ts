import type {
  AttackDefinition,
  ComboChain,
} from "../../sim/combat/attack-definition";

export const MECH_LAUNCHER_CHAIN_ID = "mech-launcher";

export const MECH_LAUNCHER = {
  id: "mech-launcher",
  tags: ["melee", "ground", "launcher"],
  startupFrames: 7,
  activeFrames: 4,
  recoveryFrames: 15,
  damage: 75,
  hitStunFrames: 38,
  hitStopFrames: 7,
  knockback: 72,
  launchVelocity: 780,
  selfVerticalVelocity: 0,
  groundSlam: false,
  forwardImpulse: 135,
  hitbox: {
    forwardOffset: 62,
    radius: 70,
    minimumElevation: 0,
    maximumElevation: 145,
  },
  cancels: [{ fromFrame: 11, into: ["dash"], requiresHit: true }],
} as const satisfies AttackDefinition;

export const MECH_LAUNCHER_CHAIN = {
  id: MECH_LAUNCHER_CHAIN_ID,
  attacks: [MECH_LAUNCHER.id],
} as const satisfies ComboChain;
