export interface Vector2 {
  x: number;
  y: number;
}

export const ZERO_VECTOR: Readonly<Vector2> = Object.freeze({ x: 0, y: 0 });

export function vectorLength(vector: Readonly<Vector2>): number {
  return Math.hypot(vector.x, vector.y);
}

export function normalizeOrZero(vector: Readonly<Vector2>): Vector2 {
  const length = vectorLength(vector);

  if (length <= Number.EPSILON) {
    return { ...ZERO_VECTOR };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

export function clampVectorMagnitude(
  vector: Readonly<Vector2>,
  maximum = 1,
): Vector2 {
  const length = vectorLength(vector);

  if (length <= maximum || length <= Number.EPSILON) {
    return { x: vector.x, y: vector.y };
  }

  const scale = maximum / length;
  return { x: vector.x * scale, y: vector.y * scale };
}

export function moveVectorToward(
  current: Readonly<Vector2>,
  target: Readonly<Vector2>,
  maximumDelta: number,
): Vector2 {
  const difference = {
    x: target.x - current.x,
    y: target.y - current.y,
  };
  const distance = vectorLength(difference);

  if (distance <= maximumDelta || distance <= Number.EPSILON) {
    return { x: target.x, y: target.y };
  }

  const scale = maximumDelta / distance;
  return {
    x: current.x + difference.x * scale,
    y: current.y + difference.y * scale,
  };
}
