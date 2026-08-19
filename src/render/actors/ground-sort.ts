import type { FighterSnapshot } from "../../sim/world/world";

export function actorGroundSortKey(fighter: FighterSnapshot): number {
  return fighter.body.position.y;
}
