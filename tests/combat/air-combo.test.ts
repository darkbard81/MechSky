import { describe, expect, it } from "vitest";
import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import type { HitLandedEvent, SimEvent } from "../../src/sim/world/sim-event";
import { SimulationWorld, type SimulationSnapshot } from "../../src/sim/world/world";

const PRIMARY: CommandIntent = {
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  slot: 0,
};
const SPECIAL: CommandIntent = {
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  slot: 1,
};
const CHASE: CommandIntent = {
  type: "dash",
  fighterId: PLAYER_FIGHTER_ID,
};

function comboRecipe(): BattleRecipe {
  return {
    ...HANGAR_TEST_BATTLE,
    player: {
      ...HANGAR_TEST_BATTLE.player,
      spawn: { x: 0, y: 0, elevation: 0 },
    },
    enemy: {
      ...HANGAR_TEST_BATTLE.enemy,
      spawn: { x: 100, y: 0, elevation: 0 },
    },
  };
}

function step(
  world: SimulationWorld,
  intents: readonly CommandIntent[] = [],
): readonly SimEvent[] {
  world.step(intents);
  return world.drainEvents();
}

function advanceUntil(
  world: SimulationWorld,
  predicate: (snapshot: SimulationSnapshot, events: readonly SimEvent[]) => boolean,
  maximumTicks = 240,
): SimEvent[] {
  const collected: SimEvent[] = [];

  for (let elapsed = 0; elapsed < maximumTicks; elapsed += 1) {
    const events = step(world);
    collected.push(...events);
    if (predicate(world.getFrame().current, events)) {
      return collected;
    }
  }

  throw new Error(
    `Condition was not reached within ${maximumTicks} ticks: ${JSON.stringify(world.getFrame().current)}`,
  );
}

function waitForCancelableFrame(
  world: SimulationWorld,
  attackId: string,
  minimumFrame: number,
): SimEvent[] {
  return advanceUntil(
    world,
    ({ player }) =>
      player.attackId === attackId &&
      player.actionFrame >= minimumFrame &&
      player.hitStopFrames === 0,
  );
}

function hitIds(events: readonly SimEvent[]): string[] {
  return events
    .filter((event): event is HitLandedEvent => event.type === "hit-landed")
    .map(({ attackId }) => attackId);
}

