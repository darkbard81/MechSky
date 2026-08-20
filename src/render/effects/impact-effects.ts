import { Container, Graphics } from "pixi.js";
import type {
  GroundImpactEvent,
  HitLandedEvent,
} from "../../sim/world/sim-event";

const SPARK_POOL_SIZE = 8;
const SPARK_LIFETIME_SECONDS = 0.26;

interface PooledSpark {
  readonly view: Graphics;
  ageSeconds: number;
  scale: number;
}

function createSpark(): Graphics {
  const spark = new Graphics();

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    spark
      .moveTo(Math.cos(angle) * 14, Math.sin(angle) * 14)
      .lineTo(Math.cos(angle) * 52, Math.sin(angle) * 52);
  }

  return spark
    .stroke({ color: 0xfff0c4, width: 5, alpha: 0.95 })
    .circle(0, 0, 26)
    .fill({ color: 0xffd166, alpha: 0.55 })
    .circle(0, 0, 12)
    .fill({ color: 0xffffff, alpha: 0.9 });
}

/**
 * Impact visuals are driven by SimEvents, never by reading combat state. The
 * simulation does not know these exist.
 */
export class ImpactEffects {
  private readonly sparks: PooledSpark[];
  private cursor = 0;

  constructor(effectsLayer: Container) {
    this.sparks = Array.from({ length: SPARK_POOL_SIZE }, (_, index) => {
      const view = createSpark();
      view.label = `Hit spark ${index + 1}`;
      view.visible = false;
      effectsLayer.addChild(view);
      return { view, ageSeconds: SPARK_LIFETIME_SECONDS, scale: 1 };
    });
  }

  spawn(event: HitLandedEvent): void {
    this.spawnAt(
      event.x,
      event.y - event.elevation,
      0.85 + Math.min(event.severity, 1.4) * 0.5,
      event.comboCount * 0.7,
    );
  }

  spawnGroundImpact(event: GroundImpactEvent): void {
    this.spawnAt(
      event.x,
      event.y,
      1.45 + Math.min(event.severity, 2) * 0.55,
      Math.PI / 8,
    );
  }

  private spawnAt(x: number, y: number, scale: number, rotation: number): void {
    const spark = this.sparks[this.cursor];
    if (spark === undefined) {
      return;
    }

    this.cursor = (this.cursor + 1) % this.sparks.length;
    spark.ageSeconds = 0;
    spark.scale = scale;
    spark.view.visible = true;
    spark.view.alpha = 1;
    spark.view.position.set(x, y);
    spark.view.rotation = rotation;
    spark.view.scale.set(spark.scale * 0.55);
  }

  advance(deltaSeconds: number): void {
    for (const spark of this.sparks) {
      if (!spark.view.visible) {
        continue;
      }

      spark.ageSeconds += deltaSeconds;
      const life = spark.ageSeconds / SPARK_LIFETIME_SECONDS;

      if (life >= 1) {
        spark.view.visible = false;
        continue;
      }

      spark.view.alpha = 1 - life * life;
      spark.view.scale.set(spark.scale * (0.55 + life * 0.85));
    }
  }
}
