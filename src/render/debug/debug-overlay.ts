import { Container, Graphics } from "pixi.js";
import type { SimulationSnapshot } from "../../sim/world/world";

export const DEBUG_TOGGLES = {
  F1: "collision",
  F2: "hitbox",
  F4: "velocity",
  F7: "combat",
} as const;

export type DebugLayerName = (typeof DEBUG_TOGGLES)[keyof typeof DEBUG_TOGGLES];

export function debugLayerForCode(code: string): DebugLayerName | null {
  return code in DEBUG_TOGGLES
    ? DEBUG_TOGGLES[code as keyof typeof DEBUG_TOGGLES]
    : null;
}

/**
 * Draws simulation truth, never renderer state: every shape comes straight
 * from the snapshot so a mismatch with real judgement is visible.
 */
export class DebugOverlay {
  private readonly collision = new Graphics();
  private readonly hitbox = new Graphics();
  private readonly velocity = new Graphics();
  private readonly enabled = new Set<DebugLayerName>();

  constructor(worldLayer: Container) {
    this.collision.label = "Debug collision";
    this.hitbox.label = "Debug hitbox";
    this.velocity.label = "Debug velocity";
    worldLayer.addChild(this.collision, this.hitbox, this.velocity);
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

  present(snapshot: SimulationSnapshot): void {
    if (this.enabled.has("collision")) {
      this.drawCollision(snapshot);
    }

    if (this.enabled.has("hitbox")) {
      this.drawHitboxes(snapshot);
    }

    if (this.enabled.has("velocity")) {
      this.drawVelocity(snapshot);
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
        .stroke({ color: 0xffd166, width: 3, alpha: 0.9 });
    }
  }

  private applyVisibility(): void {
    this.collision.visible = this.enabled.has("collision");
    this.hitbox.visible = this.enabled.has("hitbox");
    this.velocity.visible = this.enabled.has("velocity");

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
