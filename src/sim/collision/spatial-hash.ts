/**
 * Uniform grid over the ground plane. Combat queries ask it for candidates and
 * then run the exact 2D + height check, so the grid never decides a hit.
 */
export interface SpatialEntry {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export class SpatialHash {
  private readonly cells = new Map<number, SpatialEntry[]>();

  constructor(private readonly cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError("Spatial hash cell size must be greater than zero.");
    }
  }

  clear(): void {
    this.cells.clear();
  }

  insert(entry: SpatialEntry): void {
    const minimumColumn = this.cellIndex(entry.x - entry.radius);
    const maximumColumn = this.cellIndex(entry.x + entry.radius);
    const minimumRow = this.cellIndex(entry.y - entry.radius);
    const maximumRow = this.cellIndex(entry.y + entry.radius);

    for (let row = minimumRow; row <= maximumRow; row += 1) {
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const key = this.cellKey(column, row);
        const bucket = this.cells.get(key);

        if (bucket === undefined) {
          this.cells.set(key, [entry]);
        } else {
          bucket.push(entry);
        }
      }
    }
  }

  /** Candidates whose cells overlap the query disc. May contain duplicates. */
  query(x: number, y: number, radius: number): readonly SpatialEntry[] {
    const found: SpatialEntry[] = [];
    const seen = new Set<number>();
    const minimumColumn = this.cellIndex(x - radius);
    const maximumColumn = this.cellIndex(x + radius);
    const minimumRow = this.cellIndex(y - radius);
    const maximumRow = this.cellIndex(y + radius);

    for (let row = minimumRow; row <= maximumRow; row += 1) {
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const bucket = this.cells.get(this.cellKey(column, row));

        if (bucket === undefined) {
          continue;
        }

        for (const entry of bucket) {
          if (!seen.has(entry.id)) {
            seen.add(entry.id);
            found.push(entry);
          }
        }
      }
    }

    return found;
  }

  private cellIndex(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private cellKey(column: number, row: number): number {
    // Cantor-style pairing keeps negative coordinates distinct without strings.
    const a = column >= 0 ? column * 2 : -column * 2 - 1;
    const b = row >= 0 ? row * 2 : -row * 2 - 1;
    return ((a + b) * (a + b + 1)) / 2 + b;
  }
}
