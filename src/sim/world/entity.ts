export type EntityId = number;

export interface WorldPosition {
  x: number;
  y: number;
  elevation: number;
}

export interface CombatBody extends WorldPosition {
  radius: number;
  bodyHeight: number;
}
