import { describe, expect, it } from "vitest";
import { BattleSession } from "../../src/app/battle-session";
import { HANGAR_TEST_BATTLE } from "../../src/content/arenas/hangar-test";

describe("BattleSession", () => {
  it("lets the AI approach and damage an idle player through normal intents", () => {
    const session = new BattleSession(HANGAR_TEST_BATTLE);

    for (let tick = 0; tick < 600; tick += 1) {
      session.step([]);
      session.drainEvents();
      if (session.frame.current.player.health < HANGAR_TEST_BATTLE.player.health) {
        break;
      }
    }

    expect(session.frame.current.enemy.body.position).not.toEqual(
      HANGAR_TEST_BATTLE.enemy.spawn,
    );
    expect(session.frame.current.player.health).toBeLessThan(
      HANGAR_TEST_BATTLE.player.health,
    );
    expect(session.frame.current.player.actionKind).toBe("hitstun");
  });

  it("resets simulation, AI state, and pending events to the initial frame", () => {
    const session = new BattleSession(HANGAR_TEST_BATTLE);
    const fresh = new BattleSession(HANGAR_TEST_BATTLE);

    for (let tick = 0; tick < 240; tick += 1) {
      session.step([]);
    }
    expect(session.frame.current.tick).toBeGreaterThan(0);
    expect(session.enemyAiState).not.toBe("observing");

    session.reset();

    expect(session.frame).toEqual(fresh.frame);
    expect(session.enemyAiState).toBe("observing");
    expect(session.drainEvents()).toEqual([]);

    for (let tick = 0; tick < 180; tick += 1) {
      session.step([]);
      fresh.step([]);
      expect(session.frame).toEqual(fresh.frame);
      expect(session.enemyAiState).toBe(fresh.enemyAiState);
      expect(session.drainEvents()).toEqual(fresh.drainEvents());
    }
  });
});
