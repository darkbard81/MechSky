import {
  HANGAR_TEST_BATTLE,
  PLAYER_FIGHTER_ID,
} from "../content/arenas/hangar-test";
import { CombatAudio } from "../audio/combat-audio";
import { PlayerInputController } from "../input/player-input";
import { debugLayerForCode } from "../render/debug/debug-overlay";
import { resolvePlatform } from "../platform/resolve-platform";
import type { Platform } from "../platform/platform";
import { PixiBattleRenderer } from "../render/pixi-renderer";
import { FixedStepClock } from "../sim/world/fixed-step-clock";
import { SIMULATION_HZ } from "../sim/world/world";
import {
  DevelopmentHud,
  type DevelopmentHudElements,
} from "../ui/hud/development-hud";
import { BattleHud, type BattleHudElements } from "../ui/hud/battle-hud";
import {
  BattleFlowOverlay,
  type BattleFlowOverlayElements,
} from "../ui/result/battle-flow-overlay";
import { GameFlow } from "./game-flow";
import { BattleSession } from "./battle-session";

export interface GameAppElements
  extends DevelopmentHudElements,
    BattleHudElements,
    BattleFlowOverlayElements {
  readonly surface: HTMLDivElement;
  readonly fullscreenButton: HTMLButtonElement;
}

export class GameApp {
  private readonly clock = new FixedStepClock({
    hz: SIMULATION_HZ,
    maxCatchUpSteps: 5,
  });
  private readonly renderer = new PixiBattleRenderer();
  private readonly audio = new CombatAudio();
  private readonly session = new BattleSession(HANGAR_TEST_BATTLE);
  private readonly input = new PlayerInputController(PLAYER_FIGHTER_ID);
  private readonly hud: DevelopmentHud;
  private readonly battleHud: BattleHud;
  private readonly flow = new GameFlow();
  private readonly flowOverlay: BattleFlowOverlay;
  private readonly platform: Platform;
  private animationFrameId: number | undefined;
  private previousRenderTimeMilliseconds: number | undefined;
  private running = false;

