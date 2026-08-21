import { BitmapText, Container, Graphics } from "pixi.js";
import { hashSimulationSnapshot } from "../../sim/replay/battle-replay";
import type { SimulationSnapshot } from "../../sim/world/world";
import type { BattlePresentation } from "../snapshot-interpolation";
import {
  DEBUG_LAYER_ORDER,
  type DebugLayerName,
  type DebugRuntimeMetrics,
} from "./debug-layers";

function createScreenPanel(width: number, height: number): Graphics {
  return new Graphics()
    .roundRect(0, 0, width, height, 5)
    .fill({ color: 0x02090d, alpha: 0.9 })
    .stroke({ color: 0x65d7dc, width: 1, alpha: 0.48 });
}

function createDebugText(color: number): BitmapText {
  return new BitmapText({
    text: "",
    style: {
      fontFamily: "monospace",
      fontSize: 12,
      fill: color,
    },
  });
}

/**
 * Draws simulation truth, never renderer state: every shape comes straight
 * from the snapshot so a mismatch with real judgement is visible.
 */
export class DebugOverlay {
  private readonly collision = new Graphics();
  private readonly hitbox = new Graphics();
  private readonly velocity = new Graphics();
  private readonly combatPanel = createScreenPanel(310, 92);
  private readonly combatText = createDebugText(0xb9fbfb);
  private readonly performancePanel = createScreenPanel(276, 118);
  private readonly performanceText = createDebugText(0xffdc89);
  private readonly enabled = new Set<DebugLayerName>();
  private lastCombatText = "";
  private lastPerformanceText = "";

  constructor(worldLayer: Container, screenLayer: Container) {
    this.collision.label = "Debug collision";
    this.hitbox.label = "Debug hitbox";
    this.velocity.label = "Debug velocity";
    this.combatPanel.label = "Debug combat panel";
    this.combatText.label = "Debug combat state";
    this.performancePanel.label = "Debug performance panel";
    this.performanceText.label = "Debug performance state";
    this.combatPanel.position.set(12, 118);
    this.combatText.position.set(22, 127);
    this.performancePanel.position.set(12, 218);
    this.performanceText.position.set(22, 227);
    worldLayer.addChild(this.collision, this.hitbox, this.velocity);
    screenLayer.addChild(
      this.combatPanel,
      this.combatText,
      this.performancePanel,
      this.performanceText,
    );
    this.applyVisibility();
  }

  toggle(layer: DebugLayerName): boolean {
    if (this.enabled.has(layer)) {
      this.enabled.delete(layer);
    } else {
      this.enabled.add(layer);
    }

    this.applyVisibility();
    return this.enabled.has(layer);
  }

  isEnabled(layer: DebugLayerName): boolean {
    return this.enabled.has(layer);
  }

  enabledLayers(): readonly DebugLayerName[] {
    return DEBUG_LAYER_ORDER.filter((layer) => this.enabled.has(layer));
  }

  resize(width: number): void {
    const performanceX = Math.max(12, width - 288);
    this.performancePanel.x = performanceX;
    this.performanceText.x = performanceX + 10;
  }

  /**
   * World layers use the interpolated view while the combat panel hashes the
   * named authoritative tick state used by replay tooling.
   */
  present(
    presentation: BattlePresentation,
    metrics: DebugRuntimeMetrics,
  ): void {
    const snapshot = presentation.viewSnapshot;
    if (this.enabled.has("collision")) {
      this.drawCollision(snapshot);
    }

    if (this.enabled.has("hitbox")) {
      this.drawHitboxes(snapshot);
    }

    if (this.enabled.has("velocity")) {
      this.drawVelocity(snapshot);
    }

    if (this.enabled.has("combat")) {
      this.presentCombat(presentation.authoritativeSnapshot);
    }

    if (this.enabled.has("performance")) {
      this.presentPerformance(snapshot, metrics);
    }
  }

  private drawCollision(snapshot: SimulationSnapshot): void {
    this.collision.clear();

    for (const fighter of [snapshot.player, snapshot.enemy]) {
      const { position, radius, bodyHeight } = fighter.body;
      this.collision
        .circle(position.x, position.y, radius)
        .stroke({ color: 0x60ff9c, width: 2, alpha: 0.9 })
        .moveTo(position.x, position.y - position.elevation)
        .lineTo(position.x, position.y - position.elevation - bodyHeight)
        .stroke({ color: 0x60ff9c, width: 1, alpha: 0.45 });
    }

    this.collision
      .circle(snapshot.arena.center.x, snapshot.arena.center.y, snapshot.arena.radius)
      .stroke({ color: 0x60ff9c, width: 1, alpha: 0.28 });
  }

