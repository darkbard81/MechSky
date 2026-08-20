import type { FighterSnapshot } from "../../sim/world/world";
import {
  DIRECTIONAL_IDLE_FRAME_COUNT,
  resolveDirectionalIdleFrameAddress,
} from "../actors/directional-idle";

export type MechAnimationSheet =
  | "idle"
  | "move"
  | "groundCombo"
  | "launcher"
  | "airCombo"
  | "finisher"
  | "hurt"
  | "knockdown";

export interface MechFrameSelection {
  readonly sheet: MechAnimationSheet;
  readonly frameIndex: number;
  readonly horizontalScale: 1 | -1;
}

const MOVE_TICKS_PER_FRAME = 4;
const HURT_TICKS_PER_FRAME = 4;

function phaseFrame(
  fighter: FighterSnapshot,
  startupFrames: readonly number[],
  activeFrames: readonly number[],
  recoveryFrames: readonly number[],
  activeStart: number,
  recoveryStart: number,
): number {
  const active = fighter.attackPhase === "active";
  const recovery = fighter.attackPhase === "recovery";
  const frames = active ? activeFrames : recovery ? recoveryFrames : startupFrames;
  const phaseStart = recovery ? recoveryStart : active ? activeStart : 0;
  const phaseEnd = recovery
    ? fighter.actionDuration
    : active
      ? recoveryStart
      : activeStart;
  const phaseProgress = Math.min(0.999_999, Math.max(0, fighter.actionFrame - phaseStart) /
    Math.max(1, phaseEnd - phaseStart));
  const index = Math.min(frames.length - 1, Math.floor(phaseProgress * frames.length));
  return frames[index] ?? frames[0] ?? 0;
}

function attackFrame(fighter: FighterSnapshot): MechFrameSelection | null {
  switch (fighter.attackId) {
    case "mech-ground-1":
      return {
        sheet: "groundCombo",
        frameIndex: phaseFrame(fighter, [0], [1, 2], [3], 6, 10),
        horizontalScale: fighter.facing.x < 0 ? -1 : 1,
      };
    case "mech-ground-2":
      return {
        sheet: "groundCombo",
        frameIndex: phaseFrame(fighter, [4], [5, 6], [7], 8, 13),
        horizontalScale: fighter.facing.x < 0 ? -1 : 1,
      };
    case "mech-launcher":
      return {
        sheet: "launcher",
        frameIndex: phaseFrame(fighter, [0, 1], [2, 3], [4, 5], 7, 11),
        horizontalScale: fighter.facing.x < 0 ? -1 : 1,
      };
    case "mech-air-1":
      return {
        sheet: "airCombo",
        frameIndex: phaseFrame(fighter, [0], [1], [2], 5, 9),
        horizontalScale: fighter.facing.x < 0 ? -1 : 1,
      };
    case "mech-air-2":
      return {
        sheet: "airCombo",
        frameIndex: phaseFrame(fighter, [3], [4], [5], 6, 10),
        horizontalScale: fighter.facing.x < 0 ? -1 : 1,
      };
    case "mech-finisher":
      return {
        sheet: "finisher",
        frameIndex: phaseFrame(fighter, [0, 1], [2, 3], [4, 5], 7, 12),
        horizontalScale: fighter.facing.x < 0 ? -1 : 1,
      };
    default:
      return null;
  }
}

export function resolveMechFrame(
  fighter: FighterSnapshot,
  tick: number,
): MechFrameSelection {
  const horizontalScale = fighter.facing.x < 0 ? -1 : 1;
  const attack = attackFrame(fighter);
  if (attack !== null) {
    return attack;
  }

  if (fighter.groundSlamPending || fighter.locomotion === "downed") {
    if (fighter.locomotion !== "downed") {
      return {
        sheet: "knockdown",
        frameIndex: Math.min(2, Math.floor(fighter.actionFrame / 4)),
        horizontalScale,
      };
    }

    const elapsed = Math.max(0, fighter.downedDurationFrames - fighter.downedFrames);
    const durationPerFrame = Math.max(1, Math.ceil(fighter.downedDurationFrames / 3));
    return {
      sheet: "knockdown",
      frameIndex: 3 + Math.min(2, Math.floor(elapsed / durationPerFrame)),
      horizontalScale,
    };
  }

  if (fighter.actionKind === "hitstun") {
    return {
      sheet: "hurt",
      frameIndex: Math.min(3, Math.floor(fighter.actionFrame / HURT_TICKS_PER_FRAME)),
      horizontalScale,
    };
  }

  if (fighter.state === "moving" || fighter.state === "dashing") {
    return {
      sheet: "move",
      frameIndex: Math.floor(Math.max(0, tick) / MOVE_TICKS_PER_FRAME) % 6,
      horizontalScale,
    };
  }

  const idle = resolveDirectionalIdleFrameAddress(fighter.facing, tick, fighter.state);
  return {
    sheet: "idle",
    frameIndex: idle.row * DIRECTIONAL_IDLE_FRAME_COUNT + idle.column,
    horizontalScale: 1,
  };
}
