import type { Vector2 } from "../../sim/math/vector2";
import type { SimulationSnapshot } from "../../sim/world/world";

const GROUND_LOOK_AHEAD_X = 0.075;
const GROUND_LOOK_AHEAD_Y = 0.045;
const AIR_LOOK_AHEAD_X = 0.03;
const AIR_ELEVATION_FRAMING = 0.42;

/** Keeps both airborne fighters and their ground positions readable in frame. */
export function resolveBattleCameraTarget(
  snapshot: SimulationSnapshot,
): Readonly<Vector2> {
  const { player, enemy } = snapshot;
  const airborne =
    player.locomotion === "airborne" || enemy.locomotion === "airborne";

  if (!airborne) {
    return {
      x: player.body.position.x + player.body.velocity.x * GROUND_LOOK_AHEAD_X,
      y: player.body.position.y + player.body.velocity.y * GROUND_LOOK_AHEAD_Y,
    };
  }

  return {
    x:
      (player.body.position.x + enemy.body.position.x) / 2 +
      player.body.velocity.x * AIR_LOOK_AHEAD_X,
    y:
      (player.body.position.y + enemy.body.position.y) / 2 -
      (player.body.position.elevation + enemy.body.position.elevation) *
        AIR_ELEVATION_FRAMING,
  };
}
