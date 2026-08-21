import { describe, expect, it } from "vitest";
import { ENEMY_FIGHTER_ID, HANGAR_TEST_BATTLE, PLAYER_FIGHTER_ID } from "../../src/content/arenas/hangar-test";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import type { HitLandedEvent, SimEvent } from "../../src/sim/world/sim-event";
import { SimulationWorld } from "../../src/sim/world/world";

const ATTACK: CommandIntent = {
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  button: "A",
};

/** Player standing just inside the first hit's reach, facing the target. */
function inRangeRecipe(): BattleRecipe {
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

/** Target parked far outside every hitbox, so every swing whiffs. */
function outOfRangeRecipe(): BattleRecipe {
  const recipe = inRangeRecipe();
  return {
    ...recipe,
    enemy: { ...recipe.enemy, spawn: { x: 340, y: 0, elevation: 0 } },
  };
}

function runTicks(
  world: SimulationWorld,
  ticks: number,
  intentsFor: (tick: number) => readonly CommandIntent[] = () => [],
): SimEvent[] {
  const events: SimEvent[] = [];
  for (let tick = 1; tick <= ticks; tick += 1) {
    world.step(intentsFor(tick));
    events.push(...world.drainEvents());
  }
  return events;
}

function hits(events: readonly SimEvent[]): HitLandedEvent[] {
  return events.filter((event): event is HitLandedEvent => event.type === "hit-landed");
}

describe("ground combo", () => {
  it("connects only on the active frames, never during startup", () => {
    const world = new SimulationWorld(inRangeRecipe());
    const events = runTicks(world, 6, (tick) => (tick === 1 ? [ATTACK] : []));

    expect(hits(events)).toHaveLength(0);
    expect(world.getFrame().current.player.attackPhase).toBe("active");

    const landed = hits(runTicks(world, 1));
    expect(landed).toHaveLength(1);
    expect(landed[0]?.attackId).toBe("mech-ground-1");
    expect(landed[0]?.damage).toBe(60);
  });

  it("hits a target once per swing even while the hitbox stays live", () => {
    const world = new SimulationWorld(inRangeRecipe());
    const events = runTicks(world, 30, (tick) => (tick === 1 ? [ATTACK] : []));

    expect(hits(events)).toHaveLength(1);
  });

  it("chains into the second hit when the follow-up lands in the cancel window", () => {
    const world = new SimulationWorld(inRangeRecipe());
    const events = runTicks(world, 60, (tick) =>
      tick === 1 || tick === 12 ? [ATTACK] : [],
    );
    const landed = hits(events);

    expect(landed.map(({ attackId }) => attackId)).toEqual([
      "mech-ground-1",
      "mech-ground-2",
    ]);
    expect(landed[1]?.comboCount).toBe(2);
    expect(landed[1]?.damage).toBe(90);
  });

  it("ignores a follow-up pressed too early for the buffer to survive", () => {
    const world = new SimulationWorld(inRangeRecipe());
    const events = runTicks(world, 60, (tick) =>
      tick === 1 || tick === 2 ? [ATTACK] : [],
    );

    expect(hits(events)).toHaveLength(1);
  });

  it("buffers a follow-up pressed just before the cancel window opens", () => {
    const world = new SimulationWorld(inRangeRecipe());
    const events = runTicks(world, 60, (tick) =>
      tick === 1 || tick === 9 ? [ATTACK] : [],
    );

    expect(hits(events).map(({ attackId }) => attackId)).toEqual([
      "mech-ground-1",
      "mech-ground-2",
    ]);
  });

  it("refuses to chain when the first hit whiffed", () => {
    const world = new SimulationWorld(outOfRangeRecipe());
    const events = runTicks(world, 60, (tick) =>
      tick === 1 || tick === 12 ? [ATTACK] : [],
    );

    expect(hits(events)).toHaveLength(0);
    expect(events.filter(({ type }) => type === "attack-started")).toHaveLength(1);
    expect(events.filter(({ type }) => type === "attack-whiffed")).toHaveLength(1);
  });

  it("freezes both action clocks for the hit-stop while the world keeps ticking", () => {
    const world = new SimulationWorld(inRangeRecipe());
    runTicks(world, 7, (tick) => (tick === 1 ? [ATTACK] : []));

    // The hit tick is itself the first frozen frame, so the counter already
    // reports the three that remain after it.
    const atHit = world.getFrame().current;
    expect(atHit.player.hitStopFrames).toBe(3);
    expect(atHit.enemy.hitStopFrames).toBe(3);
    const frozenFrame = atHit.player.actionFrame;
    expect(frozenFrame).toBe(6);

    runTicks(world, 3);
    const stillFrozen = world.getFrame().current;
    expect(stillFrozen.player.actionFrame).toBe(frozenFrame);
    expect(stillFrozen.tick).toBe(10);
    expect(stillFrozen.player.hitStopFrames).toBe(0);

    runTicks(world, 1);
    expect(world.getFrame().current.player.actionFrame).toBe(frozenFrame + 1);
  });

  it("applies damage, hitstun, and knockback away from the attacker", () => {
    const world = new SimulationWorld(inRangeRecipe());
    runTicks(world, 7, (tick) => (tick === 1 ? [ATTACK] : []));

    const { enemy } = world.getFrame().current;
    expect(enemy.health).toBe(HANGAR_TEST_BATTLE.enemy.health - 60);
    expect(enemy.state).toBe("hitstun");
    expect(enemy.body.velocity.x).toBeGreaterThan(0);
    expect(enemy.body.velocity.y).toBeCloseTo(0, 5);

    runTicks(world, 40);
    expect(world.getFrame().current.enemy.state).toBe("idle");
  });

  it("reports a combo that ended after the idle window", () => {
    const world = new SimulationWorld(inRangeRecipe());
    const events = runTicks(world, 120, (tick) => (tick === 1 ? [ATTACK] : []));
    const ended = events.filter(({ type }) => type === "combo-ended");

    expect(ended).toHaveLength(1);
    expect(world.getFrame().current.player.comboHits).toBe(0);
  });

  it("keeps the enemy alive at zero health and reports it once", () => {
    const world = new SimulationWorld({
      ...inRangeRecipe(),
      enemy: { ...inRangeRecipe().enemy, health: 60 },
    });
    const events = runTicks(world, 40, (tick) => (tick === 1 ? [ATTACK] : []));

    expect(events.filter(({ type }) => type === "target-defeated")).toHaveLength(1);
    expect(world.getFrame().current.enemy.health).toBe(0);
    expect(world.getFrame().current.enemy.state).toBe("downed");
  });

  it("exposes the live hitbox exactly across the active frames on a whiff", () => {
    const world = new SimulationWorld(outOfRangeRecipe());
    const live: number[] = [];

    for (let tick = 1; tick <= 24; tick += 1) {
      world.step(tick === 1 ? [ATTACK] : []);
      world.drainEvents();
      live.push(world.getFrame().current.hitboxes.length);
    }

    expect(live.filter((count) => count > 0)).toHaveLength(4);
    expect(live.slice(5, 9).every((count) => count === 1)).toBe(true);
  });

  it("holds the hitbox on its frozen frame through the hit-stop", () => {
    const world = new SimulationWorld(inRangeRecipe());
    runTicks(world, 7, (tick) => (tick === 1 ? [ATTACK] : []));

    // Frame 6 is frozen for the whole stop, so the box stays live and simply
    // cannot hit the same target twice.
    for (let index = 0; index < 4; index += 1) {
      expect(world.getFrame().current.hitboxes).toHaveLength(1);
      runTicks(world, 1);
    }

    expect(world.getFrame().current.player.actionFrame).toBe(7);
  });

  it("cannot start an attack while locked in hitstun or hit-stop", () => {
    const world = new SimulationWorld(inRangeRecipe());
    runTicks(world, 7, (tick) => (tick === 1 ? [ATTACK] : []));

    const before = world.getFrame().current.player.actionFrame;
    runTicks(world, 1, () => [ATTACK]);
    expect(world.getFrame().current.player.actionFrame).toBe(before);
    expect(world.getFrame().current.player.attackId).toBe("mech-ground-1");
  });

  it("faces the locked target when the swing starts", () => {
    const world = new SimulationWorld({
      ...inRangeRecipe(),
      enemy: { ...inRangeRecipe().enemy, spawn: { x: 0, y: 100, elevation: 0 } },
    });
    const lock: CommandIntent = { type: "lock-target", fighterId: PLAYER_FIGHTER_ID };

    runTicks(world, 1, () => [lock]);
    runTicks(world, 1, () => [ATTACK]);

    const { player } = world.getFrame().current;
    expect(player.lockedTargetId).toBe(ENEMY_FIGHTER_ID);
    expect(player.facing.y).toBeCloseTo(1, 5);
    expect(player.facing.x).toBeCloseTo(0, 5);
  });
});
