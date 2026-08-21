import { Sprite, Texture } from "pixi.js";
import type { SimulationSnapshot } from "../../sim/world/world";
import type { StageLayers } from "../stage-layers";

const MAX_PROJECTILE_COUNT = 5_000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Dev-only draw-load field. Positions are a pure function of snapshot tick and id. */
export class ProjectileStressView {
  private readonly sprites: Sprite[] = [];
  private activeCount = 0;

  constructor(private readonly layers: StageLayers) {}

  get count(): number {
    return this.activeCount;
  }

  setCount(count: number): void {
    if (!Number.isInteger(count) || count < 0 || count > MAX_PROJECTILE_COUNT) {
      throw new RangeError(
        `Development projectile count must be between 0 and ${MAX_PROJECTILE_COUNT}.`,
      );
    }

    while (this.sprites.length < count) {
      const index = this.sprites.length;
      const sprite = new Sprite({
        texture: Texture.WHITE,
        anchor: 0.5,
      });
      sprite.label = index === 0 ? "Development projectile field" : "";
      sprite.setSize(index % 7 === 0 ? 4 : 3);
      sprite.tint = index % 5 === 0 ? 0xff9b6e : 0x6ff7ef;
      sprite.alpha = index % 3 === 0 ? 0.78 : 0.56;
      this.sprites.push(sprite);
      this.layers.projectiles.addChild(sprite);
    }

    this.activeCount = count;
    for (let index = 0; index < this.sprites.length; index += 1) {
      const sprite = this.sprites[index];
      if (sprite !== undefined) {
        sprite.visible = index < count;
      }
    }
  }

  present(snapshot: SimulationSnapshot): void {
    const radius = snapshot.arena.radius - 10;
    const tickRotation = snapshot.tick * 0.0125;

    for (let index = 0; index < this.activeCount; index += 1) {
      const sprite = this.sprites[index];
      if (sprite === undefined) {
        throw new RangeError(`Development projectile ${index} was not allocated.`);
      }

      const normalizedRadius = ((index * 73) % 997) / 997;
      const angle = index * GOLDEN_ANGLE + tickRotation * (1 + (index % 5) * 0.08);
      const distance = 22 + normalizedRadius * (radius - 22);
      sprite.position.set(
        snapshot.arena.center.x + Math.cos(angle) * distance,
        snapshot.arena.center.y + Math.sin(angle) * distance,
      );
    }
  }
}
