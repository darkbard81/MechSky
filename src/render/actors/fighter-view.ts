import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { FighterSnapshot } from "../../sim/world/world";
import { actorGroundSortKey } from "./ground-sort";
import {
  DIRECTIONAL_IDLE_FRAME_COUNT,
  resolveDirectionalIdleFrameAddress,
} from "./directional-idle";
import type { StageLayers } from "../stage-layers";

export const MECH_FEET_ANCHOR_Y = 228 / 256;

const HIT_FLASH_SECONDS = 0.12;

export interface FighterPalette {
  /** Multiplied over the shared idle sheet to separate the two mechs. */
  readonly bodyTint: number;
  readonly shadowTint: number;
  readonly flashTint: number;
}

export const PLAYER_PALETTE: FighterPalette = Object.freeze({
  bodyTint: 0xffffff,
  shadowTint: 0x071017,
  flashTint: 0xd8faff,
});

export const ENEMY_PALETTE: FighterPalette = Object.freeze({
  bodyTint: 0x8a5a52,
  shadowTint: 0x1a0806,
  flashTint: 0xffd0a8,
});

function createShadow(tint: number): Graphics {
  return new Graphics()
    .ellipse(0, 0, 60, 16)
    .fill({ color: 0x000000, alpha: 0.48 })
    .ellipse(0, -1, 36, 8)
    .fill({ color: tint, alpha: 0.52 });
}

/**
 * One mech on screen. It owns no combat state: everything it draws is derived
 * from the snapshot it is handed each frame.
 */
export class FighterView {
  private readonly root = new Container();
  private readonly sprite: Sprite;
  private readonly shadow: Graphics;
  private flashSeconds = 0;

  constructor(
    layers: StageLayers,
    private readonly textures: readonly Texture[],
    private readonly palette: FighterPalette,
    label: string,
  ) {
    const first = this.requireTexture(0, 0);

    this.sprite = new Sprite({
      texture: first,
      anchor: { x: 0.5, y: MECH_FEET_ANCHOR_Y },
    });
    this.sprite.tint = palette.bodyTint;
    this.sprite.label = `${label} body`;

    this.shadow = createShadow(palette.shadowTint);
    this.shadow.label = `${label} ground shadow`;

    this.root.label = `${label} view`;
    this.root.addChild(this.sprite);
    layers.shadows.addChild(this.shadow);
    layers.actors.addChild(this.root);
  }

  get texture(): Texture {
    return this.sprite.texture;
  }

  get position(): Readonly<{ x: number; y: number }> {
    return { x: this.root.position.x, y: this.root.position.y };
  }

  flash(): void {
    this.flashSeconds = HIT_FLASH_SECONDS;
  }

  present(fighter: FighterSnapshot, tick: number, deltaSeconds: number): void {
    const { position, velocity } = fighter.body;

    this.root.position.set(position.x, position.y);
    this.root.zIndex = actorGroundSortKey(fighter);

    const frame = resolveDirectionalIdleFrameAddress(fighter.facing, tick, fighter.state);
    this.sprite.texture = this.requireTexture(frame.row, frame.column);
    this.sprite.position.y = -position.elevation;

    const speedRatio = Math.min(
      Math.hypot(velocity.x, velocity.y) / Math.max(fighter.maximumSpeed, 1),
      1.5,
    );
    const lunge = fighter.actionKind === "attack" ? this.attackLunge(fighter) : 0;
    this.sprite.rotation = (velocity.x / Math.max(fighter.dashSpeed, 1)) * 0.07 + lunge * 0.08;
    this.sprite.scale.set(
      (fighter.state === "dashing" ? 1.06 : 1) + lunge * 0.05,
      1 - Math.min(speedRatio, 1) * 0.025 - Math.abs(lunge) * 0.02,
    );

    this.updateFlash(deltaSeconds, fighter);

    this.shadow.position.set(position.x, position.y + 3);
    this.shadow.alpha = Math.max(0.35, 1 - position.elevation / 280);
  }

  /**
   * Attack pose comes from the simulation's action frame, never from a Pixi
   * clock, so it cannot drift away from the hitbox.
   */
  private attackLunge(fighter: FighterSnapshot): number {
    if (fighter.actionDuration === 0) {
      return 0;
    }

    switch (fighter.attackPhase) {
      case "startup":
        return -0.6 * (1 - fighter.actionFrame / Math.max(1, fighter.actionDuration));
      case "active":
        return 1;
      case "recovery":
        return 0.35;
      default:
        return 0;
    }
  }

  private updateFlash(deltaSeconds: number, fighter: FighterSnapshot): void {
    if (this.flashSeconds > 0) {
      this.flashSeconds = Math.max(0, this.flashSeconds - deltaSeconds);
    }

    const flashing = this.flashSeconds > 0;
    const downed = fighter.health === 0;
    this.sprite.tint = flashing ? this.palette.flashTint : this.palette.bodyTint;
    this.sprite.alpha = downed ? 0.55 : 1;
  }

  private requireTexture(row: number, column: number): Texture {
    const texture = this.textures[row * DIRECTIONAL_IDLE_FRAME_COUNT + column];

    if (texture === undefined) {
      throw new RangeError(`Fighter texture is missing at row ${row}, column ${column}.`);
    }

    return texture;
  }
}
