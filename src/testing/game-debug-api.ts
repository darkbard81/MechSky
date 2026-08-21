import type { DebugLayerName } from "../render/debug/debug-layers";
import type { GamePauseReason } from "../app/game-flow";
import type { RuntimePerformanceSnapshot } from "../app/runtime-performance";
import type { BattleReplay } from "../sim/replay/battle-replay";
import type { SimulationSnapshot } from "../sim/world/world";
import type { DevBattleScenarioName } from "./scenarios/dev-battle-scenarios";

export interface GameDebugDump {
  readonly scenario: DevBattleScenarioName | "standard";
  readonly mode: "live" | "replay-auto" | "replay-manual";
  readonly replayFrame: number;
  readonly replayLength: number;
  readonly stateHash: string;
  readonly snapshot: SimulationSnapshot;
  readonly replay: BattleReplay;
  readonly enabledDebugLayers: readonly DebugLayerName[];
  readonly projectileCount: number;
  readonly performance: RuntimePerformanceSnapshot;
  readonly pauseReason: GamePauseReason | null;
  readonly reducedMotion: boolean;
}

export interface GameDebugApi {
  /** Loads a JSON-compatible replay or the built-in "air-combo" replay. */
  load(replay: unknown): GameDebugDump;
  /** Advances a manually loaded replay by an exact number of fixed 60 Hz frames. */
  step(frames?: number): GameDebugDump;
  /** Returns the current immutable simulation state, hash, and replay recording. */
  dump(): GameDebugDump;
  /** Toggles one world/screen debug layer and returns its new enabled state. */
  toggle(layer: DebugLayerName): boolean;
}

declare global {
  interface Window {
    __GAME_DEBUG__?: GameDebugApi;
  }
}
