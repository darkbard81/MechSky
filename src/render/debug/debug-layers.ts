/**
 * Debug layer vocabulary, metric shapes, and the combat panel's text. Kept
 * apart from `debug-overlay.ts` so key handling, layer validation, and the
 * formatting stay reachable and testable without importing PixiJS.
 */

import { attackContextCode } from "../../sim/combat/attack-context";
import { LOADOUT_SLOT_COUNT, loadoutSlotLabel } from "../../sim/combat/loadout";
import { hashSimulationSnapshot } from "../../sim/replay/battle-replay";
import type {
  FighterSnapshot,
  SimulationSnapshot,
} from "../../sim/world/world";

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

/** Twelve characters, `SR-A` first, so a spent mounting position is visible. */
export function formatUsedLoadoutSlots(mask: number): string {
  let text = "";

  for (let slotIndex = 0; slotIndex < LOADOUT_SLOT_COUNT; slotIndex += 1) {
    text += (mask & (1 << slotIndex)) === 0 ? "." : "#";
  }

  return text;
}

function formatTarget(fighter: FighterSnapshot, searchRange: number): string {
  const distance =
    fighter.combatTargetDistance === null
      ? "--"
      : fighter.combatTargetDistance.toFixed(0);
  const dash = `${fighter.searchDashHeld ? "D" : "-"}${fighter.searchDashActive ? "A" : "-"}`;
  return `TGT ${fighter.combatTargetId ?? "--"} ${distance}/${searchRange.toFixed(0)}  SD ${dash}`;
}

function formatRequest(fighter: FighterSnapshot): string {
  const buffered =
    fighter.bufferedAttackButton === null || fighter.bufferedAttackContext === null
      ? "----"
      : `${fighter.bufferedAttackButton}/${attackContextCode(fighter.bufferedAttackContext)}`;
  const slot =
    fighter.sourceSlotIndex === null
      ? "----"
      : loadoutSlotLabel(fighter.sourceSlotIndex);
  return `BUF ${buffered}  SLOT ${slot} ${fighter.weaponId ?? "-"}`;
}

function formatSession(fighter: FighterSnapshot): string {
  const session = fighter.comboSessionActive
    ? "open"
    : (fighter.comboSessionEndReason ?? "idle");
  return `USED ${formatUsedLoadoutSlots(fighter.usedLoadoutSlotsMask)}  COMBO ${session}`;
}

/**
 * The combat panel's lines. `snapshot` must be the authoritative tick state:
 * hashing an interpolated view would print a value the replay tooling can
 * never reproduce.
 */
export function formatCombatDebugLines(
  snapshot: SimulationSnapshot,
): readonly string[] {
  const { player, enemy } = snapshot;

  return [
    `TICK ${snapshot.tick}  HASH ${hashSimulationSnapshot(snapshot)}`,
    `P ${player.state}/${player.locomotion}  ${player.attackId ?? player.actionKind} ${player.actionFrame}`,
    `E ${enemy.state}/${enemy.locomotion}  ${enemy.attackId ?? enemy.actionKind} ${enemy.actionFrame}`,
    `HITSTOP ${player.hitStopFrames}/${enemy.hitStopFrames}  OUTCOME ${snapshot.battleOutcome}`,
    formatTarget(player, snapshot.searchRange),
    formatRequest(player),
    `CHAIN ${player.chainId ?? "-"} #${player.chainIndex}`,
    formatSession(player),
  ];
}
