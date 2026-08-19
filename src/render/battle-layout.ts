export const REFERENCE_VIEWPORT = Object.freeze({
  width: 1024,
  height: 768,
});

export interface BattleLayout {
  readonly width: number;
  readonly height: number;
  readonly actorScale: number;
  readonly cameraAnchorX: number;
  readonly cameraAnchorY: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateBattleLayout(width: number, height: number): BattleLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const referenceArea = REFERENCE_VIEWPORT.width * REFERENCE_VIEWPORT.height;
  const areaScale = Math.sqrt((safeWidth * safeHeight) / referenceArea);
  const actorScale = clamp(areaScale, 0.88, 1.28);

  return {
    width: safeWidth,
    height: safeHeight,
    actorScale,
    cameraAnchorX: safeWidth * (safeWidth < 640 ? 0.48 : 0.44),
    cameraAnchorY: safeHeight * 0.62,
  };
}
