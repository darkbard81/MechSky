import "./styles.css";
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
  bootStatus: requireElement<HTMLSpanElement>("boot-status"),
  simTick: requireElement<HTMLElement>("sim-tick"),
  simAlpha: requireElement<HTMLElement>("sim-alpha"),
  platformKind: requireElement<HTMLElement>("platform-kind"),
  runtimeMessage: requireElement<HTMLParagraphElement>("runtime-message"),
  fullscreenButton: requireElement<HTMLButtonElement>("fullscreen-button"),
});

void game.start().catch((error: unknown) => {
  console.error(error);
  requireElement<HTMLElement>("boot-status").textContent = "초기화 실패";
  requireElement<HTMLElement>("runtime-message").textContent =
    error instanceof Error ? error.message : "알 수 없는 초기화 오류";
});

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    game.destroy();
  });
}
