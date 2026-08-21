import { describe, expect, it } from "vitest";
import {
  ENEMY_FIGHTER_ID,
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../../src/content/arenas/hangar-test";
import { MECH_ATTACK_LIBRARY } from "../../src/content/attacks/mech-attack-library";
import { MECH_WEAPON_LIBRARY } from "../../src/content/weapons/mech-weapons";
import type {
  AttackDefinition,
  AttackLibrary,
  ComboChain,
} from "../../src/sim/combat/attack-definition";
import { ATTACK_CONTEXT_CYCLE } from "../../src/sim/combat/attack-context";
import { loadoutSlotIndex, type ContextualLoadout } from "../../src/sim/combat/loadout";
import type { WeaponLibrary } from "../../src/sim/combat/weapon-definition";
import type { CommandIntent } from "../../src/sim/input/command-intent";
import type { BattleRecipe } from "../../src/sim/world/battle-recipe";
import { SimulationWorld } from "../../src/sim/world/world";

const PRESS: CommandIntent = {
  type: "attack",
  fighterId: PLAYER_FIGHTER_ID,
  button: "A",
};
const HOLD_SEARCH_DASH: CommandIntent = {
  type: "search-dash",
  fighterId: PLAYER_FIGHTER_ID,
  pressed: false,
  held: true,
};
const TAP_SEARCH_DASH: CommandIntent = {
  type: "search-dash",
  fighterId: PLAYER_FIGHTER_ID,
  pressed: true,
  held: false,
};
const WALK: CommandIntent = {
  type: "move",
  fighterId: PLAYER_FIGHTER_ID,
  direction: { x: 0, y: -1 },
};
/** Every marker attack is cancellable into every other, so only the loadout decides. */
const CONTEXT_CODES = ["sr", "sd", "lr", "nd"] as const;

function markerAttack(code: string): AttackDefinition {
  return {
    id: `marker-${code}`,
    tags: ["melee"],
    startupFrames: 1,
    activeFrames: 1,
    recoveryFrames: 8,
    damage: 1,
    hitStunFrames: 1,
    hitStopFrames: 0,
    knockback: 0,
    launchVelocity: 0,
    selfVerticalVelocity: 0,
    groundSlam: false,
    forwardImpulse: 0,
    hitbox: {
      forwardOffset: 0,
      radius: 1,
      minimumElevation: 0,
      maximumElevation: 1,
    },
    cancels: [{ fromFrame: 2, into: ["melee"], requiresHit: false }],
  };
}

function markerChain(code: string): ComboChain {
  return { id: `chain-${code}`, attacks: [`marker-${code}`] };
}

const MARKER_LIBRARY: AttackLibrary = {
  attacks: {
    ...MECH_ATTACK_LIBRARY.attacks,
    ...Object.fromEntries(
      CONTEXT_CODES.map((code) => [`marker-${code}`, markerAttack(code)]),
    ),
  },
  chains: {
    ...MECH_ATTACK_LIBRARY.chains,
    ...Object.fromEntries(
      CONTEXT_CODES.map((code) => [`chain-${code}`, markerChain(code)]),
    ),
  },
};

const MARKER_WEAPONS: WeaponLibrary = {
  weapons: {
    ...MECH_WEAPON_LIBRARY.weapons,
    ...Object.fromEntries(
      CONTEXT_CODES.map((code) => [
        `weapon-${code}`,
        {
          id: `weapon-${code}`,
          entryChains: { grounded: `chain-${code}`, airborne: `chain-${code}` },
        },
      ]),
    ),
  },
};

const MARKER_LOADOUT: ContextualLoadout = {
  "short-range": { A: "weapon-sr", B: null, C: null },
  "search-dash": { A: "weapon-sd", B: null, C: null },
  "long-range": { A: "weapon-lr", B: null, C: null },
  "normal-dash": { A: "weapon-nd", B: null, C: null },
};

/** A quiet duel: the enemy never acts, so only the player's inputs move state. */
function markerRecipe(loadout: ContextualLoadout = MARKER_LOADOUT): BattleRecipe {
  return {
    ...HANGAR_TEST_BATTLE,
    player: {
      ...HANGAR_TEST_BATTLE.player,
      spawn: { x: 0, y: 0, elevation: 0 },
      loadout,
    },
    enemy: {
      ...HANGAR_TEST_BATTLE.enemy,
      spawn: { x: 100, y: 0, elevation: 0 },
    },
    enemyAi: { ...HANGAR_TEST_BATTLE.enemyAi, reactionDelayFrames: 10_000 },
    combat: {
      ...HANGAR_TEST_BATTLE.combat,
      library: MARKER_LIBRARY,
      weapons: MARKER_WEAPONS,
    },
  };
}

/** Presses A every third tick and reports which attack each press opened. */
function pressSequence(
  world: SimulationWorld,
  presses: number,
  extra: readonly CommandIntent[] = [],
): readonly string[] {
  const started: string[] = [];

  for (let press = 0; press < presses; press += 1) {
    world.step([PRESS, ...extra]);
    for (const event of world.drainEvents()) {
      if (event.type === "attack-started") {
        started.push(event.attackId);
      }
    }
    world.step(extra);
    world.step(extra);
  }

  return started;
}

describe("contextual loadout selection", () => {
  it("cycles SR to SD to LR to ND when A repeats in short range", () => {
    const world = new SimulationWorld(markerRecipe());

    expect(pressSequence(world, 4)).toEqual([
      "marker-sr",
      "marker-sd",
      "marker-lr",
      "marker-nd",
    ]);
  });

  it("starts at SD and wraps to SR when the search dash button stays held", () => {
    const world = new SimulationWorld(markerRecipe());

    expect(pressSequence(world, 4, [HOLD_SEARCH_DASH])).toEqual([
      "marker-sd",
      "marker-lr",
      "marker-nd",
      "marker-sr",
    ]);
  });

  it("starts at SD when Search Dash is pressed and released inside one tick", () => {
    const world = new SimulationWorld(markerRecipe());

    world.step([PRESS, TAP_SEARCH_DASH]);

    expect(
      world
        .drainEvents()
        .filter((event) => event.type === "attack-started")
        .map((event) => event.attackId),
    ).toEqual(["marker-sd"]);
    expect(world.getFrame().current.player.sourceContext).toBe("search-dash");
    expect(world.getFrame().current.player.searchDashHeld).toBe(false);
  });

  it("starts at ND and wraps to LR while a direction is held", () => {
    const world = new SimulationWorld(markerRecipe());

    expect(pressSequence(world, 4, [WALK])).toEqual([
      "marker-nd",
      "marker-sr",
      "marker-sd",
      "marker-lr",
    ]);
  });

  it("moves the cycle start when the context changes mid-combo", () => {
    const world = new SimulationWorld(markerRecipe());
    const held = pressSequence(world, 1, [HOLD_SEARCH_DASH]);

    expect([...held, ...pressSequence(world, 3)]).toEqual([
      "marker-sd",
      "marker-sr",
      "marker-lr",
      "marker-nd",
    ]);
  });

  it("refuses the request once all four slots in the column are spent", () => {
    const world = new SimulationWorld(markerRecipe());
    pressSequence(world, 4);

    const everyAColumnSlot = ATTACK_CONTEXT_CYCLE.reduce(
      (mask, context) => mask | (1 << loadoutSlotIndex(context, "A")),
      0,
    );

    expect(pressSequence(world, 1)).toEqual([]);
    expect(world.getFrame().current.player.usedLoadoutSlotsMask).toBe(
      everyAColumnSlot,
    );
  });

  it("keeps every slot addressable when a column is empty", () => {
    const world = new SimulationWorld(
      markerRecipe({
        ...MARKER_LOADOUT,
        "search-dash": { A: null, B: null, C: null },
      }),
    );

    expect(pressSequence(world, 4)).toEqual([
      "marker-sr",
      "marker-lr",
      "marker-nd",
    ]);
  });
});

describe("combo session and the used slot mask", () => {
  it("spends one slot per weapon entry, never per chain step", () => {
    const world = new SimulationWorld({
      ...HANGAR_TEST_BATTLE,
      player: { ...HANGAR_TEST_BATTLE.player, spawn: { x: 0, y: 0, elevation: 0 } },
      enemy: { ...HANGAR_TEST_BATTLE.enemy, spawn: { x: 100, y: 0, elevation: 0 } },
      enemyAi: { ...HANGAR_TEST_BATTLE.enemyAi, reactionDelayFrames: 10_000 },
    });
    const started: string[] = [];

    for (let tick = 1; tick <= 30; tick += 1) {
      world.step(tick === 1 || tick === 15 ? [PRESS] : []);
      for (const event of world.drainEvents()) {
        if (event.type === "attack-started") {
          started.push(event.attackId);
        }
      }
    }

    const player = world.getFrame().current.player;
    expect(started).toEqual(["mech-ground-1", "mech-ground-2"]);
    expect(player.usedLoadoutSlotsMask).toBe(1 << loadoutSlotIndex("short-range", "A"));
    expect(player.comboSessionActive).toBe(true);
  });

  it("frees the slots again after the idle window closes the combo", () => {
    const world = new SimulationWorld(markerRecipe());
    pressSequence(world, 4);

    for (
      let tick = 0;
      tick <= HANGAR_TEST_BATTLE.combat.comboSessionIdleFrames + 12;
      tick += 1
    ) {
      world.step();
    }
    world.drainEvents();

    const idle = world.getFrame().current.player;
    expect(idle.comboSessionActive).toBe(false);
    expect(idle.usedLoadoutSlotsMask).toBe(0);
    expect(idle.comboSessionEndReason).toBe("idle");
    expect(pressSequence(world, 1)).toEqual(["marker-sr"]);
  });

  it("closes the session on hitstun entry even when one-frame hitstun ends immediately", () => {
    const recipe = markerRecipe();
    const world = new SimulationWorld({
      ...recipe,
      enemy: {
        ...recipe.enemy,
        spawn: { x: 30, y: 0, elevation: 0 },
      },
    });
    const enemyPress: CommandIntent = {
      type: "attack",
      fighterId: ENEMY_FIGHTER_ID,
      button: "A",
    };

    world.step([PRESS, enemyPress]);
    expect(world.getFrame().current.enemy.comboSessionActive).toBe(true);

    world.step();
    const enemy = world.getFrame().current.enemy;

    expect(enemy.actionKind).toBe("none");
    expect(enemy.comboSessionActive).toBe(false);
    expect(enemy.usedLoadoutSlotsMask).toBe(0);
    expect(enemy.comboSessionEndReason).toBe("interrupted");
  });
});

describe("buffered request context", () => {
  it("keeps the context the button was pressed in, not the one it starts in", () => {
    const world = new SimulationWorld(markerRecipe());

    // Press with the search dash button held, then drop every input while the
    // request waits out the buffer.
    world.step([PRESS, HOLD_SEARCH_DASH]);
    world.drainEvents();
    expect(world.getFrame().current.player.sourceContext).toBe("search-dash");

    world.step([PRESS]);
    expect(world.getFrame().current.player.bufferedAttackContext).toBe("short-range");

    // The button goes back down while the request waits out its cancel window.
    // The weapon that finally starts must still be the short-range one.
    world.step([HOLD_SEARCH_DASH]);
    const started = world
      .drainEvents()
      .filter((event) => event.type === "attack-started")
      .map((event) => event.attackId);

    expect(started).toEqual(["marker-sr"]);
    expect(world.getFrame().current.player.sourceContext).toBe("short-range");
    expect(world.getFrame().current.player.bufferedAttackContext).toBeNull();
  });
});
