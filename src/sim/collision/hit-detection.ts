/**
 * Combat collision is deliberately separate from movement collision: a plane
 * overlap test AND a height interval overlap test, never a physics solver.
 */
export interface GroundDisc {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface HeightInterval {
  readonly minimumElevation: number;
  readonly maximumElevation: number;
}

export function discsOverlap(a: GroundDisc, b: GroundDisc): boolean {
  const reach = a.radius + b.radius;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= reach * reach;
}

export function heightIntervalsOverlap(a: HeightInterval, b: HeightInterval): boolean {
  return (
    a.minimumElevation <= b.maximumElevation && b.minimumElevation <= a.maximumElevation
  );
}

export function hitConnects(
  attack: GroundDisc & HeightInterval,
  target: GroundDisc & HeightInterval,
): boolean {
  return discsOverlap(attack, target) && heightIntervalsOverlap(attack, target);
}

/** Height the two intervals share, used to place impact effects. */
export function overlapElevation(a: HeightInterval, b: HeightInterval): number {
  const low = Math.max(a.minimumElevation, b.minimumElevation);
  const high = Math.min(a.maximumElevation, b.maximumElevation);
  return (low + high) / 2;
}
