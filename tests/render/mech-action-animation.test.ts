import { describe, expect, it } from "vitest";
import { HANGAR_TEST_BATTLE } from "../../src/content/arenas/hangar-test";
import { resolveMechFrame } from "../../src/render/animation/mech-action-animation";
import {
  SimulationWorld,
  type FighterSnapshot,
} from "../../src/sim/world/world";

const BASE_FIGHTER = new SimulationWorld(HANGAR_TEST_BATTLE).getFrame().current.player;

function fighter(overrides: Partial<FighterSnapshot>): FighterSnapshot {
  return { ...BASE_FIGHTER, ...overrides };
}

describe("mech action animation", () => {
  it("uses simulation ticks for idle and move loops", () => {
    expect(
      resolveMechFrame(fighter({ state: "idle", facing: { x: 0, y: 1 } }), 24),
    ).toMatchObject({
      sheet: "idle",
      frameIndex: 2,
    });
    expect(resolveMechFrame(fighter({ state: "moving" }), 20)).toMatchObject({
      sheet: "move",
      frameIndex: 5,
    });
  });

  it("maps both grounded attacks to their own startup, active, and recovery frames", () => {
    expect(
      resolveMechFrame(
        fighter({
          actionKind: "attack",
          attackId: "mech-ground-1",
          actionDuration: 23,
          attackPhase: "startup",
          actionFrame: 5,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "groundCombo", frameIndex: 0 });
    expect(
      resolveMechFrame(
        fighter({
          actionKind: "attack",
          attackId: "mech-ground-1",
          actionDuration: 23,
          attackPhase: "active",
          actionFrame: 8,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "groundCombo", frameIndex: 2 });
    expect(
      resolveMechFrame(
        fighter({
          actionKind: "attack",
          attackId: "mech-ground-2",
          actionDuration: 33,
          attackPhase: "recovery",
          actionFrame: 13,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "groundCombo", frameIndex: 7 });
  });

  it("selects launcher, air combo, and finisher art by action frame", () => {
    expect(
      resolveMechFrame(
        fighter({
          attackId: "mech-launcher",
          actionDuration: 26,
          attackPhase: "active",
          actionFrame: 9,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "launcher", frameIndex: 3 });
    expect(
      resolveMechFrame(
        fighter({
          attackId: "mech-air-2",
          actionDuration: 23,
          attackPhase: "active",
          actionFrame: 7,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "airCombo", frameIndex: 4 });
    expect(
      resolveMechFrame(
        fighter({
          attackId: "mech-finisher",
          actionDuration: 30,
          attackPhase: "recovery",
          actionFrame: 29,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "finisher", frameIndex: 5 });
  });

  it("keeps an attack pose frozen while hit-stop holds actionFrame", () => {
    const stopped = fighter({
      attackId: "mech-launcher",
      actionDuration: 26,
      attackPhase: "active",
      actionFrame: 8,
      hitStopFrames: 5,
    });

    expect(resolveMechFrame(stopped, 100)).toEqual(resolveMechFrame(stopped, 107));
  });

  it("uses hurt, falling knockdown, and grounded knockdown frames", () => {
    expect(
      resolveMechFrame(
        fighter({ actionKind: "hitstun", actionFrame: 9 }),
        0,
      ),
    ).toMatchObject({ sheet: "hurt", frameIndex: 2 });
    expect(
      resolveMechFrame(
        fighter({
          actionKind: "hitstun",
          actionFrame: 9,
          locomotion: "airborne",
          groundSlamPending: true,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "knockdown", frameIndex: 2 });
    expect(
      resolveMechFrame(
        fighter({
          locomotion: "downed",
          state: "downed",
          downedFrames: 8,
          downedDurationFrames: 48,
        }),
        0,
      ),
    ).toMatchObject({ sheet: "knockdown", frameIndex: 5 });
  });

  it("mirrors right-facing action sheets without mirroring directional idle", () => {
    expect(
      resolveMechFrame(
        fighter({
          facing: { x: -1, y: 0 },
          attackId: "mech-air-1",
          actionDuration: 20,
          attackPhase: "startup",
        }),
        0,
      ).horizontalScale,
    ).toBe(-1);
    expect(
      resolveMechFrame(fighter({ facing: { x: -1, y: 0 }, state: "idle" }), 0)
        .horizontalScale,
    ).toBe(1);
  });
});
