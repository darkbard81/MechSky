import { describe, expect, it } from "vitest";
import { HANGAR_TEST_BATTLE, PLAYER_FIGHTER_ID } from "../../src/content/arenas/hangar-test";
import { actorGroundSortKey } from "../../src/render/actors/ground-sort";
import { SmoothCamera } from "../../src/render/camera/smooth-camera";
import { interpolateSimulationFrame } from "../../src/render/snapshot-interpolation";
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
});
