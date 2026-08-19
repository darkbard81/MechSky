import { Container } from "pixi.js";

export interface StageLayers {
  readonly background: Container;
  readonly arenaGround: Container;
  readonly groundDecals: Container;
  readonly shadows: Container;
  readonly actors: Container;
  readonly projectiles: Container;
  readonly effects: Container;
  readonly foreground: Container;
  readonly debug: Container;
}

function createLayer(label: string): Container {
  const layer = new Container();
  layer.label = label;
  return layer;
}

export function createStageLayers(stage: Container): StageLayers {
  const layers: StageLayers = {
    background: createLayer("Background"),
    arenaGround: createLayer("ArenaGround"),
    groundDecals: createLayer("GroundDecals"),
    shadows: createLayer("Shadows"),
    actors: createLayer("Actors"),
    projectiles: createLayer("Projectiles"),
    effects: createLayer("Effects"),
    foreground: createLayer("Foreground"),
    debug: createLayer("Debug"),
  };

  layers.actors.sortableChildren = true;
  stage.addChild(
    layers.background,
    layers.arenaGround,
    layers.groundDecals,
    layers.shadows,
    layers.actors,
    layers.projectiles,
    layers.effects,
    layers.foreground,
    layers.debug,
  );

  return layers;
}
