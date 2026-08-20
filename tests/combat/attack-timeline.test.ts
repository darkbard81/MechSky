import { describe, expect, it } from "vitest";
import {
  MECH_ATTACK_LIBRARY,
  MECH_GROUND_CHAIN_ID,
} from "../../src/content/attacks/mech-ground-combo";
import {
  attackDuration,
  validateAttackDefinition,
  type AttackDefinition,
} from "../../src/sim/combat/attack-definition";
import {
  canCancelInto,
  cancelTagsAt,
  isHitboxLive,
  resolveAttackPhase,
} from "../../src/sim/combat/attack-timeline";

function attack(id: keyof typeof MECH_ATTACK_LIBRARY.attacks): AttackDefinition {
  return MECH_ATTACK_LIBRARY.attacks[id];
}

const FIRST = attack("mech-ground-1");
const SECOND = attack("mech-ground-2");

describe("attack timeline", () => {
  it("splits the timeline into startup, active, recovery, and finished", () => {
    expect(attackDuration(FIRST)).toBe(23);

    expect(resolveAttackPhase(FIRST, 0)).toBe("startup");
    expect(resolveAttackPhase(FIRST, 5)).toBe("startup");
    expect(resolveAttackPhase(FIRST, 6)).toBe("active");
    expect(resolveAttackPhase(FIRST, 9)).toBe("active");
    expect(resolveAttackPhase(FIRST, 10)).toBe("recovery");
    expect(resolveAttackPhase(FIRST, 22)).toBe("recovery");
    expect(resolveAttackPhase(FIRST, 23)).toBe("finished");
  });

  it("keeps the hitbox live only across the active frames", () => {
    const live = Array.from({ length: attackDuration(FIRST) }, (_, frame) =>
      isHitboxLive(FIRST, frame),
    );

    expect(live.filter(Boolean)).toHaveLength(FIRST.activeFrames);
    expect(live.slice(6, 10).every(Boolean)).toBe(true);
    expect(live[5]).toBe(false);
    expect(live[10]).toBe(false);
  });

  it("opens a hit-gated cancel only after the attack connected", () => {
    expect(cancelTagsAt(FIRST, 9, true)).toEqual([]);
    expect(cancelTagsAt(FIRST, 10, false)).toEqual([]);
    expect(cancelTagsAt(FIRST, 10, true)).toEqual(["melee"]);
    expect(cancelTagsAt(FIRST, 22, true)).toEqual(["melee"]);
  });

  it("matches a cancel against the target attack tags", () => {
    expect(canCancelInto(FIRST, 10, true, SECOND)).toBe(true);
    expect(canCancelInto(FIRST, 9, true, SECOND)).toBe(false);
    expect(canCancelInto(FIRST, 10, false, SECOND)).toBe(false);
    expect(canCancelInto(SECOND, 20, true, FIRST)).toBe(false);
  });

  it("rejects a negative action frame", () => {
    expect(() => resolveAttackPhase(FIRST, -1)).toThrow(/negative/);
  });

  it("validates every shipped attack and its chain", () => {
    for (const definition of Object.values(MECH_ATTACK_LIBRARY.attacks)) {
      expect(() => validateAttackDefinition(definition)).not.toThrow();
    }

    const chain = MECH_ATTACK_LIBRARY.chains[MECH_GROUND_CHAIN_ID];
    expect(chain?.attacks).toEqual(["mech-ground-1", "mech-ground-2"]);
  });

  it("rejects definitions that break the frame or hitbox contract", () => {
    expect(() =>
      validateAttackDefinition({ ...FIRST, activeFrames: 0 }),
    ).toThrow(/active/);
    expect(() =>
      validateAttackDefinition({ ...FIRST, damage: 0 }),
    ).toThrow(/damage/);
    expect(() =>
      validateAttackDefinition({
        ...FIRST,
        hitbox: { ...FIRST.hitbox, maximumElevation: 0 },
      }),
    ).toThrow(/elevation/);
    expect(() =>
      validateAttackDefinition({
        ...FIRST,
        cancels: [{ fromFrame: 99, into: ["melee"], requiresHit: false }],
      }),
    ).toThrow(/timeline/);
  });
});