  private drawHitboxes(snapshot: SimulationSnapshot): void {
    this.hitbox.clear();

    for (const fighter of [snapshot.player, snapshot.enemy]) {
      const { position, radius, bodyHeight } = fighter.body;
      this.hitbox
        .ellipse(position.x, position.y - position.elevation - bodyHeight / 2, radius, bodyHeight / 2)
        .stroke({ color: 0x4db5ff, width: 2, alpha: 0.85 });
    }

    for (const box of snapshot.hitboxes) {
      const height = box.maximumElevation - box.minimumElevation;
      const centerY = box.y - (box.minimumElevation + box.maximumElevation) / 2;
      this.hitbox
        .circle(box.x, box.y, box.radius)
        .fill({ color: 0xff4d6d, alpha: 0.18 })
        .stroke({ color: 0xff4d6d, width: 2, alpha: 0.95 })
        .ellipse(box.x, centerY, box.radius, height / 2)
        .stroke({ color: 0xff9db0, width: 1, alpha: 0.7 });
    }
  }

  private drawVelocity(snapshot: SimulationSnapshot): void {
    this.velocity.clear();

    for (const fighter of [snapshot.player, snapshot.enemy]) {
      const { position, velocity } = fighter.body;
      this.velocity
        .moveTo(position.x, position.y)
        .lineTo(position.x + velocity.x * 0.12, position.y + velocity.y * 0.12)
        .stroke({ color: 0xffd166, width: 3, alpha: 0.9 })
        .moveTo(position.x, position.y - position.elevation)
        .lineTo(
          position.x,
          position.y - position.elevation - fighter.body.verticalVelocity * 0.1,
        )
        .stroke({ color: 0x8be9fd, width: 3, alpha: 0.9 });
    }
  }

  private presentCombat(snapshot: SimulationSnapshot): void {
    const playerAction = snapshot.player.attackId ?? snapshot.player.actionKind;
    const enemyAction = snapshot.enemy.attackId ?? snapshot.enemy.actionKind;
    const text = [
      `TICK ${snapshot.tick}  HASH ${hashSimulationSnapshot(snapshot)}`,
      `P ${snapshot.player.state}/${snapshot.player.locomotion}  ${playerAction} ${snapshot.player.actionFrame}`,
      `E ${snapshot.enemy.state}/${snapshot.enemy.locomotion}  ${enemyAction} ${snapshot.enemy.actionFrame}`,
      `HITSTOP ${snapshot.player.hitStopFrames}/${snapshot.enemy.hitStopFrames}  OUTCOME ${snapshot.battleOutcome}`,
    ].join("\n");

    if (text !== this.lastCombatText) {
      this.lastCombatText = text;
      this.combatText.text = text;
    }
  }

  private presentPerformance(
    snapshot: SimulationSnapshot,
    metrics: DebugRuntimeMetrics,
  ): void {
    const text = [
      `FPS ${metrics.framesPerSecond.toFixed(1)}  FRAME ${metrics.frameMilliseconds.toFixed(2)} ms`,
      `SIM ${metrics.simulationAverageMilliseconds.toFixed(3)} / ${metrics.simulationMaximumMilliseconds.toFixed(3)} ms`,
      `HIT ${metrics.collisionHitAverageMilliseconds.toFixed(3)} / ${metrics.collisionHitMaximumMilliseconds.toFixed(3)} ms`,
      `AI  ${metrics.aiAverageMilliseconds.toFixed(3)} / ${metrics.aiMaximumMilliseconds.toFixed(3)} ms`,
      `SPIKE ${metrics.frameSpikeCount}  HITBOX ${snapshot.hitboxes.length}  P ${metrics.projectileCount}`,
    ].join("\n");

    if (text !== this.lastPerformanceText) {
      this.lastPerformanceText = text;
      this.performanceText.text = text;
    }
  }

  private applyVisibility(): void {
    this.collision.visible = this.enabled.has("collision");
    this.hitbox.visible = this.enabled.has("hitbox");
    this.velocity.visible = this.enabled.has("velocity");
    this.combatPanel.visible = this.enabled.has("combat");
    this.combatText.visible = this.enabled.has("combat");
    this.performancePanel.visible = this.enabled.has("performance");
    this.performanceText.visible = this.enabled.has("performance");

    if (!this.collision.visible) {
      this.collision.clear();
    }
    if (!this.hitbox.visible) {
      this.hitbox.clear();
    }
    if (!this.velocity.visible) {
      this.velocity.clear();
    }
  }
}
