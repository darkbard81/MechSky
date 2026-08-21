import { describe, expect, it } from "vitest";
import {
  replayForDebugName,
  resolveDevBattleScenario,
} from "../../src/testing/scenarios/dev-battle-scenarios";

function location(pathname: string, search = ""): Pick<Location, "pathname" | "search"> {
  return { pathname, search };
}

describe("M6 development battle scenarios", () => {
  it("leaves the standard application route unchanged", () => {
    expect(resolveDevBattleScenario(location("/"))).toBeNull();
  });

  it.each([
    ["vertical-slice", 0, false],
    ["air-combo", 0, true],
    ["input-validation", 0, false],
    ["1000-projectiles", 1_000, false],
  ] as const)("resolves %s without menu setup", (name, projectileCount, replayed) => {
    const scenario = resolveDevBattleScenario(
      location("/dev/battle", `?scenario=${name}`),
    );

    expect(scenario?.name).toBe(name);
    expect(scenario?.projectileCount).toBe(projectileCount);
    expect(scenario?.replay !== null).toBe(replayed);
  });

  it("defaults the dev route to vertical-slice and rejects unknown names", () => {
    expect(resolveDevBattleScenario(location("/dev/battle/"))?.name).toBe(
      "vertical-slice",
    );
    expect(() =>
      resolveDevBattleScenario(location("/dev/battle", "?scenario=unknown")),
    ).toThrow(/Unknown battle scenario/iu);
    expect(() => replayForDebugName("unknown")).toThrow(/air-combo/iu);
  });

  it("supports a root query route for relative-base production bundles", () => {
    expect(
      resolveDevBattleScenario(
        location("/", "?devScenario=input-validation"),
      )?.name,
    ).toBe("input-validation");
    expect(
      resolveDevBattleScenario(location("/index.html", "?devScenario=air-combo"))
        ?.name,
    ).toBe("air-combo");
  });
});
