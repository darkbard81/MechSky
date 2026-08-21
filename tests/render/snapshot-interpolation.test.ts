import { describe, expect, it } from "vitest";
import { HANGAR_TEST_BATTLE, PLAYER_FIGHTER_ID } from "../../src/content/arenas/hangar-test";
import { actorGroundSortKey } from "../../src/render/actors/ground-sort";
import { SmoothCamera } from "../../src/render/camera/smooth-camera";
import { resolveBattleCameraTarget } from "../../src/render/camera/battle-camera-target";
import {
  createBattlePresentation,
  interpolateSimulationFrame,
} from "../../src/render/snapshot-interpolation";
import { hashSimulationSnapshot } from "../../src/sim/replay/battle-replay";
import { SimulationWorld } from "../../src/sim/world/world";

describe("snapshot presentation", () => {
  it("interpolates continuous body values and takes discrete state from current", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    world.step([
      {
        type: "move",
        fighterId: PLAYER_FIGHTER_ID,
        direction: { x: 1, y: 0 },
      },
    ]);
    const frame = world.getFrame();
    const halfway = interpolateSimulationFrame(frame, 0.5);

    expect(halfway.player.body.position.x).toBeCloseTo(
      (frame.previous.player.body.position.x + frame.current.player.body.position.x) /
        2,
    );
    expect(halfway.player.body.velocity.x).toBeCloseTo(
      frame.current.player.body.velocity.x / 2,
    );
    expect(halfway.player.body.verticalVelocity).toBeCloseTo(
      (frame.previous.player.body.verticalVelocity +
        frame.current.player.body.verticalVelocity) /
        2,
    );
    expect(halfway.player.state).toBe(frame.current.player.state);
  });

  it("sorts actors by ground y rather than elevation-adjusted sprite y", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const player = world.getFrame().current.player;
    const elevated = {
      ...player,
      body: {
        ...player.body,
        position: { ...player.body.position, elevation: 500 },
      },
    };

    expect(actorGroundSortKey(elevated)).toBe(player.body.position.y);
  });

  it("snaps on first camera frame, then follows with time-correct smoothing", () => {
    const camera = new SmoothCamera(8);
    expect(camera.follow({ x: 100, y: 40 }, 0)).toEqual({ x: 100, y: 40 });

    const afterOneTenth = camera.follow({ x: 200, y: 40 }, 0.05);
    const afterTwoTenths = camera.follow({ x: 200, y: 40 }, 0.05);
    expect(afterOneTenth.x).toBeGreaterThan(100);
    expect(afterTwoTenths.x).toBeGreaterThan(afterOneTenth.x);
    expect(afterTwoTenths.x).toBeLessThan(200);
    expect(afterTwoTenths.y).toBe(40);
  });

  it("frames both fighters upward while either fighter is airborne", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const grounded = world.getFrame().current;
    const airborne = {
      ...grounded,
      player: {
        ...grounded.player,
        locomotion: "airborne" as const,
        body: {
          ...grounded.player.body,
          position: { ...grounded.player.body.position, elevation: 180 },
        },
      },
      enemy: {
        ...grounded.enemy,
        locomotion: "airborne" as const,
        body: {
          ...grounded.enemy.body,
          position: { ...grounded.enemy.body.position, elevation: 240 },
        },
      },
    };

    const groundTarget = resolveBattleCameraTarget(grounded);
    const airTarget = resolveBattleCameraTarget(airborne);

    expect(airTarget.x).toBeCloseTo(
      (airborne.player.body.position.x + airborne.enemy.body.position.x) / 2,
    );
    expect(airTarget.y).toBeLessThan(groundTarget.y);
  });
});

describe("state hash source", () => {
  it("pairs the interpolated view with the authoritative tick state", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    world.step([
      {
        type: "move",
        fighterId: PLAYER_FIGHTER_ID,
        direction: { x: 1, y: 0 },
      },
    ]);
    const frame = world.getFrame();
    const presentation = createBattlePresentation(frame, 0.5);

    expect(presentation.authoritativeSnapshot).toBe(frame.current);
    expect(hashSimulationSnapshot(presentation.authoritativeSnapshot)).toBe(
      hashSimulationSnapshot(frame.current),
    );
    expect(hashSimulationSnapshot(presentation.viewSnapshot)).not.toBe(
      hashSimulationSnapshot(frame.current),
    );
  });
});
