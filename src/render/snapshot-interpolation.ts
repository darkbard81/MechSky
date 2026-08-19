import type {
  FighterSnapshot,
  SimulationFrame,
  SimulationSnapshot,
} from "../sim/world/world";

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

function interpolateFighter(
  previous: FighterSnapshot,
  current: FighterSnapshot,
  alpha: number,
): FighterSnapshot {
  return {
    ...current,
    body: {
      ...current.body,
      position: {
        x: lerp(previous.body.position.x, current.body.position.x, alpha),
        y: lerp(previous.body.position.y, current.body.position.y, alpha),
        elevation: lerp(
          previous.body.position.elevation,
          current.body.position.elevation,
          alpha,
        ),
      },
      velocity: {
        x: lerp(previous.body.velocity.x, current.body.velocity.x, alpha),
        y: lerp(previous.body.velocity.y, current.body.velocity.y, alpha),
      },
    },
  };
}

export function interpolateSimulationFrame(
  frame: SimulationFrame,
  alpha: number,
): SimulationSnapshot {
  const normalizedAlpha = clamp01(alpha);

  return {
    ...frame.current,
    elapsedSeconds: lerp(
      frame.previous.elapsedSeconds,
      frame.current.elapsedSeconds,
      normalizedAlpha,
    ),
    player: interpolateFighter(
      frame.previous.player,
      frame.current.player,
      normalizedAlpha,
    ),
  };
}
