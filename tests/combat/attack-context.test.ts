import { describe, expect, it } from "vitest";
import {
  ATTACK_CONTEXT_CYCLE,
  attackContextCode,
  isAttackContext,
  resolvePreferredAttackContext,
  type AttackContextInput,
} from "../../src/sim/combat/attack-context";

const SEARCH_RANGE = 180;

function input(overrides: Partial<AttackContextInput> = {}): AttackContextInput {
  return {
    move: { x: 0, y: 0 },
    searchDashPressed: false,
    searchDashHeld: false,
    searchDashActive: false,
    targetDistance: 100,
    searchRange: SEARCH_RANGE,
    ...overrides,
  };
}

describe("preferred attack context", () => {
  it("prefers normal dash whenever the request carries a direction", () => {
    expect(resolvePreferredAttackContext(input({ move: { x: 1, y: 0 } }))).toBe(
      "normal-dash",
    );
    expect(
      resolvePreferredAttackContext(
        input({ move: { x: 0, y: -0.4 }, searchDashPressed: true }),
      ),
    ).toBe("normal-dash");
    expect(
      resolvePreferredAttackContext(
        input({ move: { x: 0.3, y: 0.3 }, targetDistance: 4_000 }),
      ),
    ).toBe("normal-dash");
  });

  it("prefers search dash for a press, held button, or active search movement", () => {
    expect(resolvePreferredAttackContext(input({ searchDashPressed: true }))).toBe(
      "search-dash",
    );
    expect(resolvePreferredAttackContext(input({ searchDashHeld: true }))).toBe(
      "search-dash",
    );
    expect(resolvePreferredAttackContext(input({ searchDashActive: true }))).toBe(
      "search-dash",
    );
  });

  it("splits short from long range on the planar distance alone", () => {
    expect(resolvePreferredAttackContext(input({ targetDistance: 179 }))).toBe(
      "short-range",
    );
    expect(
      resolvePreferredAttackContext(input({ targetDistance: SEARCH_RANGE })),
    ).toBe("short-range");
    expect(
      resolvePreferredAttackContext(input({ targetDistance: SEARCH_RANGE + 1 })),
    ).toBe("long-range");
  });

  it("falls back to long range when there is no valid target", () => {
    expect(resolvePreferredAttackContext(input({ targetDistance: null }))).toBe(
      "long-range",
    );
  });

  it("keeps the cycle order and its two-letter codes fixed", () => {
    expect(ATTACK_CONTEXT_CYCLE).toEqual([
      "short-range",
      "search-dash",
      "long-range",
      "normal-dash",
    ]);
    expect(ATTACK_CONTEXT_CYCLE.map(attackContextCode)).toEqual([
      "SR",
      "SD",
      "LR",
      "ND",
    ]);
    expect(isAttackContext("short-range")).toBe(true);
    expect(isAttackContext("mid-range")).toBe(false);
  });

  it("returns a preferred context only, never a fallback or a weapon", () => {
    // The resolver takes no used-slot state, so SD stays SD even when SD-A is
    // spent; walking on to LR/ND/SR is the selector's job, not this one's.
    const preferred = resolvePreferredAttackContext(input({ searchDashHeld: true }));

    expect(preferred).toBe("search-dash");
    expect(typeof preferred).toBe("string");
  });
});
