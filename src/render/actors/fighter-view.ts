import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { FighterSnapshot } from "../../sim/world/world";
import { actorGroundSortKey } from "./ground-sort";
import type { StageLayers } from "../stage-layers";
import { projectFighter } from "./fighter-projection";
import {
  resolveMechFrame,
  type MechAnimationSheet,
} from "../animation/mech-action-animation";

export const MECH_FEET_ANCHOR_Y = 228 / 256;

const HIT_FLASH_SECONDS = 0.12;
const CENTER_ALIGNED_OFFSET_Y = 128 - 228;

export type MechTextureSet = Readonly<
  Record<MechAnimationSheet, readonly Texture[]>
>;

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
    private readonly textures: MechTextureSet,
    private readonly palette: FighterPalette,
    label: string,
  ) {
    const first = this.requireTexture("idle", 0);

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

  copyPresentationTo(sprite: Sprite): void {
    sprite.texture = this.sprite.texture;
    sprite.anchor.copyFrom(this.sprite.anchor);
    sprite.position.set(
      this.root.position.x + this.sprite.position.x,
      this.root.position.y + this.sprite.position.y,
    );
    sprite.rotation = this.sprite.rotation;
    sprite.scale.copyFrom(this.sprite.scale);
  }

  flash(): void {
    this.flashSeconds = HIT_FLASH_SECONDS;
  }

  present(fighter: FighterSnapshot, tick: number, deltaSeconds: number): void {
    const { position } = fighter.body;
    const projection = projectFighter(position);

    this.root.position.set(projection.actor.x, projection.actor.y);
    this.root.zIndex = actorGroundSortKey(fighter);

    const frame = resolveMechFrame(fighter, tick);
    this.sprite.texture = this.requireTexture(frame.sheet, frame.frameIndex);
    const centerAligned = frame.sheet === "airCombo" || frame.sheet === "finisher";
    this.sprite.anchor.set(0.5, centerAligned ? 0.5 : MECH_FEET_ANCHOR_Y);
    this.sprite.position.set(
      0,
      projection.spriteOffsetY + (centerAligned ? CENTER_ALIGNED_OFFSET_Y : 0),
    );
    this.sprite.rotation = 0;
    this.sprite.scale.set(frame.horizontalScale, 1);

    this.updateFlash(deltaSeconds);

    this.shadow.position.set(projection.shadow.x, projection.shadow.y);
    this.shadow.alpha = Math.max(0.35, 1 - position.elevation / 280);
    const shadowScale = Math.max(0.62, 1 - position.elevation / 700);
    this.shadow.scale.set(shadowScale);
  }

  private updateFlash(deltaSeconds: number): void {
    if (this.flashSeconds > 0) {
      this.flashSeconds = Math.max(0, this.flashSeconds - deltaSeconds);
    }

    const flashing = this.flashSeconds > 0;
    this.sprite.tint = flashing ? this.palette.flashTint : this.palette.bodyTint;
    this.sprite.alpha = 1;
  }

  private requireTexture(sheet: MechAnimationSheet, frameIndex: number): Texture {
    const texture = this.textures[sheet][frameIndex];

    if (texture === undefined) {
      throw new RangeError(
        `Fighter texture is missing in ${sheet} at frame ${frameIndex}.`,
      );
    }

    return texture;
  }
}
