import { Rectangle, Texture } from "pixi.js";

export const COMBAT_FRAME_SIZE = 256;

export function createSheetTextures(
  sheet: Texture,
  rows: number,
  columns: number,
  label: string,
): readonly Texture[] {
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
    throw new RangeError("Sprite sheet rows and columns must be positive integers.");
  }

  const expectedWidth = columns * COMBAT_FRAME_SIZE;
  const expectedHeight = rows * COMBAT_FRAME_SIZE;
  if (sheet.width !== expectedWidth || sheet.height !== expectedHeight) {
    throw new RangeError(
      `${label} sheet must be ${expectedWidth} by ${expectedHeight} pixels.`,
    );
  }

  return Object.freeze(
    Array.from({ length: rows * columns }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      return new Texture({
        frame: new Rectangle(
          column * COMBAT_FRAME_SIZE,
          row * COMBAT_FRAME_SIZE,
          COMBAT_FRAME_SIZE,
          COMBAT_FRAME_SIZE,
        ),
        label: `${label} ${index + 1}`,
        source: sheet.source,
      });
    }),
  );
}
