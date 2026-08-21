import { GameApp } from "./app/game-app";
import { resolveDevBattleScenario } from "./testing/scenarios/dev-battle-scenarios";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);

  if (element === null) {
    throw new Error(`Required element #${id} was not found.`);
  }

  return element;
}

const game = new GameApp(
  {
    surface: requireElement<HTMLDivElement>("game-surface"),
    bootOverlay: requireElement<HTMLElement>("boot-overlay"),
    bootStatus: requireElement<HTMLSpanElement>("boot-status"),
    loadingBar: requireElement<HTMLElement>("loading-bar"),
    loadingDetail: requireElement<HTMLElement>("loading-detail"),
    loadingPercent: requireElement<HTMLElement>("loading-percent"),
    loadingProgress: requireElement<HTMLElement>("loading-progress"),
    simTick: requireElement<HTMLElement>("sim-tick"),
    simAlpha: requireElement<HTMLElement>("sim-alpha"),
    playerPosition: requireElement<HTMLElement>("player-position"),
    playerVelocity: requireElement<HTMLElement>("player-velocity"),
    playerState: requireElement<HTMLElement>("player-state"),
    dashCooldown: requireElement<HTMLElement>("dash-cooldown"),
    targetLock: requireElement<HTMLElement>("target-lock"),
    inputSource: requireElement<HTMLElement>("input-source"),
    combatAction: requireElement<HTMLElement>("combat-action"),
    playerHealth: requireElement<HTMLElement>("player-health"),
    playerHealthBar: requireElement<HTMLElement>("player-health-bar"),
    comboCounter: requireElement<HTMLElement>("combo-counter"),
    enemyHealth: requireElement<HTMLElement>("enemy-health"),
    enemyHealthBar: requireElement<HTMLElement>("enemy-health-bar"),
    boostStatus: requireElement<HTMLElement>("boost-status"),
    boostBar: requireElement<HTMLElement>("boost-bar"),
    lockStatus: requireElement<HTMLElement>("lock-status"),
    controlMove: requireElement<HTMLElement>("control-move"),
    controlAttack: requireElement<HTMLElement>("control-attack"),
    controlSpecial: requireElement<HTMLElement>("control-special"),
    controlDash: requireElement<HTMLElement>("control-dash"),
    controlLock: requireElement<HTMLElement>("control-lock"),
    controlPause: requireElement<HTMLElement>("control-pause"),
    overlay: requireElement<HTMLElement>("flow-overlay"),
    kicker: requireElement<HTMLElement>("flow-kicker"),
    title: requireElement<HTMLElement>("flow-title"),
    message: requireElement<HTMLElement>("flow-message"),
    prompt: requireElement<HTMLElement>("flow-prompt"),
    platformKind: requireElement<HTMLElement>("platform-kind"),
    runtimeMessage: requireElement<HTMLParagraphElement>("runtime-message"),
    fullscreenButton: requireElement<HTMLButtonElement>("fullscreen-button"),
  },
  resolveDevBattleScenario(window.location),
);

void game.start().catch((error: unknown) => {
  console.error(error);
});

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    game.destroy();
  });
}
