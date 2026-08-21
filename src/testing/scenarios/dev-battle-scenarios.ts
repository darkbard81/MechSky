import { HANGAR_TEST_BATTLE } from "../../content/arenas/hangar-test";
import type { BattleReplay } from "../../sim/replay/battle-replay";
import type { BattleRecipe } from "../../sim/world/battle-recipe";
import { AIR_COMBO_REPLAY } from "../replays/air-combo-replay";

export type DevBattleScenarioName =
  | "vertical-slice"
  | "air-combo"
  | "1000-projectiles";

export interface DevBattleScenario {
  readonly name: DevBattleScenarioName;
  readonly recipe: BattleRecipe;
  readonly replay: BattleReplay | null;
  readonly projectileCount: number;
}

const VERTICAL_SLICE_SCENARIO: DevBattleScenario = Object.freeze({
  name: "vertical-slice",
  recipe: HANGAR_TEST_BATTLE,
  replay: null,
  projectileCount: 0,
});

const AIR_COMBO_SCENARIO: DevBattleScenario = Object.freeze({
  name: "air-combo",
  recipe: AIR_COMBO_REPLAY.recipe,
  replay: AIR_COMBO_REPLAY,
  projectileCount: 0,
});

const PROJECTILE_STRESS_SCENARIO: DevBattleScenario = Object.freeze({
  name: "1000-projectiles",
  recipe: HANGAR_TEST_BATTLE,
  replay: null,
  projectileCount: 1_000,
});

const SCENARIOS: Readonly<Record<DevBattleScenarioName, DevBattleScenario>> =
  Object.freeze({
    "vertical-slice": VERTICAL_SLICE_SCENARIO,
    "air-combo": AIR_COMBO_SCENARIO,
    "1000-projectiles": PROJECTILE_STRESS_SCENARIO,
  });

function isDevBattleScenarioName(value: string): value is DevBattleScenarioName {
  return value in SCENARIOS;
}

export function resolveDevBattleScenario(
  location: Pick<Location, "pathname" | "search">,
): DevBattleScenario | null {
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  if (pathname !== "/dev/battle") {
    return null;
  }

  const requested = new URLSearchParams(location.search).get("scenario");
  const name = requested ?? "vertical-slice";
  if (!isDevBattleScenarioName(name)) {
    throw new RangeError(
      `Unknown battle scenario '${name}'. Expected vertical-slice, air-combo, or 1000-projectiles.`,
    );
  }

  return SCENARIOS[name];
}

export function replayForDebugName(name: string): BattleReplay {
  if (name !== "air-combo") {
    throw new RangeError("Built-in replay name must be 'air-combo'.");
  }

  return AIR_COMBO_REPLAY;
}
