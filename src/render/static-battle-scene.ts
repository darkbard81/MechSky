import { Graphics, Sprite, TilingSprite } from "pixi.js";
import type { BattleAssets } from "./assets/battle-assets";
import { calculateBattleLayout } from "./battle-layout";
import type { StageLayers } from "./stage-layers";

const MECH_FEET_ANCHOR_Y = 228 / 256;

function createUnitPanel(color: number, alpha: number): Graphics {
  return new Graphics().rect(0, 0, 1, 1).fill({ color, alpha });
}

function createGroundShadow(): Graphics {
  return new Graphics()
    .ellipse(0, 0, 60, 16)
    .fill({ color: 0x000000, alpha: 0.48 })
    .ellipse(0, -1, 36, 8)
    .fill({ color: 0x071017, alpha: 0.52 });
}

function createTargetGroundMarker(): Graphics {
  return new Graphics()
    .ellipse(0, 0, 58, 17)
    .stroke({ color: 0xff8b68, width: 2, alpha: 0.88 })
    .ellipse(0, 0, 42, 12)
    .stroke({ color: 0x68e7ef, width: 1, alpha: 0.55 })
    .moveTo(-72, 0)
    .lineTo(-52, 0)
    .moveTo(52, 0)
    .lineTo(72, 0)
    .stroke({ color: 0xffb09a, width: 3, alpha: 0.9 });
}

function createTargetReticle(): Graphics {
  return new Graphics()
    .circle(0, 0, 31)
    .stroke({ color: 0xff8b68, width: 2, alpha: 0.92 })
    .moveTo(-42, -22)
    .lineTo(-42, -34)
    .lineTo(-30, -34)
    .moveTo(42, -22)
    .lineTo(42, -34)
    .lineTo(30, -34)
    .moveTo(-42, 22)
    .lineTo(-42, 34)
    .lineTo(-30, 34)
    .moveTo(42, 22)
    .lineTo(42, 34)
    .lineTo(30, 34)
    .stroke({ color: 0x68e7ef, width: 3, alpha: 0.9 })
    .circle(0, 0, 3)
    .fill({ color: 0xffc5b5, alpha: 0.95 });
}

export class StaticBattleScene {
  private readonly background = createUnitPanel(0x050b10, 1);
  private readonly floor: TilingSprite;
  private readonly floorWash = createUnitPanel(0x06141c, 0.22);
  private readonly playerShadow = createGroundShadow();
  private readonly player: Sprite;
  private readonly targetGround = createTargetGroundMarker();
  private readonly targetReticle = createTargetReticle();

  constructor(layers: StageLayers, assets: BattleAssets) {
    this.floor = new TilingSprite({
      texture: assets.hangarFloor,
      width: 1,
      height: 1,
      roundPixels: true,
    });
    this.floor.label = "Hangar floor";
    this.floor.tint = 0xc2d0d8;

    this.player = new Sprite({
      texture: assets.playerMech,
      anchor: { x: 0.5, y: MECH_FEET_ANCHOR_Y },
      roundPixels: true,
    });
    this.player.label = "Player mech";

    this.background.label = "Arena backdrop";
    this.floorWash.label = "Arena atmosphere";
    this.playerShadow.label = "Player ground shadow";
    this.targetGround.label = "Target ground marker";
    this.targetReticle.label = "Target reticle";

    layers.background.addChild(this.background);
    layers.arenaGround.addChild(this.floor, this.floorWash);
    layers.groundDecals.addChild(this.targetGround);
    layers.shadows.addChild(this.playerShadow);
    layers.actors.addChild(this.player);
    layers.debug.addChild(this.targetReticle);
  }

  resize(width: number, height: number): void {
    const layout = calculateBattleLayout(width, height);

    this.background.scale.set(layout.width, layout.height);
    this.floor.setSize(layout.width, layout.height);
    this.floor.tileScale.set(0.82 * layout.actorScale);
    this.floor.tilePosition.set(layout.width * -0.05, layout.height * -0.08);
    this.floorWash.scale.set(layout.width, layout.height);

    this.player.position.set(layout.playerX, layout.groundY);
    this.player.scale.set(layout.actorScale);
    this.player.zIndex = layout.groundY;

    this.playerShadow.position.set(layout.playerX, layout.groundY + 3);
    this.playerShadow.scale.set(layout.actorScale);

    this.targetGround.position.set(layout.targetX, layout.groundY + 2);
    this.targetGround.scale.set(layout.actorScale);
    this.targetReticle.position.set(layout.targetX, layout.targetReticleY);
    this.targetReticle.scale.set(layout.actorScale);
  }
}
