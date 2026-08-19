import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import type { FighterSnapshot, SimulationSnapshot } from "../sim/world/world";
import type { BattleAssets } from "./assets/battle-assets";
import { actorGroundSortKey } from "./actors/ground-sort";
import { calculateBattleLayout, type BattleLayout } from "./battle-layout";
import { SmoothCamera } from "./camera/smooth-camera";
import type { StageLayers } from "./stage-layers";

const MECH_FEET_ANCHOR_Y = 228 / 256;
const AFTERIMAGE_COUNT = 5;
const AFTERIMAGE_LIFETIME_SECONDS = 0.2;
const AFTERIMAGE_INTERVAL_SECONDS = 0.035;

interface Afterimage {
  readonly sprite: Sprite;
  ageSeconds: number;
}

function createUnitPanel(color: number, alpha: number): Graphics {
  return new Graphics().rect(0, 0, 1, 1).fill({ color, alpha });
}

function createArenaBoundary(centerX: number, centerY: number, radius: number): Graphics {
  return new Graphics()
    .circle(centerX, centerY, radius)
    .fill({ color: 0x12343d, alpha: 0.12 })
    .stroke({ color: 0x69dce2, width: 4, alpha: 0.72 })
    .circle(centerX, centerY, radius - 12)
    .stroke({ color: 0xff9b7e, width: 1, alpha: 0.35 })
    .circle(centerX, centerY, radius * 0.5)
    .stroke({ color: 0x6fdde1, width: 1, alpha: 0.14 })
    .moveTo(centerX - radius, centerY)
    .lineTo(centerX + radius, centerY)
    .moveTo(centerX, centerY - radius)
    .lineTo(centerX, centerY + radius)
    .stroke({ color: 0x76cbd0, width: 1, alpha: 0.1 });
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

function createBoostTrail(): Graphics {
  return new Graphics()
    .poly([8, 0, -30, -10, -86, 0, -30, 10], true)
    .fill({ color: 0x59e8ee, alpha: 0.36 })
    .moveTo(-8, -15)
    .lineTo(-72, -25)
    .moveTo(-8, 15)
    .lineTo(-72, 25)
    .stroke({ color: 0xc8ffff, width: 3, alpha: 0.7 });
}

export class BattleScene {
  private readonly background = createUnitPanel(0x050b10, 1);
  private readonly floor: TilingSprite;
  private readonly floorWash: Graphics;
  private readonly arenaBoundary: Graphics;
  private readonly playerShadow = createGroundShadow();
  private readonly playerRoot = new Container({ label: "Player fighter view" });
  private readonly player: Sprite;
  private readonly afterimages: Afterimage[];
  private readonly boostTrail = createBoostTrail();
  private readonly targetGround = createTargetGroundMarker();
  private readonly targetReticle = createTargetReticle();
  private readonly camera = new SmoothCamera(8);
  private readonly arenaCenter: Readonly<{ x: number; y: number }>;
  private readonly arenaRadius: number;
  private readonly maximumCameraLookAhead: number;
  private layout: BattleLayout = calculateBattleLayout(1, 1);
  private afterimageCursor = 0;
  private afterimageAccumulator = 0;
  private lastDashSequence = 0;
  private horizontalFacing = 1;

  constructor(
    private readonly layers: StageLayers,
    assets: BattleAssets,
    initialSnapshot: SimulationSnapshot,
  ) {
    this.arenaCenter = { ...initialSnapshot.arena.center };
    this.arenaRadius = initialSnapshot.arena.radius;
    this.maximumCameraLookAhead = initialSnapshot.player.dashSpeed * 0.075;

    this.floor = new TilingSprite({
      texture: assets.hangarFloor,
      width: 1,
      height: 1,
    });
    this.floor.tileScale.set(0.82);
    this.floor.tint = 0xc2d0d8;
    this.floor.label = "Hangar floor";

    this.floorWash = createUnitPanel(0x06141c, 0.22);
    this.floorWash.label = "Arena atmosphere";

    this.arenaBoundary = createArenaBoundary(
      initialSnapshot.arena.center.x,
      initialSnapshot.arena.center.y,
      initialSnapshot.arena.radius,
    );
    this.arenaBoundary.label = "Arena movement boundary";

    this.player = new Sprite({
      texture: assets.playerMech,
      anchor: { x: 0.5, y: MECH_FEET_ANCHOR_Y },
    });
    this.player.label = "Player mech";
    this.playerRoot.addChild(this.player);

    this.afterimages = Array.from({ length: AFTERIMAGE_COUNT }, (_, index) => {
      const sprite = new Sprite({
        texture: assets.playerMech,
        anchor: { x: 0.5, y: MECH_FEET_ANCHOR_Y },
      });
      sprite.label = `Dash afterimage ${index + 1}`;
      sprite.tint = 0x77f5f2;
      sprite.visible = false;
      return { sprite, ageSeconds: AFTERIMAGE_LIFETIME_SECONDS };
    });

    this.background.label = "Arena backdrop";
    this.playerShadow.label = "Player ground shadow";
    this.boostTrail.label = "Player boost trail";
    this.targetGround.label = "Target ground marker";
    this.targetReticle.label = "Target lock reticle";

    layers.background.addChild(this.background);
    layers.arenaGround.addChild(this.floor, this.floorWash, this.arenaBoundary);
    layers.groundDecals.addChild(this.targetGround);
    layers.shadows.addChild(this.playerShadow);
    layers.actors.addChild(...this.afterimages.map(({ sprite }) => sprite), this.playerRoot);
    layers.effects.addChild(this.boostTrail, this.targetReticle);

    this.present(initialSnapshot, 0);
  }

  resize(width: number, height: number): void {
    this.layout = calculateBattleLayout(width, height);
    this.background.scale.set(this.layout.width, this.layout.height);
    this.layers.world.scale.set(this.layout.actorScale);
    this.resizeWorldFloor();
    this.applyCameraTransform();
  }

  present(snapshot: SimulationSnapshot, deltaSeconds: number): void {
    const { player } = snapshot;
    const { position, velocity } = player.body;
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.05);

    if (Math.abs(player.facing.x) > 0.05) {
      this.horizontalFacing = Math.sign(player.facing.x);
    }

    const speedRatio = Math.min(
      Math.hypot(velocity.x, velocity.y) / player.maximumSpeed,
      1.5,
    );
    const dashStretch = player.state === "dashing" ? 1.06 : 1;
    this.playerRoot.position.set(position.x, position.y);
    this.playerRoot.zIndex = actorGroundSortKey(player);
    this.player.position.y = -position.elevation;
    this.player.rotation = (velocity.x / player.dashSpeed) * 0.07;
    this.player.scale.set(
      this.horizontalFacing * dashStretch,
      1 - Math.min(speedRatio, 1) * 0.025,
    );

    this.playerShadow.position.set(position.x, position.y + 3);
    const elevationFade = Math.max(0.35, 1 - position.elevation / 280);
    this.playerShadow.alpha = elevationFade;

    this.presentDashEffects(snapshot, safeDelta);
    this.presentTarget(snapshot);

    const cameraTarget = {
      x: position.x + velocity.x * 0.075,
      y: position.y + velocity.y * 0.045,
    };
    this.camera.follow(cameraTarget, safeDelta);
    this.applyCameraTransform();
  }

  private presentDashEffects(snapshot: SimulationSnapshot, deltaSeconds: number): void {
    const { player } = snapshot;
    const { position, velocity } = player.body;
    const dashing = player.state === "dashing";

    if (player.dashSequence !== this.lastDashSequence) {
      this.lastDashSequence = player.dashSequence;
      this.afterimageAccumulator = AFTERIMAGE_INTERVAL_SECONDS;
    }

    this.afterimageAccumulator += deltaSeconds;
    if (dashing && this.afterimageAccumulator >= AFTERIMAGE_INTERVAL_SECONDS) {
      this.afterimageAccumulator %= AFTERIMAGE_INTERVAL_SECONDS;
      this.emitAfterimage(snapshot.player);
    }

    for (const afterimage of this.afterimages) {
      if (!afterimage.sprite.visible) {
        continue;
      }

      afterimage.ageSeconds += deltaSeconds;
      const life = 1 - afterimage.ageSeconds / AFTERIMAGE_LIFETIME_SECONDS;
      afterimage.sprite.alpha = Math.max(0, life) * 0.34;
      if (life <= 0) {
        afterimage.sprite.visible = false;
      }
    }

    this.boostTrail.visible = dashing;
    if (dashing) {
      this.boostTrail.position.set(position.x, position.y - 72);
      this.boostTrail.rotation = Math.atan2(velocity.y, velocity.x);
      this.boostTrail.alpha = 0.72 + Math.sin(snapshot.elapsedSeconds * 50) * 0.14;
    }
  }

  private emitAfterimage(player: FighterSnapshot): void {
    const afterimage = this.afterimages[this.afterimageCursor];
    if (afterimage === undefined) {
      return;
    }

    const { position, velocity } = player.body;
    afterimage.ageSeconds = 0;
    afterimage.sprite.visible = true;
    afterimage.sprite.alpha = 0.34;
    afterimage.sprite.position.set(position.x, position.y - position.elevation);
    afterimage.sprite.rotation = (velocity.x / player.dashSpeed) * 0.07;
    afterimage.sprite.scale.set(this.horizontalFacing * 1.04, 0.98);
    afterimage.sprite.zIndex = position.y - 0.25;
    this.afterimageCursor = (this.afterimageCursor + 1) % this.afterimages.length;
  }

  private presentTarget(snapshot: SimulationSnapshot): void {
    const locked = snapshot.player.lockedTargetId === snapshot.target.id;
    const target = snapshot.target.position;
    this.targetGround.position.set(target.x, target.y + 2);
    this.targetGround.alpha = locked ? 1 : 0.44;
    this.targetReticle.position.set(target.x, target.y - 78 - target.elevation);
    this.targetReticle.visible = locked;
    this.targetReticle.rotation = snapshot.elapsedSeconds * 0.55;
  }

  private applyCameraTransform(): void {
    const camera = this.camera.position;
    const scale = this.layout.actorScale;
    this.layers.world.position.set(
      this.layout.cameraAnchorX - camera.x * scale,
      this.layout.cameraAnchorY - camera.y * scale,
    );
  }

  private resizeWorldFloor(): void {
    const scale = this.layout.actorScale;
    const horizontalViewportReach =
      Math.max(
        this.layout.cameraAnchorX,
        this.layout.width - this.layout.cameraAnchorX,
      ) / scale;
    const verticalViewportReach =
      Math.max(
        this.layout.cameraAnchorY,
        this.layout.height - this.layout.cameraAnchorY,
      ) / scale;
    const halfWidth =
      this.arenaRadius + this.maximumCameraLookAhead + horizontalViewportReach + 64;
    const halfHeight =
      this.arenaRadius + this.maximumCameraLookAhead + verticalViewportReach + 64;

    this.floor.setSize(halfWidth * 2, halfHeight * 2);
    this.floor.position.set(
      this.arenaCenter.x - halfWidth,
      this.arenaCenter.y - halfHeight,
    );
    this.floor.tilePosition.set(-this.floor.position.x, -this.floor.position.y);
    this.floorWash.scale.set(halfWidth * 2, halfHeight * 2);
    this.floorWash.position.copyFrom(this.floor.position);
  }
}
