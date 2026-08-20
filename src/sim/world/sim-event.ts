import type { EntityId } from "./entity";

export interface HitLandedEvent {
  readonly type: "hit-landed";
  readonly attackId: string;
  readonly attackerId: EntityId;
  readonly targetId: EntityId;
  readonly damage: number;
  readonly comboCount: number;
  readonly remainingHealth: number;
  /** Impact point on the ground plane, with the height the hit connected at. */
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly severity: number;
}

export interface AttackStartedEvent {
  readonly type: "attack-started";
  readonly attackId: string;
  readonly attackerId: EntityId;
  readonly chainIndex: number;
}

export interface AttackWhiffedEvent {
  readonly type: "attack-whiffed";
  readonly attackId: string;
  readonly attackerId: EntityId;
}

export interface ComboEndedEvent {
  readonly type: "combo-ended";
  readonly attackerId: EntityId;
  readonly hits: number;
}

export interface TargetDefeatedEvent {
  readonly type: "target-defeated";
  readonly targetId: EntityId;
}

export type SimEvent =
  | AttackStartedEvent
  | AttackWhiffedEvent
  | ComboEndedEvent
  | HitLandedEvent
  | TargetDefeatedEvent;
