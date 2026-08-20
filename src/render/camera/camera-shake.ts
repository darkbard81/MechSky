import type { Vector2 } from "../../sim/math/vector2";

const DECAY_PER_SECOND = 7.5;

/**
 * Deterministic shake: the offset comes from elapsed time and the current
 * trauma, so it never touches Math.random and never feeds back into the world.
 */
export class CameraShake {
  private trauma = 0;
  private elapsedSeconds = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  advance(deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;
    this.trauma = Math.max(0, this.trauma - DECAY_PER_SECOND * deltaSeconds * this.trauma);

    if (this.trauma < 0.001) {
      this.trauma = 0;
    }
  }

  get offset(): Readonly<Vector2> {
    if (this.trauma === 0) {
      return { x: 0, y: 0 };
    }

    const magnitude = this.trauma * this.trauma * 18;
    return {
      x: Math.sin(this.elapsedSeconds * 71) * magnitude,
      y: Math.cos(this.elapsedSeconds * 53) * magnitude * 0.7,
    };
  }

  get intensity(): number {
    return this.trauma;
  }
}
