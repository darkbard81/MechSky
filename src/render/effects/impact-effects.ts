import { Container, Sprite, type Texture } from "pixi.js";
import type {
  GroundImpactEvent,
  HitLandedEvent,
} from "../../sim/world/sim-event";

const EFFECT_POOL_SIZE = 16;
const HIT_EFFECT_LIFETIME_SECONDS = 0.2;
const SLASH_EFFECT_LIFETIME_SECONDS = 0.24;
const GROUND_EFFECT_LIFETIME_SECONDS = 0.34;
const GROUND_FX_ANCHOR_Y = 233 / 256;

export interface CombatEffectTextures {
  readonly slash: readonly Texture[];
  readonly impact: readonly Texture[];
  readonly groundSlam: readonly Texture[];
}

interface PooledEffect {
  readonly view: Sprite;
  frames: readonly Texture[];
  ageSeconds: number;
  lifetimeSeconds: number;
  startScale: number;
  endScale: number;
}

/** SimEvents choose an effect; render time alone advances its presentation. */
export class ImpactEffects {
  private readonly effects: PooledEffect[];
  private cursor = 0;

  constructor(
    effectsLayer: Container,
    private readonly textures: CombatEffectTextures,
  ) {
    const firstTexture = this.requireFrame(textures.impact, 0, "impact");
    this.effects = Array.from({ length: EFFECT_POOL_SIZE }, (_, index) => {
      const view = new Sprite({ texture: firstTexture, anchor: 0.5 });
      view.label = `Combat effect ${index + 1}`;
      view.visible = false;
      effectsLayer.addChild(view);
      return {
        view,
        frames: textures.impact,
        ageSeconds: HIT_EFFECT_LIFETIME_SECONDS,
        lifetimeSeconds: HIT_EFFECT_LIFETIME_SECONDS,
        startScale: 1,
        endScale: 1,
      };
    });
  }

  spawn(event: HitLandedEvent): void {
    const scale = 0.72 + Math.min(event.severity, 1.4) * 0.28;
    this.spawnAt({
      x: event.x,
      y: event.y - event.elevation,
      frames: this.textures.slash,
      lifetimeSeconds: SLASH_EFFECT_LIFETIME_SECONDS,
      startScale: scale * 0.75,
      endScale: scale * 1.2,
      rotation: event.comboCount * 0.7,
      anchorY: 0.5,
    });
    this.spawnAt({
      x: event.x,
      y: event.y - event.elevation,
      frames: this.textures.impact,
      lifetimeSeconds: HIT_EFFECT_LIFETIME_SECONDS,
      startScale: scale * 0.52,
      endScale: scale,
      rotation: -event.comboCount * 0.3,
      anchorY: 0.5,
    });
  }

  spawnGroundImpact(event: GroundImpactEvent): void {
    const scale = 1.1 + Math.min(event.severity, 2) * 0.34;
    this.spawnAt({
      x: event.x,
      y: event.y,
      frames: this.textures.groundSlam,
      lifetimeSeconds: GROUND_EFFECT_LIFETIME_SECONDS,
      startScale: scale * 0.72,
      endScale: scale * 1.12,
      rotation: 0,
      anchorY: GROUND_FX_ANCHOR_Y,
    });
  }

  advance(deltaSeconds: number): void {
    for (const effect of this.effects) {
      if (!effect.view.visible) {
        continue;
      }

      effect.ageSeconds += deltaSeconds;
      const progress = effect.ageSeconds / effect.lifetimeSeconds;
      if (progress >= 1) {
        effect.view.visible = false;
        continue;
      }

      const frameIndex = Math.min(
        effect.frames.length - 1,
        Math.floor(progress * effect.frames.length),
      );
      effect.view.texture = this.requireFrame(effect.frames, frameIndex, "effect");
      effect.view.alpha = Math.min(1, (1 - progress) * 1.35);
      const scale =
        effect.startScale + (effect.endScale - effect.startScale) * progress;
      effect.view.scale.set(scale);
    }
  }

  private spawnAt(options: {
    readonly x: number;
    readonly y: number;
    readonly frames: readonly Texture[];
    readonly lifetimeSeconds: number;
    readonly startScale: number;
    readonly endScale: number;
    readonly rotation: number;
    readonly anchorY: number;
  }): void {
    const effect = this.effects[this.cursor];
    if (effect === undefined) {
      return;
    }

    this.cursor = (this.cursor + 1) % this.effects.length;
    effect.frames = options.frames;
    effect.ageSeconds = 0;
    effect.lifetimeSeconds = options.lifetimeSeconds;
    effect.startScale = options.startScale;
    effect.endScale = options.endScale;
    effect.view.texture = this.requireFrame(options.frames, 0, "effect");
    effect.view.anchor.set(0.5, options.anchorY);
    effect.view.position.set(options.x, options.y);
    effect.view.rotation = options.rotation;
    effect.view.scale.set(options.startScale);
    effect.view.alpha = 1;
    effect.view.visible = true;
  }

  private requireFrame(
    frames: readonly Texture[],
    index: number,
    label: string,
  ): Texture {
    const texture = frames[index];
    if (texture === undefined) {
      throw new RangeError(`${label} texture is missing at frame ${index}.`);
    }
    return texture;
  }
}
