import type { WorldPosition } from "../../sim/world/entity";

export interface FighterProjection {
  readonly actor: Readonly<{ x: number; y: number }>;
  readonly spriteOffsetY: number;
  readonly shadow: Readonly<{ x: number; y: number }>;
}

/** Ground coordinates own combat position; elevation offsets only the sprite. */
export function projectFighter(position: Readonly<WorldPosition>): FighterProjection {
  return {
    actor: { x: position.x, y: position.y },
    spriteOffsetY: position.elevation === 0 ? 0 : -position.elevation,
    shadow: { x: position.x, y: position.y + 3 },
  };
}
