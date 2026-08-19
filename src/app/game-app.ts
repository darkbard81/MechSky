import { resolvePlatform } from "../platform/resolve-platform";
import type { Platform } from "../platform/platform";
import { PixiBattleRenderer } from "../render/pixi-renderer";
import { FixedStepClock } from "../sim/world/fixed-step-clock";
import { SIMULATION_HZ, SimulationWorld } from "../sim/world/world";
import { DevelopmentHud } from "../ui/hud/development-hud";

export interface GameAppElements {
  readonly surface: HTMLDivElement;
  readonly bootStatus: HTMLElement;
  readonly simTick: HTMLElement;
  readonly simAlpha: HTMLElement;
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
  private readonly simulation = new SimulationWorld();
  private readonly hud: DevelopmentHud;
  private readonly platform: Platform;
  private animationFrameId: number | undefined;
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

    await this.renderer.initialize(this.elements.surface);
    this.running = true;
    this.clock.reset(performance.now());
    this.hud.ready(this.platform.kind);
    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.running = false;

    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    this.elements.fullscreenButton.removeEventListener("click", this.handleFullscreen);
    this.renderer.destroy();
  }

  private readonly frame = (nowMilliseconds: number): void => {
    if (!this.running) {
      return;
    }

    const advance = this.clock.advance(nowMilliseconds, () => {
      this.simulation.step();
    });
    const simulationFrame = this.simulation.getFrame();

    this.renderer.present(simulationFrame, advance.alpha);
    this.renderer.render();
    this.hud.present({
      alpha: advance.alpha,
      platform: this.platform.kind,
      tick: simulationFrame.current.tick,
    });

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
