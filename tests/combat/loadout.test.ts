import { describe, expect, it } from "vitest";
import { ATTACK_CONTEXT_CYCLE } from "../../src/sim/combat/attack-context";
import {
  ATTACK_BUTTONS,
  isAttackButton,
  LOADOUT_SLOT_COUNT,
  loadoutSlotIndex,
  loadoutSlotLabel,
  selectLoadoutWeapon,
  type ContextualLoadout,
} from "../../src/sim/combat/loadout";

const FULL_LOADOUT: ContextualLoadout = {
  "short-range": { A: "sr-a", B: "sr-b", C: "sr-c" },
  "search-dash": { A: "sd-a", B: "sd-b", C: "sd-c" },
  "long-range": { A: "lr-a", B: "lr-b", C: "lr-c" },
  "normal-dash": { A: "nd-a", B: "nd-b", C: "nd-c" },
};

function maskOf(...slots: readonly (readonly [string, string])[]): number {
  let mask = 0;
  for (const [context, button] of slots) {
    mask |=
      1 <<
      loadoutSlotIndex(
        context as (typeof ATTACK_CONTEXT_CYCLE)[number],
        button as (typeof ATTACK_BUTTONS)[number],
      );
  }
  return mask;
}

function pick(
  preferred: (typeof ATTACK_CONTEXT_CYCLE)[number],
  mask: number,
  loadout: ContextualLoadout = FULL_LOADOUT,
  button: (typeof ATTACK_BUTTONS)[number] = "A",
): string | null {
  return selectLoadoutWeapon(loadout, button, preferred, mask)?.weaponId ?? null;
}

describe("loadout slot addressing", () => {
  it("gives every context and button its own bit", () => {
    const indexes = ATTACK_CONTEXT_CYCLE.flatMap((context) =>
      ATTACK_BUTTONS.map((button) => loadoutSlotIndex(context, button)),
    );

    expect(new Set(indexes).size).toBe(LOADOUT_SLOT_COUNT);
    expect(Math.min(...indexes)).toBe(0);
    expect(Math.max(...indexes)).toBe(LOADOUT_SLOT_COUNT - 1);
    expect(loadoutSlotLabel(loadoutSlotIndex("short-range", "A"))).toBe("SR-A");
    expect(loadoutSlotLabel(loadoutSlotIndex("normal-dash", "C"))).toBe("ND-C");
    expect(isAttackButton("A")).toBe(true);
    expect(isAttackButton("D")).toBe(false);
  });
});

describe("same-button slot cycle", () => {
  it("takes the preferred slot when nothing is spent", () => {
    expect(pick("short-range", 0)).toBe("sr-a");
    expect(pick("search-dash", 0)).toBe("sd-a");
    expect(pick("long-range", 0)).toBe("lr-a");
    expect(pick("normal-dash", 0)).toBe("nd-a");
  });

  it("walks SR to SD to LR to ND as the preferred slots get spent", () => {
    expect(pick("short-range", maskOf(["short-range", "A"]))).toBe("sd-a");
    expect(
      pick("short-range", maskOf(["short-range", "A"], ["search-dash", "A"])),
    ).toBe("lr-a");
    expect(
      pick(
        "short-range",
        maskOf(["short-range", "A"], ["search-dash", "A"], ["long-range", "A"]),
      ),
    ).toBe("nd-a");
  });

  it("wraps once around the ring instead of stopping at the end", () => {
    expect(pick("search-dash", maskOf(["search-dash", "A"]))).toBe("lr-a");
    expect(
      pick("search-dash", maskOf(["search-dash", "A"], ["long-range", "A"])),
    ).toBe("nd-a");
    expect(
      pick(
        "search-dash",
        maskOf(["search-dash", "A"], ["long-range", "A"], ["normal-dash", "A"]),
      ),
    ).toBe("sr-a");
    expect(pick("normal-dash", maskOf(["normal-dash", "A"]))).toBe("sr-a");
  });

  it("skips empty slots without spending a step of the walk", () => {
    const sparse: ContextualLoadout = {
      ...FULL_LOADOUT,
      "search-dash": { A: null, B: "sd-b", C: "sd-c" },
      "long-range": { A: null, B: "lr-b", C: "lr-c" },
    };

    expect(pick("short-range", maskOf(["short-range", "A"]), sparse)).toBe("nd-a");
  });

  it("returns null when the whole column is spent or empty", () => {
    const emptyColumn: ContextualLoadout = {
      "short-range": { A: null, B: "sr-b", C: null },
      "search-dash": { A: null, B: "sd-b", C: null },
      "long-range": { A: null, B: "lr-b", C: null },
      "normal-dash": { A: null, B: "nd-b", C: null },
    };

    expect(pick("short-range", 0, emptyColumn)).toBeNull();
    expect(
      pick(
        "short-range",
        maskOf(
          ["short-range", "A"],
          ["search-dash", "A"],
          ["long-range", "A"],
          ["normal-dash", "A"],
        ),
      ),
    ).toBeNull();
  });

  it("runs the identical walk for the B and C columns", () => {
    for (const button of ["B", "C"] as const) {
      expect(pick("short-range", 0, FULL_LOADOUT, button)).toBe(
        `sr-${button.toLowerCase()}`,
      );
      expect(
        pick("short-range", maskOf(["short-range", button]), FULL_LOADOUT, button),
      ).toBe(`sd-${button.toLowerCase()}`);
      expect(
        pick("normal-dash", maskOf(["normal-dash", button]), FULL_LOADOUT, button),
      ).toBe(`sr-${button.toLowerCase()}`);
    }
  });

  it("treats one weapon mounted twice as two independent slots", () => {
    const twiceMounted: ContextualLoadout = {
      ...FULL_LOADOUT,
      "short-range": { ...FULL_LOADOUT["short-range"], A: "rifle" },
      "search-dash": { ...FULL_LOADOUT["search-dash"], A: "rifle" },
    };
    const first = selectLoadoutWeapon(twiceMounted, "A", "short-range", 0);
    const second = selectLoadoutWeapon(
      twiceMounted,
      "A",
      "short-range",
      1 << (first?.slotIndex ?? 0),
    );

    expect(first).toMatchObject({ weaponId: "rifle", context: "short-range" });
    expect(second).toMatchObject({ weaponId: "rifle", context: "search-dash" });
    expect(second?.slotIndex).not.toBe(first?.slotIndex);
  });

  it("reports the slot it chose so the caller can spend exactly that bit", () => {
    expect(selectLoadoutWeapon(FULL_LOADOUT, "C", "long-range", 0)).toEqual({
      context: "long-range",
      button: "C",
      weaponId: "lr-c",
      slotIndex: loadoutSlotIndex("long-range", "C"),
    });
  });
});
