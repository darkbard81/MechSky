import { Graphics, Sprite, TilingSprite, type Texture } from "pixi.js";
import type { FighterSnapshot, SimulationSnapshot } from "../sim/world/world";
import type { SimEvent } from "../sim/world/sim-event";
import type { BattleAssets } from "./assets/battle-assets";
import {
  ENEMY_PALETTE,
  FighterView,
  MECH_FEET_ANCHOR_Y,
  PLAYER_PALETTE,
  type MechTextureSet,
} from "./actors/fighter-view";
import { createSheetTextures } from "./assets/sheet-textures";
import { calculateBattleLayout, type BattleLayout } from "./battle-layout";
import { CameraShake } from "./camera/camera-shake";
import { resolveBattleCameraTarget } from "./camera/battle-camera-target";
import { SmoothCamera } from "./camera/smooth-camera";
import { DebugOverlay, type DebugLayerName } from "./debug/debug-overlay";
import { ImpactEffects } from "./effects/impact-effects";
import type { StageLayers } from "./stage-layers";

const AFTERIMAGE_COUNT = 5;
const AFTERIMAGE_LIFETIME_SECONDS = 0.2;
const AFTERIMAGE_INTERVAL_SECONDS = 0.035;

interface Afterimage {
  readonly sprite: Sprite;
  ageSeconds: number;
}

