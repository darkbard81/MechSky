import { GameApp } from "./app/game-app";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);

  if (element === null) {
    throw new Error(`Required element #${id} was not found.`);
  }

  return element;
}

const game = new GameApp({
  surface: requireElement<HTMLDivElement>("game-surface"),
  bootOverlay: requireElement<HTMLElement>("boot-overlay"),
  bootStatus: requireElement<HTMLSpanElement>("boot-status"),
  loadingBar: requireElement<HTMLElement>("loading-bar"),
  loadingDetail: requireElement<HTMLElement>("loading-detail"),
  loadingPercent: requireElement<HTMLElement>("loading-percent"),
  loadingProgress: requireElement<HTMLElement>("loading-progress"),
  simTick: requireElement<HTMLElement>("sim-tick"),
  simAlpha: requireElement<HTMLElement>("sim-alpha"),
  platformKind: requireElement<HTMLElement>("platform-kind"),
  runtimeMessage: requireElement<HTMLParagraphElement>("runtime-message"),
  fullscreenButton: requireElement<HTMLButtonElement>("fullscreen-button"),
});

void game.start().catch((error: unknown) => {
  console.error(error);
});

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    game.destroy();
  });
}
