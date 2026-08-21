import { describe, expect, it } from "vitest";
import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import {
  debugLayerForCode,
  formatCombatDebugLines,
  formatUsedLoadoutSlots,
  isDebugLayerName,
} from "../../src/render/debug/debug-layers";
import { hashSimulationSnapshot } from "../../src/sim/replay/battle-replay";
import { SimulationWorld } from "../../src/sim/world/world";
import {
  cameraShakeMotionScale,
  REDUCED_MOTION_SHAKE_SCALE,
} from "../../src/render/camera/camera-shake";

describe("debug overlay controls", () => {
  it("maps world, combat, and performance layers without accepting arbitrary values", () => {
    expect(debugLayerForCode("F1")).toBe("collision");
    expect(debugLayerForCode("F2")).toBe("hitbox");
    expect(debugLayerForCode("F4")).toBe("velocity");
    expect(debugLayerForCode("F7")).toBe("combat");
    expect(debugLayerForCode("F8")).toBe("performance");
    expect(debugLayerForCode("KeyZ")).toBeNull();
    expect(isDebugLayerName("performance")).toBe(true);
    expect(isDebugLayerName("renderer-state")).toBe(false);
  });
});

describe("reduced motion presentation", () => {
  it("keeps feedback but reduces camera displacement to one fifth", () => {
    expect(cameraShakeMotionScale(false)).toBe(1);
    expect(cameraShakeMotionScale(true)).toBe(REDUCED_MOTION_SHAKE_SCALE);
    expect(REDUCED_MOTION_SHAKE_SCALE).toBe(0.2);
  });
});

describe("combat debug panel", () => {
  it("shows target, preferred context, slot, chain, and combo session state", () => {
    const world = new SimulationWorld({
      ...HANGAR_TEST_BATTLE,
      player: { ...HANGAR_TEST_BATTLE.player, spawn: { x: 0, y: 0, elevation: 0 } },
      enemy: { ...HANGAR_TEST_BATTLE.enemy, spawn: { x: 100, y: 0, elevation: 0 } },
      enemyAi: { ...HANGAR_TEST_BATTLE.enemyAi, reactionDelayFrames: 10_000 },
    });
    world.step([
      { type: "attack", fighterId: PLAYER_FIGHTER_ID, button: "A" },
      {
        type: "search-dash",
        fighterId: PLAYER_FIGHTER_ID,
        pressed: false,
        held: true,
      },
    ]);
    const snapshot = world.getFrame().current;
    const lines = formatCombatDebugLines(snapshot);

    // The panel reads the snapshot; it never recomputes a gameplay decision.
    expect(lines[0]).toBe(`TICK 1  HASH ${hashSimulationSnapshot(snapshot)}`);
    expect(lines[4]).toBe("TGT 2 98/180  SD D-");
    expect(lines[5]).toBe("BUF ----  SLOT SD-A mech-basic-combo");
    expect(lines[6]).toBe("CHAIN mech-ground #0");
    expect(lines[7]).toBe("USED ...#........  COMBO open");
  });

  it("draws the twelve mounting positions in SR-A to ND-C order", () => {
    expect(formatUsedLoadoutSlots(0)).toBe("............");
    expect(formatUsedLoadoutSlots(0b1)).toBe("#...........");
    expect(formatUsedLoadoutSlots(1 << 11)).toBe("...........#");
  });
});