describe("M3 launcher and air combo", () => {
  it("executes J J K Shift J J K through launch, chase, finisher, and wake-up", () => {
    const world = new SimulationWorld(comboRecipe());
    const events: SimEvent[] = [];

    events.push(...step(world, [PRIMARY]));
    events.push(...waitForCancelableFrame(world, "mech-ground-1", 10));
    events.push(...step(world, [PRIMARY]));

    events.push(...waitForCancelableFrame(world, "mech-ground-2", 13));
    events.push(...step(world, [SPECIAL]));

    events.push(
      ...advanceUntil(world, (_snapshot, tickEvents) =>
        hitIds(tickEvents).includes("mech-launcher"),
      ),
    );
    expect(world.getFrame().current.enemy.locomotion).toBe("airborne");
    expect(world.getFrame().current.enemy.body.verticalVelocity).toBeGreaterThan(0);

    events.push(...waitForCancelableFrame(world, "mech-launcher", 11));
    events.push(...step(world, [CHASE]));
    expect(world.getFrame().current.player.homingTargetId).toBe(
      world.getFrame().current.enemy.id,
    );

    events.push(
      ...advanceUntil(world, ({ player, enemy }) => {
        const planeDistance = Math.hypot(
          player.body.position.x - enemy.body.position.x,
          player.body.position.y - enemy.body.position.y,
        );
        const elevationDistance = Math.abs(
          player.body.position.elevation - enemy.body.position.elevation,
        );
        return planeDistance < 105 && elevationDistance < 58;
      }),
    );
    events.push(...step(world, [PRIMARY]));

    events.push(
      ...advanceUntil(world, (_snapshot, tickEvents) =>
        hitIds(tickEvents).includes("mech-air-1"),
      ),
    );
    events.push(...waitForCancelableFrame(world, "mech-air-1", 9));
    events.push(...step(world, [PRIMARY]));

    events.push(
      ...advanceUntil(world, (_snapshot, tickEvents) =>
        hitIds(tickEvents).includes("mech-air-2"),
      ),
    );
    events.push(...waitForCancelableFrame(world, "mech-air-2", 10));
    expect(world.getFrame().current.player.locomotion).toBe("airborne");
    expect(world.getFrame().current.enemy.locomotion).toBe("airborne");
    events.push(...step(world, [SPECIAL]));
    expect(world.getFrame().current.player.attackId).toBe("mech-finisher");

    events.push(
      ...advanceUntil(world, (_snapshot, tickEvents) =>
        hitIds(tickEvents).includes("mech-finisher"),
      ),
    );
    expect(world.getFrame().current.enemy.body.verticalVelocity).toBeLessThan(0);

    let minimumEnemyElevation = Number.POSITIVE_INFINITY;
    events.push(
      ...advanceUntil(world, ({ enemy }, tickEvents) => {
        minimumEnemyElevation = Math.min(
          minimumEnemyElevation,
          enemy.body.position.elevation,
        );
        return tickEvents.some((event) => event.type === "ground-impact");
      }),
    );

    expect(minimumEnemyElevation).toBeGreaterThanOrEqual(0);
    expect(world.getFrame().current.enemy.locomotion).toBe("downed");
    const downedTick = world.getFrame().current.tick;
    expect(hitIds(events)).toEqual([
      "mech-ground-1",
      "mech-ground-2",
      "mech-launcher",
      "mech-air-1",
      "mech-air-2",
      "mech-finisher",
    ]);
    expect(events.some((event) => event.type === "homing-started")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "ground-impact" &&
          event.fighterId === world.getFrame().current.enemy.id,
      ),
    ).toBe(true);

    const wakeEvents = advanceUntil(world, (_snapshot, tickEvents) =>
      tickEvents.some((event) => event.type === "fighter-woke-up"),
    );
    expect(wakeEvents.some((event) => event.type === "fighter-woke-up")).toBe(true);
    expect(world.getFrame().current.tick - downedTick).toBe(
      HANGAR_TEST_BATTLE.combat.downedFrames,
    );
    expect(world.getFrame().current.enemy.locomotion).toBe("grounded");
    expect(world.getFrame().current.player.locomotion).toBe("grounded");
  });

  it("lands a launched fighter cleanly when no finisher marks a ground slam", () => {
    const world = new SimulationWorld(comboRecipe());
    const events: SimEvent[] = [...step(world, [SPECIAL])];

    events.push(
      ...advanceUntil(world, (_snapshot, tickEvents) =>
        hitIds(tickEvents).includes("mech-launcher"),
      ),
    );
    expect(world.getFrame().current.enemy.locomotion).toBe("airborne");

    let minimumElevation = world.getFrame().current.enemy.body.position.elevation;
    events.push(
      ...advanceUntil(world, ({ enemy }, tickEvents) => {
        minimumElevation = Math.min(minimumElevation, enemy.body.position.elevation);
        return tickEvents.some(
          (event) =>
            event.type === "fighter-landed" && event.fighterId === enemy.id,
        );
      }),
    );

    expect(minimumElevation).toBeGreaterThanOrEqual(0);
    expect(world.getFrame().current.enemy.body.position.elevation).toBe(0);
    expect(world.getFrame().current.enemy.body.verticalVelocity).toBe(0);
    expect(world.getFrame().current.enemy.locomotion).toBe("grounded");
    expect(events.some((event) => event.type === "ground-impact")).toBe(false);
  });

  it("does not let a ground hit reach a target above its height interval", () => {
    const recipe = comboRecipe();
    const world = new SimulationWorld({
      ...recipe,
      enemy: {
        ...recipe.enemy,
        spawn: { ...recipe.enemy.spawn, elevation: 260 },
      },
    });

    const events: SimEvent[] = [...step(world, [PRIMARY])];
    events.push(...advanceUntil(world, ({ player }) => player.actionKind === "none"));

    expect(hitIds(events)).toEqual([]);
    expect(world.getFrame().current.enemy.health).toBe(recipe.enemy.health);
  });

  it("lets an air hit connect only when the vertical intervals overlap", () => {
    const recipe = comboRecipe();
    const overlappingWorld = new SimulationWorld({
      ...recipe,
      player: {
        ...recipe.player,
        spawn: { ...recipe.player.spawn, elevation: 220 },
      },
      enemy: {
        ...recipe.enemy,
        spawn: { ...recipe.enemy.spawn, elevation: 220 },
      },
    });
    const separatedWorld = new SimulationWorld({
      ...recipe,
      player: {
        ...recipe.player,
        spawn: { ...recipe.player.spawn, elevation: 100 },
      },
      enemy: {
        ...recipe.enemy,
        spawn: { ...recipe.enemy.spawn, elevation: 400 },
      },
    });

    const overlappingEvents: SimEvent[] = [
      ...step(overlappingWorld, [PRIMARY]),
    ];
    overlappingEvents.push(
      ...advanceUntil(
        overlappingWorld,
        ({ player }) => player.actionKind === "none",
      ),
    );

    const separatedEvents: SimEvent[] = [...step(separatedWorld, [PRIMARY])];
    separatedEvents.push(
      ...advanceUntil(
        separatedWorld,
        ({ player }) => player.actionKind === "none",
      ),
    );

    expect(hitIds(overlappingEvents)).toEqual(["mech-air-1"]);
    expect(overlappingWorld.getFrame().current.enemy.health).toBeLessThan(
      recipe.enemy.health,
    );
    expect(hitIds(separatedEvents)).toEqual([]);
    expect(separatedWorld.getFrame().current.enemy.health).toBe(
      recipe.enemy.health,
    );
  });
});
