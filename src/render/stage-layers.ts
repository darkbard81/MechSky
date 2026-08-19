import { Container } from "pixi.js";

export interface StageLayers {
  readonly background: Container;
  readonly world: Container;
  readonly arenaGround: Container;
  readonly groundDecals: Container;
  readonly shadows: Container;
  readonly actors: Container;
  readonly projectiles: Container;
  readonly effects: Container;
  readonly foreground: Container;
  readonly debug: Container;
  readonly screenDebug: Container;
}

function createLayer(label: string): Container {
  return new Container({ label });
}

export function createStageLayers(stage: Container): StageLayers {
  const layers: StageLayers = {
    background: createLayer("Background"),
    world: createLayer("World"),
    arenaGround: createLayer("ArenaGround"),
    groundDecals: createLayer("GroundDecals"),
    shadows: createLayer("Shadows"),
    actors: createLayer("Actors"),
    projectiles: createLayer("Projectiles"),
    effects: createLayer("Effects"),
    foreground: createLayer("Foreground"),
    debug: createLayer("WorldDebug"),
    screenDebug: createLayer("ScreenDebug"),
  };

  layers.actors.sortableChildren = true;
  layers.world.addChild(
    layers.arenaGround,
    layers.groundDecals,
    layers.shadows,
    layers.actors,
    layers.projectiles,
    layers.effects,
    layers.foreground,
    layers.debug,
  );
  stage.addChild(layers.background, layers.world, layers.screenDebug);

  return layers;
}
