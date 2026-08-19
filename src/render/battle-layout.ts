export const REFERENCE_VIEWPORT = Object.freeze({
  width: 1024,
  height: 768,
});

export interface BattleLayout {
  readonly width: number;
  readonly height: number;
  readonly actorScale: number;
  readonly groundY: number;
  readonly playerX: number;
  readonly targetX: number;
  readonly targetReticleY: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateBattleLayout(width: number, height: number): BattleLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const referenceArea = REFERENCE_VIEWPORT.width * REFERENCE_VIEWPORT.height;
  const areaScale = Math.sqrt((safeWidth * safeHeight) / referenceArea);
  const actorScale = clamp(areaScale, 0.94, 1.28);
  const groundY = safeHeight * 0.72;

  return {
    width: safeWidth,
    height: safeHeight,
    actorScale,
    groundY,
    playerX: safeWidth * (safeWidth < 640 ? 0.31 : 0.34),
    targetX: safeWidth * (safeWidth < 640 ? 0.73 : 0.7),
    targetReticleY: groundY - 108 * actorScale,
  };
}