function createMechTextures(assets: BattleAssets): MechTextureSet {
  return Object.freeze({
    idle: createSheetTextures(assets.playerMechIdle, 4, 4, "Mech idle"),
    move: createSheetTextures(assets.playerMechMove, 2, 3, "Mech move"),
    groundCombo: createSheetTextures(
      assets.playerMechGroundCombo,
      2,
      4,
      "Mech ground combo",
    ),
    launcher: createSheetTextures(assets.playerMechLauncher, 2, 3, "Mech launcher"),
    airCombo: createSheetTextures(assets.playerMechAirCombo, 2, 3, "Mech air combo"),
    finisher: createSheetTextures(assets.playerMechFinisher, 2, 3, "Mech finisher"),
    hurt: createSheetTextures(assets.playerMechHurt, 2, 2, "Mech hurt"),
    knockdown: createSheetTextures(
      assets.playerMechKnockdown,
      2,
      3,
      "Mech knockdown",
    ),
  });
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

export class BattleScene {
  private readonly background = createUnitPanel(0x050b10, 1);
  private readonly floor: TilingSprite;
  private readonly floorWash: Graphics;
  private readonly arenaBoundary: Graphics;
  private readonly playerView: FighterView;
  private readonly enemyView: FighterView;
  private readonly afterimages: Afterimage[];
  private readonly boostTrail: Sprite;
  private readonly boostTextures: readonly Texture[];
  private readonly targetGround = createTargetGroundMarker();
  private readonly targetReticle = createTargetReticle();
  private readonly impacts: ImpactEffects;
  private readonly debug: DebugOverlay;
  private readonly camera = new SmoothCamera(8);
  private readonly shake = new CameraShake();
  private readonly arenaCenter: Readonly<{ x: number; y: number }>;
  private readonly arenaRadius: number;
  private readonly maximumCameraLookAhead: number;
  private readonly playerId: number;
  private readonly enemyId: number;
  private layout: BattleLayout = calculateBattleLayout(1, 1);
  private afterimageCursor = 0;
  private afterimageAccumulator = 0;
  private lastDashSequence = 0;

  constructor(
    private readonly layers: StageLayers,
    assets: BattleAssets,
    initialSnapshot: SimulationSnapshot,
  ) {
    this.arenaCenter = { ...initialSnapshot.arena.center };
    this.arenaRadius = initialSnapshot.arena.radius;
    this.maximumCameraLookAhead = initialSnapshot.player.dashSpeed * 0.075;
    this.playerId = initialSnapshot.player.id;
    this.enemyId = initialSnapshot.enemy.id;

    const mechTextures = createMechTextures(assets);
    this.playerView = new FighterView(
      layers,
      mechTextures,
      PLAYER_PALETTE,
      "Player mech",
    );
    this.enemyView = new FighterView(
      layers,
      mechTextures,
      ENEMY_PALETTE,
      "Enemy mech",
    );

    this.boostTextures = createSheetTextures(assets.mechBoostFx, 2, 2, "Mech boost");
    const firstBoostTexture = this.boostTextures[0];
    if (firstBoostTexture === undefined) {
      throw new Error("Mech boost sheet has no frames.");
    }
    this.boostTrail = new Sprite({
      texture: firstBoostTexture,
      anchor: { x: 0.82, y: 0.5 },
    });
    this.boostTrail.scale.set(0.72);

    this.floor = new TilingSprite({ texture: assets.hangarFloor, width: 1, height: 1 });
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

    const firstTexture = this.playerView.texture;
    this.afterimages = Array.from({ length: AFTERIMAGE_COUNT }, (_, index) => {
      const sprite = new Sprite({
        texture: firstTexture,
        anchor: { x: 0.5, y: MECH_FEET_ANCHOR_Y },
      });
      sprite.label = `Dash afterimage ${index + 1}`;
      sprite.tint = 0x77f5f2;
      sprite.visible = false;
      return { sprite, ageSeconds: AFTERIMAGE_LIFETIME_SECONDS };
    });

    this.background.label = "Arena backdrop";
    this.boostTrail.label = "Player boost trail";
    this.targetGround.label = "Target ground marker";
    this.targetReticle.label = "Target lock reticle";

    layers.background.addChild(this.background);
    layers.arenaGround.addChild(this.floor, this.floorWash, this.arenaBoundary);
    layers.groundDecals.addChild(this.targetGround);
    layers.actors.addChild(...this.afterimages.map(({ sprite }) => sprite));
    layers.effects.addChild(this.boostTrail, this.targetReticle);

    this.impacts = new ImpactEffects(layers.effects, {
      slash: createSheetTextures(assets.mechSlashFx, 2, 2, "Mech slash"),
      impact: createSheetTextures(assets.mechImpactFx, 2, 2, "Mech impact"),
      groundSlam: createSheetTextures(
        assets.mechGroundSlamFx,
        2,
        2,
        "Mech ground slam",
      ),
    });
    this.debug = new DebugOverlay(layers.debug);

    this.present(initialSnapshot, 0);
  }

  toggleDebugLayer(layer: DebugLayerName): boolean {
    return this.debug.toggle(layer);
  }

  isDebugLayerEnabled(layer: DebugLayerName): boolean {
    return this.debug.isEnabled(layer);
  }

  /** Consumes simulation events. The scene never reads combat state directly. */
  consume(events: readonly SimEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "hit-landed":
          this.impacts.spawn(event);
          this.fighterViewForId(event.targetId)?.flash();
          this.shake.add(0.22 + Math.min(event.severity, 1.2) * 0.28);
          break;
        case "ground-impact":
          this.impacts.spawnGroundImpact(event);
          this.fighterViewForId(event.fighterId)?.flash();
          this.shake.add(0.62 + Math.min(event.severity, 1.5) * 0.2);
          break;
        default:
          break;
      }
    }
  }

  resize(width: number, height: number): void {
    this.layout = calculateBattleLayout(width, height);
    this.background.scale.set(this.layout.width, this.layout.height);
    this.layers.world.scale.set(this.layout.actorScale);
    this.resizeWorldFloor();
    this.applyCameraTransform();
  }

  present(snapshot: SimulationSnapshot, deltaSeconds: number): void {
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.05);
    const { player } = snapshot;

    this.playerView.present(player, snapshot.tick, safeDelta);
    this.enemyView.present(snapshot.enemy, snapshot.tick, safeDelta);

    this.presentDashEffects(snapshot, safeDelta);
    this.presentTarget(snapshot);

    this.impacts.advance(safeDelta);
    this.shake.advance(safeDelta);
    this.debug.present(snapshot);

    this.camera.follow(resolveBattleCameraTarget(snapshot), safeDelta);
    this.applyCameraTransform();
  }

  private fighterViewForId(id: number): FighterView | null {
    if (id === this.playerId) {
      return this.playerView;
    }
    return id === this.enemyId ? this.enemyView : null;
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
      this.emitAfterimage(player);
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
      const frameIndex = Math.floor(snapshot.tick / 2) % this.boostTextures.length;
      const texture = this.boostTextures[frameIndex];
      if (texture === undefined) {
        throw new RangeError(`Boost texture is missing at frame ${frameIndex}.`);
      }
      this.boostTrail.texture = texture;
      this.boostTrail.position.set(
        position.x,
        position.y - position.elevation - 78,
      );
      this.boostTrail.rotation = Math.atan2(velocity.y, velocity.x);
      this.boostTrail.alpha = 0.78;
    }
  }

  private emitAfterimage(player: FighterSnapshot): void {
    const afterimage = this.afterimages[this.afterimageCursor];
    if (afterimage === undefined) {
      return;
    }

    const { position } = player.body;
    afterimage.ageSeconds = 0;
    afterimage.sprite.visible = true;
    afterimage.sprite.alpha = 0.34;
    this.playerView.copyPresentationTo(afterimage.sprite);
    afterimage.sprite.zIndex = position.y - 0.25;
    this.afterimageCursor = (this.afterimageCursor + 1) % this.afterimages.length;
  }

  private presentTarget(snapshot: SimulationSnapshot): void {
    const locked = snapshot.player.lockedTargetId === snapshot.enemy.id;
    const target = snapshot.enemy.body.position;
    this.targetGround.position.set(target.x, target.y + 2);
    this.targetGround.alpha = locked ? 1 : 0.44;
    this.targetReticle.position.set(target.x, target.y - 78 - target.elevation);
    this.targetReticle.visible = locked;
    this.targetReticle.rotation = snapshot.elapsedSeconds * 0.55;
  }

  private applyCameraTransform(): void {
    const camera = this.camera.position;
    const shake = this.shake.offset;
    const scale = this.layout.actorScale;
    this.layers.world.position.set(
      this.layout.cameraAnchorX - camera.x * scale + shake.x,
      this.layout.cameraAnchorY - camera.y * scale + shake.y,
    );
  }

  private resizeWorldFloor(): void {
    const scale = this.layout.actorScale;
    const horizontalViewportReach =
      Math.max(this.layout.cameraAnchorX, this.layout.width - this.layout.cameraAnchorX) /
      scale;
    const verticalViewportReach =
      Math.max(this.layout.cameraAnchorY, this.layout.height - this.layout.cameraAnchorY) /
      scale;
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
