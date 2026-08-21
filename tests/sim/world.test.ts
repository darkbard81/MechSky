import { describe, expect, it } from "vitest";
import { HANGAR_TEST_BATTLE, PLAYER_FIGHTER_ID } from "../../src/content/arenas/hangar-test";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import { vectorLength } from "../../src/sim/math/vector2";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import { SIMULATION_HZ, SimulationWorld } from "../../src/sim/world/world";

function move(x: number, y: number): CommandIntent {
  return {
    type: "move",
    fighterId: PLAYER_FIGHTER_ID,
    direction: { x, y },
  };
}

function openArenaRecipe(): BattleRecipe {
  return {
    ...HANGAR_TEST_BATTLE,
    arena: { center: { x: 0, y: 0 }, radius: 10_000 },
    player: {
      ...HANGAR_TEST_BATTLE.player,
      spawn: { x: 0, y: 0, elevation: 0 },
    },
  };
}

describe("SimulationWorld", () => {
  it("keeps independent previous and current snapshots for interpolation", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);

    world.step([move(1, 0)]);
    world.step([move(1, 0)]);

    const frame = world.getFrame();
    expect(frame.previous.tick).toBe(1);
    expect(frame.previous.elapsedSeconds).toBe(1 / SIMULATION_HZ);
    expect(frame.current.tick).toBe(2);
    expect(frame.current.elapsedSeconds).toBe(2 / SIMULATION_HZ);
    expect(frame.previous.player.body.position.x).toBeLessThan(
      frame.current.player.body.position.x,
    );
    expect(frame.previous.player.body.position).not.toBe(
      frame.current.player.body.position,
    );
  });

  it("freezes exposed snapshots and keeps the authoritative tick private", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const snapshot = world.getFrame().current;
    const mutableTick = snapshot as unknown as { tick: number };
    const mutablePosition = snapshot.player.body.position as {
      x: number;
    };

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.player.body.position)).toBe(true);
    expect(() => {
      mutableTick.tick = 999;
    }).toThrow(TypeError);
    expect(() => {
      mutablePosition.x = 999;
    }).toThrow(TypeError);

    world.step();
    expect(world.getFrame().current.tick).toBe(1);
  });

  it("normalizes diagonal movement to the same top speed as a straight line", () => {
    const straight = new SimulationWorld(openArenaRecipe());
    const diagonal = new SimulationWorld(openArenaRecipe());

    for (let tick = 0; tick < 120; tick += 1) {
      straight.step([move(1, 0)]);
      diagonal.step([move(1, 1)]);
    }

    const straightSpeed = vectorLength(straight.getFrame().current.player.body.velocity);
    const diagonalSpeed = vectorLength(
      diagonal.getFrame().current.player.body.velocity,
    );
    expect(straightSpeed).toBeCloseTo(HANGAR_TEST_BATTLE.player.movement.maximumSpeed);
    expect(diagonalSpeed).toBeCloseTo(straightSpeed);
  });

  it("accelerates, decelerates, and keeps a normalized facing direction", () => {
    const world = new SimulationWorld(openArenaRecipe());

    world.step([move(-1, -1)]);
    const moving = world.getFrame().current.player;
    expect(moving.state).toBe("moving");
    expect(vectorLength(moving.facing)).toBeCloseTo(1);
    expect(moving.facing.x).toBeLessThan(0);
    expect(moving.facing.y).toBeLessThan(0);

    world.step([move(0, 0)]);
    expect(world.getFrame().current.player.state).toBe("idle");
    expect(world.getFrame().current.player.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it("keeps the entire body inside the circular arena and removes outward speed", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);

    for (let tick = 0; tick < 240; tick += 1) {
      world.step([move(1, 0)]);
    }

    const player = world.getFrame().current.player;
    const maximumDistance =
      HANGAR_TEST_BATTLE.arena.radius - HANGAR_TEST_BATTLE.player.radius;
    const position = player.body.position;
    const distance = Math.hypot(position.x, position.y);
    const outwardVelocity =
      player.body.velocity.x * (position.x / distance) +
      player.body.velocity.y * (position.y / distance);

    expect(distance).toBeLessThanOrEqual(maximumDistance + 1e-9);
    expect(outwardVelocity).toBeLessThanOrEqual(1e-9);
  });

  it("runs dash for exact ticks and rejects it during cooldown", () => {
    const world = new SimulationWorld(openArenaRecipe());
    const dash: CommandIntent = {
      type: "search-dash",
      fighterId: PLAYER_FIGHTER_ID,
      pressed: true,
      held: true,
    };

    world.step([move(1, 0), dash]);
    expect(world.getFrame().current.player.state).toBe("dashing");
    expect(vectorLength(world.getFrame().current.player.body.velocity)).toBe(
      HANGAR_TEST_BATTLE.player.movement.dashSpeed,
    );
    expect(world.getFrame().current.player.dashSequence).toBe(1);
    expect(world.getFrame().current.player.dashCooldownTicks).toBe(48);

    for (let tick = 2; tick <= 10; tick += 1) {
      world.step([move(1, 0)]);
      expect(world.getFrame().current.player.state).toBe("dashing");
    }

    world.step([move(1, 0), dash]);
    expect(world.getFrame().current.player.state).toBe("moving");
    expect(world.getFrame().current.player.dashSequence).toBe(1);

    while (world.getFrame().current.tick < 49) {
      world.step([move(1, 0)]);
    }
    world.step([move(1, 0), dash]);
    expect(world.getFrame().current.player.dashSequence).toBe(2);
    expect(world.getFrame().current.player.state).toBe("dashing");
  });

  it("keeps facing aligned with dash velocity until dash ends", () => {
    const world = new SimulationWorld(openArenaRecipe());
    const dash: CommandIntent = {
      type: "search-dash",
      fighterId: PLAYER_FIGHTER_ID,
      pressed: true,
      held: true,
    };

    world.step([move(1, 0), dash]);
    world.step([move(-1, 0)]);

    const player = world.getFrame().current.player;
    expect(player.state).toBe("dashing");
    expect(player.facing).toEqual({ x: 1, y: 0 });
    expect(player.body.velocity.x).toBeGreaterThan(0);
  });

  it("toggles the target lock only from a lock intent", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const lock: CommandIntent = {
      type: "lock-target",
      fighterId: PLAYER_FIGHTER_ID,
    };

    world.step([lock]);
    expect(world.getFrame().current.player.lockedTargetId).toBe(
      HANGAR_TEST_BATTLE.enemy.id,
    );
    world.step([]);
    expect(world.getFrame().current.player.lockedTargetId).toBe(
      HANGAR_TEST_BATTLE.enemy.id,
    );
    world.step([lock]);
    expect(world.getFrame().current.player.lockedTargetId).toBeNull();
  });

  it("rejects non-finite values and a spawn outside the movement boundary", () => {
    expect(
      () =>
        new SimulationWorld({
          ...HANGAR_TEST_BATTLE,
          arena: { ...HANGAR_TEST_BATTLE.arena, radius: Number.NaN },
        }),
    ).toThrow(/Arena radius/);

    expect(
      () =>
        new SimulationWorld({
          ...HANGAR_TEST_BATTLE,
          player: {
            ...HANGAR_TEST_BATTLE.player,
            spawn: { x: 379, y: 0, elevation: 0 },
          },
        }),
    ).toThrow(/spawn/);
  });

  it("rejects an unusable search range, combo window, weapon, or loadout slot", () => {
    for (const searchRange of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () =>
          new SimulationWorld({
            ...HANGAR_TEST_BATTLE,
            combat: { ...HANGAR_TEST_BATTLE.combat, searchRange },
          }),
      ).toThrow(/search range/iu);
    }

    expect(
      () =>
        new SimulationWorld({
          ...HANGAR_TEST_BATTLE,
          combat: { ...HANGAR_TEST_BATTLE.combat, comboSessionIdleFrames: 0 },
        }),
    ).toThrow(/combo session/iu);

    expect(
      () =>
        new SimulationWorld({
          ...HANGAR_TEST_BATTLE,
          player: {
            ...HANGAR_TEST_BATTLE.player,
            loadout: {
              ...HANGAR_TEST_BATTLE.player.loadout,
              "long-range": { A: "no-such-weapon", B: null, C: null },
            },
          },
        }),
    ).toThrow(/no-such-weapon/);

    expect(
      () =>
        new SimulationWorld({
          ...HANGAR_TEST_BATTLE,
          combat: {
            ...HANGAR_TEST_BATTLE.combat,
            weapons: {
              weapons: {
                ...HANGAR_TEST_BATTLE.combat.weapons.weapons,
                "mech-basic-combo": {
                  id: "mech-basic-combo",
                  entryChains: { grounded: "no-such-chain", airborne: null },
                },
              },
            },
          },
        }),
    ).toThrow(/no-such-chain/);
  });

  it("tracks the combat target and its planar distance every tick", () => {
    const world = new SimulationWorld(HANGAR_TEST_BATTLE);
    const initial = world.getFrame().current;
    const { player, enemy } = initial;
    const expected = Math.hypot(
      HANGAR_TEST_BATTLE.enemy.spawn.x - HANGAR_TEST_BATTLE.player.spawn.x,
      HANGAR_TEST_BATTLE.enemy.spawn.y - HANGAR_TEST_BATTLE.player.spawn.y,
    );

    expect(player.combatTargetId).toBe(enemy.id);
    expect(player.combatTargetDistance).toBeCloseTo(expected, 6);
    expect(enemy.combatTargetId).toBe(player.id);

    world.step([move(1, 0)]);
    const moved = world.getFrame().current;
    const currentDistance = Math.hypot(
      moved.enemy.body.position.x - moved.player.body.position.x,
      moved.enemy.body.position.y - moved.player.body.position.y,
    );

    expect(moved.player.body.position).not.toEqual(initial.player.body.position);
    expect(moved.player.combatTargetDistance).toBeCloseTo(currentDistance, 6);
    expect(moved.enemy.combatTargetDistance).toBeCloseTo(currentDistance, 6);
    expect(moved.player.combatTargetDistance).not.toBeCloseTo(expected, 6);
  });
});
