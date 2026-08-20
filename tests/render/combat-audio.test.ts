import { describe, expect, it } from "vitest";
import { resolveCombatSoundCue } from "../../src/audio/combat-audio";
import type { SimEvent } from "../../src/sim/world/sim-event";

function hitLanded(attackId: string): SimEvent {
  return {
    type: "hit-landed",
    attackId,
    attackerId: 1,
    targetId: 2,
    damage: 60,
    comboCount: 1,
    remainingHealth: 840,
    x: 0,
    y: 0,
    elevation: 0,
    severity: 1,
  };
}

describe("combat audio cues", () => {
  it("maps every vertical-slice attack family to a minimal cue", () => {
    expect(resolveCombatSoundCue(hitLanded("mech-ground-1"))).toBe("melee");
    expect(resolveCombatSoundCue(hitLanded("mech-ground-2"))).toBe("melee");
    expect(resolveCombatSoundCue(hitLanded("mech-launcher"))).toBe("launcher");
    expect(resolveCombatSoundCue(hitLanded("mech-air-1"))).toBe("air");
    expect(resolveCombatSoundCue(hitLanded("mech-air-2"))).toBe("air");
    expect(resolveCombatSoundCue(hitLanded("mech-finisher"))).toBe("finisher");
  });

  it("plays the ground-slam cue from the simulation impact event", () => {
    expect(
      resolveCombatSoundCue({
        type: "ground-impact",
        fighterId: 2,
        x: 0,
        y: 0,
        impactSpeed: 900,
        severity: 1,
      }),
    ).toBe("ground-slam");
  });

  it("does not derive hit sound from startup or unrelated events", () => {
    expect(
      resolveCombatSoundCue({
        type: "attack-started",
        attackId: "mech-ground-1",
        attackerId: 1,
        chainIndex: 0,
      }),
    ).toBeNull();
    expect(
      resolveCombatSoundCue({
        type: "combo-ended",
        attackerId: 1,
        hits: 6,
      }),
    ).toBeNull();
  });
});
