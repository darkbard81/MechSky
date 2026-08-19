import { HANGAR_TEST_BATTLE, PLAYER_FIGHTER_ID } from "../content/arenas/hangar-test";
import { PlayerInputController } from "../input/player-input";
import { resolvePlatform } from "../platform/resolve-platform";
import type { Platform } from "../platform/platform";
import { PixiBattleRenderer } from "../render/pixi-renderer";
import { FixedStepClock } from "../sim/world/fixed-step-clock";
import { SIMULATION_HZ, SimulationWorld } from "../sim/world/world";
import { DevelopmentHud } from "../ui/hud/development-hud";

export interface GameAppElements {
  readonly surface: HTMLDivElement;
  readonly bootOverlay: HTMLElement;
  readonly bootStatus: HTMLElement;
  readonly loadingBar: HTMLElement;
  readonly loadingDetail: HTMLElement;
  readonly loadingPercent: HTMLElement;
  readonly loadingProgress: HTMLElement;
  readonly simTick: HTMLElement;
  readonly simAlpha: HTMLElement;
  readonly playerPosition: HTMLElement;
  readonly playerVelocity: HTMLElement;
  readonly playerState: HTMLElement;
  readonly dashCooldown: HTMLElement;
  readonly targetLock: HTMLElement;
  readonly inputSource: HTMLElement;
  readonly platformKind: HTMLElement;
  readonly runtimeMessage: HTMLElement;
  readonly fullscreenButton: HTMLButtonElement;
}

export class GameApp {
  private readonly clock = new FixedStepClock({
    hz: SIMULATION_HZ,
    maxCatchUpSteps: 5,
  });
  private readonly renderer = new PixiBattleRenderer();
  private readonly simulation = new SimulationWorld(HANGAR_TEST_BATTLE);
  private readonly input = new PlayerInputController(PLAYER_FIGHTER_ID);
  private readonly hud: DevelopmentHud;
  private readonly platform: Platform;
  private animationFrameId: number | undefined;
  private previousRenderTimeMilliseconds: number | undefined;
  private running = false;

  constructor(private readonly elements: GameAppElements) {
    this.platform = resolvePlatform();
    this.hud = new DevelopmentHud(elements);
    this.elements.fullscreenButton.addEventListener("click", this.handleFullscreen);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.hud.loading(0, "런타임 부팅");

    try {
      await this.renderer.initialize(
        this.elements.surface,
        this.simulation.getFrame(),
        (progress, detail) => {
          this.hud.loading(progress, detail);
        },
      );
      this.running = true;
      this.clock.reset(performance.now());
      this.previousRenderTimeMilliseconds = undefined;
      this.hud.ready(this.platform.kind);
      this.elements.surface.dataset["ready"] = "true";
      this.animationFrameId = requestAnimationFrame(this.frame);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "알 수 없는 초기화 오류";
      this.destroy();
      this.elements.surface.dataset["ready"] = "error";
      this.hud.failed(message);
      throw error;
    }
  }

  destroy(): void {
    this.running = false;

    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    this.elements.fullscreenButton.removeEventListener("click", this.handleFullscreen);
    this.input.destroy();
    this.renderer.destroy();
  }

  private readonly frame = (nowMilliseconds: number): void => {
    if (!this.running) {
      return;
    }

    const previousRenderTime = this.previousRenderTimeMilliseconds;
    const renderDeltaSeconds =
      previousRenderTime === undefined
        ? 0
        : Math.max(0, nowMilliseconds - previousRenderTime) / 1_000;
    this.previousRenderTimeMilliseconds = nowMilliseconds;

    const advance = this.clock.advance(nowMilliseconds, () => {
      this.simulation.step(this.input.sampleIntents());
    });
    const simulationFrame = this.simulation.getFrame();
    const inputStatus = this.input.getStatus();

    this.renderer.present(simulationFrame, advance.alpha, renderDeltaSeconds);
    this.renderer.render();
    this.hud.present({
      alpha: advance.alpha,
      dashCooldownTicks: simulationFrame.current.player.dashCooldownTicks,
      fighterState: simulationFrame.current.player.state,
      inputControl: inputStatus.control,
      inputSource: inputStatus.source,
      locked: simulationFrame.current.player.lockedTargetId !== null,
      platform: this.platform.kind,
      position: simulationFrame.current.player.body.position,
      tick: simulationFrame.current.tick,
      velocity: simulationFrame.current.player.body.velocity,
    });

    this.elements.surface.dataset["playerState"] =
      simulationFrame.current.player.state;
    this.elements.surface.dataset["playerX"] =
      simulationFrame.current.player.body.position.x.toFixed(2);
    this.elements.surface.dataset["playerY"] =
      simulationFrame.current.player.body.position.y.toFixed(2);

    this.animationFrameId = requestAnimationFrame(this.frame);
  };

  private readonly handleFullscreen = (): void => {
    void this.platform
      .toggleFullscreen()
      .then((enabled) => {
        this.elements.fullscreenButton.textContent = enabled ? "창 모드" : "전체 화면";
      })
      .catch((error: unknown) => {
        this.hud.showMessage(
          error instanceof Error ? error.message : "전체 화면 전환에 실패했습니다.",
        );
      });
  };
}