  constructor(private readonly elements: GameAppElements) {
    this.platform = resolvePlatform();
    this.hud = new DevelopmentHud(elements);
    this.battleHud = new BattleHud(elements);
    this.flowOverlay = new BattleFlowOverlay(elements);
    this.elements.fullscreenButton.addEventListener("click", this.handleFullscreen);
    window.addEventListener("keydown", this.handleDebugKey);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.hud.loading(0, "런타임 부팅");

    try {
      await this.renderer.initialize(
        this.elements.surface,
        this.session.frame,
        (progress, detail) => {
          this.hud.loading(progress, detail);
        },
      );
      this.running = true;
      this.clock.reset(performance.now());
      this.previousRenderTimeMilliseconds = undefined;
      this.hud.ready(this.platform.kind);
      const inputStatus = this.input.getStatus();
      this.battleHud.present(this.session.frame.current, inputStatus.source);
      this.flowOverlay.present(this.flow.presentation(inputStatus.source));
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
    window.removeEventListener("keydown", this.handleDebugKey);
    this.input.destroy();
    this.audio.destroy();
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

    let inputStatus = this.input.getStatus();
    const advance = this.clock.advance(nowMilliseconds, () => {
      const inputFrame = this.input.sampleFrame();
      inputStatus = this.input.getStatus();
      const phaseBeforeInput = this.flow.phase;
      const transition = this.flow.handleInput(inputFrame.flow);

      if (transition.retryRequested) {
        this.resetBattle();
        return;
      }

      if (phaseBeforeInput !== "active" || this.flow.phase !== "active") {
        if (transition.battleStarted) {
          this.input.resetBattleInput();
        }
        return;
      }

      this.session.step(inputFrame.intents);
      this.flow.observeOutcome(this.session.frame.current.battleOutcome);
    });
    const simulationFrame = this.session.frame;

    const events = this.session.drainEvents();
    this.renderer.consume(events);
    this.audio.consume(events);
    this.renderer.present(simulationFrame, advance.alpha, renderDeltaSeconds);
    this.renderer.render();
    this.battleHud.present(simulationFrame.current, inputStatus.source);
    this.flowOverlay.present(this.flow.presentation(inputStatus.source));
    this.hud.present({
      actionDuration: simulationFrame.current.player.actionDuration,
      actionFrame: simulationFrame.current.player.actionFrame,
      actionKind: simulationFrame.current.player.actionKind,
      alpha: advance.alpha,
      attackId: simulationFrame.current.player.attackId,
      attackPhase: simulationFrame.current.player.attackPhase,
      dashCooldownTicks: simulationFrame.current.player.dashCooldownTicks,
      fighterState: simulationFrame.current.player.state,
      locomotion: simulationFrame.current.player.locomotion,
      homing: simulationFrame.current.player.homingTargetId !== null,
      inputControl: inputStatus.control,
      inputSource: inputStatus.source,
      locked: simulationFrame.current.player.lockedTargetId !== null,
      platform: this.platform.kind,
      position: simulationFrame.current.player.body.position,
      tick: simulationFrame.current.tick,
      velocity: simulationFrame.current.player.body.velocity,
      verticalVelocity: simulationFrame.current.player.body.verticalVelocity,
    });

    this.elements.surface.dataset["playerState"] =
      simulationFrame.current.player.state;
    this.elements.surface.dataset["playerHealth"] =
      simulationFrame.current.player.health.toString();
    this.elements.surface.dataset["playerX"] =
      simulationFrame.current.player.body.position.x.toFixed(2);
    this.elements.surface.dataset["playerY"] =
      simulationFrame.current.player.body.position.y.toFixed(2);
    this.elements.surface.dataset["playerElevation"] =
      simulationFrame.current.player.body.position.elevation.toFixed(2);
    this.elements.surface.dataset["playerLocomotion"] =
      simulationFrame.current.player.locomotion;
    this.elements.surface.dataset["playerAttack"] =
      simulationFrame.current.player.attackId ?? "none";
    this.elements.surface.dataset["playerActionFrame"] =
      simulationFrame.current.player.actionFrame.toString();
    this.elements.surface.dataset["playerAttackPhase"] =
      simulationFrame.current.player.attackPhase ?? "none";
    this.elements.surface.dataset["enemyHealth"] =
      simulationFrame.current.enemy.health.toString();
    this.elements.surface.dataset["enemyX"] =
      simulationFrame.current.enemy.body.position.x.toFixed(2);
    this.elements.surface.dataset["enemyY"] =
      simulationFrame.current.enemy.body.position.y.toFixed(2);
    this.elements.surface.dataset["enemyElevation"] =
      simulationFrame.current.enemy.body.position.elevation.toFixed(2);
    this.elements.surface.dataset["enemyLocomotion"] =
      simulationFrame.current.enemy.locomotion;
    this.elements.surface.dataset["enemyState"] =
      simulationFrame.current.enemy.state;
    this.elements.surface.dataset["enemyAttack"] =
      simulationFrame.current.enemy.attackId ?? "none";
    this.elements.surface.dataset["comboHits"] =
      simulationFrame.current.player.comboHits.toString();
    this.elements.surface.dataset["battleOutcome"] =
      simulationFrame.current.battleOutcome;
    this.elements.surface.dataset["inputLocked"] =
      simulationFrame.current.inputLocked.toString();
    this.elements.surface.dataset["simTick"] =
      simulationFrame.current.tick.toString();
    this.elements.surface.dataset["flowPhase"] = this.flow.phase;
    this.elements.surface.dataset["enemyAi"] = this.session.enemyAiState;

    this.animationFrameId = requestAnimationFrame(this.frame);
  };

  private readonly handleDebugKey = (event: KeyboardEvent): void => {
    const layer = debugLayerForCode(event.code);

    if (layer === null) {
      return;
    }

    event.preventDefault();
    const enabled = this.renderer.toggleDebugLayer(layer);
    this.hud.showMessage(`DEBUG ${layer.toUpperCase()} ${enabled ? "ON" : "OFF"}`);
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

  private resetBattle(): void {
    this.session.reset();
    this.input.resetBattleInput();
    this.flow.restartBattle();
    this.battleHud.reset();
    this.renderer.reset(this.session.frame);
  }
}
