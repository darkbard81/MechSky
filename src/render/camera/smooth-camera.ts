import type { Vector2 } from "../../sim/math/vector2";

export class SmoothCamera {
  private initialized = false;
  private readonly current: Vector2 = { x: 0, y: 0 };

  constructor(private readonly sharpness = 8) {
    if (sharpness <= 0) {
      throw new RangeError("Camera sharpness must be greater than zero.");
    }
  }

  follow(target: Readonly<Vector2>, deltaSeconds: number): Readonly<Vector2> {
    if (!this.initialized) {
      this.current.x = target.x;
      this.current.y = target.y;
      this.initialized = true;
      return this.position;
    }

    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.05);
    const blend = 1 - Math.exp(-this.sharpness * safeDelta);
    this.current.x += (target.x - this.current.x) * blend;
    this.current.y += (target.y - this.current.y) * blend;
    return this.position;
  }

  get position(): Readonly<Vector2> {
    return { ...this.current };
  }
}
