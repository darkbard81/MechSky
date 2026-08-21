import { describe, expect, it } from "vitest";
import {
  advanceComboSession,
  createComboSession,
  endComboSession,
  isLoadoutSlotUsed,
  markLoadoutSlotUsed,
} from "../../src/sim/combat/combo-session";
import { LOADOUT_SLOT_COUNT } from "../../src/sim/combat/loadout";

const IDLE_LIMIT = 8;

describe("combo session", () => {
  it("opens on the first spent slot and remembers every later one", () => {
    const session = createComboSession();

    expect(session.active).toBe(false);
    markLoadoutSlotUsed(session, 0);
    markLoadoutSlotUsed(session, 5);

    expect(session.active).toBe(true);
    expect(isLoadoutSlotUsed(session, 0)).toBe(true);
    expect(isLoadoutSlotUsed(session, 5)).toBe(true);
    expect(isLoadoutSlotUsed(session, 1)).toBe(false);
    expect(session.usedLoadoutSlotsMask).toBe(0b100001);
  });

  it("rejects a slot index outside the twelve mounting positions", () => {
    const session = createComboSession();

    expect(() => markLoadoutSlotUsed(session, -1)).toThrow(RangeError);
    expect(() => markLoadoutSlotUsed(session, LOADOUT_SLOT_COUNT)).toThrow(RangeError);
  });

  it("only closes after the idle window runs out with nothing happening", () => {
    const session = createComboSession();
    markLoadoutSlotUsed(session, 3);

    for (let frame = 0; frame < IDLE_LIMIT - 1; frame += 1) {
      expect(advanceComboSession(session, false, IDLE_LIMIT)).toBe(false);
    }
    expect(session.active).toBe(true);
    expect(advanceComboSession(session, false, IDLE_LIMIT)).toBe(true);
    expect(session.active).toBe(false);
    expect(session.usedLoadoutSlotsMask).toBe(0);
    expect(session.lastEndReason).toBe("idle");
  });

  it("restarts the idle countdown on any busy frame", () => {
    const session = createComboSession();
    markLoadoutSlotUsed(session, 3);

    for (let frame = 0; frame < IDLE_LIMIT - 1; frame += 1) {
      advanceComboSession(session, false, IDLE_LIMIT);
    }
    advanceComboSession(session, true, IDLE_LIMIT);
    expect(session.idleFrames).toBe(0);
    expect(advanceComboSession(session, false, IDLE_LIMIT)).toBe(false);
    expect(session.active).toBe(true);
  });

  it("frees the slots again once the session ends", () => {
    const session = createComboSession();
    markLoadoutSlotUsed(session, 7);

    expect(endComboSession(session, "interrupted")).toBe(true);
    expect(isLoadoutSlotUsed(session, 7)).toBe(false);
    expect(session.lastEndReason).toBe("interrupted");
    // A closed session cannot close twice, so no caller double-reports the end.
    expect(endComboSession(session, "idle")).toBe(false);
    expect(session.lastEndReason).toBe("interrupted");

    markLoadoutSlotUsed(session, 7);
    expect(session.active).toBe(true);
    expect(session.lastEndReason).toBeNull();
  });

  it("stays quiet while it is closed", () => {
    const session = createComboSession();

    expect(advanceComboSession(session, false, 1)).toBe(false);
    expect(session.idleFrames).toBe(0);
  });
});
