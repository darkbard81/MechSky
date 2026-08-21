import { describe, expect, it } from "vitest";
import {
  combatTargetDistance,
  resolveCombatTarget,
} from "../../src/sim/combat/combat-target";
import { createComboSession } from "../../src/sim/combat/combo-session";
import { MECH_PLAYER_LOADOUT } from "../../src/content/weapons/mech-loadouts";
import {
  createIdleAction,
  type EntityId,
  type Fighter,
} from "../../src/sim/world/entity";

interface FighterOptions {
  readonly id: EntityId;
  readonly x?: number;
  readonly y?: number;
  readonly elevation?: number;
  readonly health?: number;
  readonly lockedTargetId?: EntityId | null;
}

function fighter(options: FighterOptions): Fighter {
  return {
    id: options.id,
    body: {
      position: {
        x: options.x ?? 0,
        y: options.y ?? 0,
        elevation: options.elevation ?? 0,
      },
      velocity: { x: 0, y: 0 },
      verticalVelocity: 0,
      radius: 28,
      bodyHeight: 112,
    },
    movement: {
      acceleration: 1,
      deceleration: 1,
      maximumSpeed: 1,
      dashSpeed: 2,
      dashDurationTicks: 1,
      dashCooldownTicks: 1,
    },
    maximumHealth: 100,
    health: options.health ?? 100,
    facing: { x: 1, y: 0 },
    dashDirection: { x: 1, y: 0 },
    dashEndExclusiveTick: 0,
    dashReadyTick: 0,
    dashSequence: 0,
    lockedTargetId: options.lockedTargetId ?? null,
    locomotion: "grounded",
    state: "idle",
    action: createIdleAction(),
    hitStopFrames: 0,
    attackBufferFrames: 0,
    bufferedAttack: null,
    comboHits: 0,
    comboResetFrames: 0,
    loadout: MECH_PLAYER_LOADOUT,
    comboSession: createComboSession(),
    searchDashHeld: false,
    combatTargetId: null,
    combatTargetDistance: null,
    homingTargetId: null,
    homingEndExclusiveTick: 0,
    groundSlamPending: false,
    downedFrames: 0,
  };
}

describe("combat target", () => {
  it("prefers a valid locked target over the rest of the roster", () => {
    const self = fighter({ id: 1, lockedTargetId: 3 });
    const near = fighter({ id: 2, x: 10 });
    const locked = fighter({ id: 3, x: 900 });

    expect(resolveCombatTarget(self, [self, near, locked])?.id).toBe(3);
  });

  it("falls back to the first live opponent when the lock is invalid", () => {
    const missingLock = fighter({ id: 1, lockedTargetId: 99 });
    const defeatedLock = fighter({ id: 1, lockedTargetId: 3 });
    const opponent = fighter({ id: 2, x: 10 });
    const defeated = fighter({ id: 3, health: 0 });

    expect(resolveCombatTarget(missingLock, [missingLock, opponent])?.id).toBe(2);
    expect(
      resolveCombatTarget(defeatedLock, [defeatedLock, opponent, defeated])?.id,
    ).toBe(2);
  });

  it("never targets itself and reports none when every opponent is down", () => {
    const self = fighter({ id: 1 });
    const defeated = fighter({ id: 2, health: 0 });

    expect(resolveCombatTarget(self, [self])).toBeNull();
    expect(resolveCombatTarget(self, [self, defeated])).toBeNull();
  });

  it("measures planar ground gap and ignores elevation", () => {
    const self = fighter({ id: 1 });
    const grounded = fighter({ id: 2, x: 30, y: 40 });
    const launched = fighter({ id: 3, x: 30, y: 40, elevation: 500 });

    expect(combatTargetDistance(self, grounded)).toBe(50);
    expect(combatTargetDistance(self, launched)).toBe(50);
  });
});
