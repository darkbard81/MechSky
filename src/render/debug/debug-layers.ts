/**
 * Debug layer vocabulary and the metric shapes the overlay renders. Kept apart
 * from `debug-overlay.ts` so key handling and layer validation stay reachable
 * without importing PixiJS.
 */

export const DEBUG_TOGGLES = {
  F1: "collision",
  F2: "hitbox",
  F4: "velocity",
  F7: "combat",
  F8: "performance",
} as const;

export type DebugLayerName = (typeof DEBUG_TOGGLES)[keyof typeof DEBUG_TOGGLES];

export const DEBUG_LAYER_ORDER: readonly DebugLayerName[] = Object.freeze([
  "collision",
  "hitbox",
  "velocity",
  "combat",
  "performance",
]);

export interface DebugTimingMetrics {
  readonly simulationAverageMilliseconds: number;
  readonly simulationMaximumMilliseconds: number;
  readonly collisionHitAverageMilliseconds: number;
  readonly collisionHitMaximumMilliseconds: number;
  readonly aiAverageMilliseconds: number;
  readonly aiMaximumMilliseconds: number;
  readonly frameSpikeCount: number;
}

export interface DebugRuntimeMetrics extends DebugTimingMetrics {
  readonly framesPerSecond: number;
  readonly frameMilliseconds: number;
  readonly projectileCount: number;
}

export function debugLayerForCode(code: string): DebugLayerName | null {
  return code in DEBUG_TOGGLES
    ? DEBUG_TOGGLES[code as keyof typeof DEBUG_TOGGLES]
    : null;
}

export function isDebugLayerName(value: unknown): value is DebugLayerName {
  return (
    typeof value === "string" &&
    DEBUG_LAYER_ORDER.includes(value as DebugLayerName)
  );
}
