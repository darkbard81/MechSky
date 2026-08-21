import { CombatAudio } from "../audio/combat-audio";
import { HANGAR_TEST_BATTLE } from "../content/arenas/hangar-test";
import {
  PlayerInputController,
  type InputStatus,
  type PlayerInputFrame,
} from "../input/player-input";
import type { Platform } from "../platform/platform";
import { resolvePlatform } from "../platform/resolve-platform";
import {
  debugLayerForCode,
  isDebugLayerName,
  type DebugLayerName,
} from "../render/debug/debug-layers";
import { PixiBattleRenderer } from "../render/pixi-renderer";
import {
  createBattleReplay,
  hashSimulationSnapshot,
  parseBattleReplay,
  type BattleReplay,
  type InputFrame,
} from "../sim/replay/battle-replay";
import { FixedStepClock } from "../sim/world/fixed-step-clock";
import { SIMULATION_HZ } from "../sim/world/world";
import type {
  GameDebugApi,
  GameDebugDump,
} from "../testing/game-debug-api";
import {
  replayForDebugName,
  type DevBattleScenario,
  type DevBattleScenarioName,
} from "../testing/scenarios/dev-battle-scenarios";
import { BattleHud, type BattleHudElements } from "../ui/hud/battle-hud";
import {
  DevelopmentHud,
  type DevelopmentHudElements,
} from "../ui/hud/development-hud";
import {
  BattleFlowOverlay,
  type BattleFlowOverlayElements,
} from "../ui/result/battle-flow-overlay";
import { BattleSession } from "./battle-session";
import { GameFlow } from "./game-flow";
import { RuntimePerformanceMonitor } from "./runtime-performance";

const MANUAL_STEP_SECONDS = 1 / SIMULATION_HZ;
const MAX_MANUAL_STEP_FRAMES = 10_000;
const GAME_DEBUG_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_GAME_DEBUG === "1";

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
  private readonly performance = new RuntimePerformanceMonitor();
  private readonly audio = new CombatAudio();
  private readonly input: PlayerInputController;
  private readonly hud: DevelopmentHud;
  private readonly battleHud: BattleHud;
  private readonly flow = new GameFlow();
  private readonly flowOverlay: BattleFlowOverlay;
  private readonly platform: Platform;
  private readonly debugApi: GameDebugApi;
  private readonly reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  private session: BattleSession;
  private activeReplay: BattleReplay | null;
  private replayFrame = 0;
  private manualReplay = false;
  private recordedInputFrames: InputFrame[] = [];
  private readonly candidateUi: boolean;
  private currentScenario: DevBattleScenarioName | "standard";
  private projectileCount: number;
  private animationFrameId: number | undefined;
  private previousRenderTimeMilliseconds: number | undefined;
  private fullscreenSyncGeneration = 0;
  private running = false;

  constructor(
    private readonly elements: GameAppElements,
    scenario: DevBattleScenario | null = null,
  ) {
    const recipe = scenario?.recipe ?? HANGAR_TEST_BATTLE;
    this.session = new BattleSession(
      recipe,
      scenario?.replay?.seed ?? recipe.seed,
      this.performance,
    );
    this.activeReplay = scenario?.replay ?? null;
    this.candidateUi = scenario === null;
    this.currentScenario = scenario?.name ?? "standard";
    this.projectileCount = scenario?.projectileCount ?? 0;
    this.input = new PlayerInputController(recipe.player.id);
    this.platform = resolvePlatform();
    this.hud = new DevelopmentHud(elements);
    this.battleHud = new BattleHud(elements);
    this.flowOverlay = new BattleFlowOverlay(elements);
    this.debugApi = Object.freeze({
      load: (value: unknown) => this.loadDebugReplay(value),
      step: (frames = 1) => this.stepDebugReplay(frames),
      dump: () => this.createDebugDump(),
      toggle: (layer: DebugLayerName) => this.toggleDebugLayer(layer),
    });
    this.elements.fullscreenButton.addEventListener("click", this.handleFullscreen);
    window.addEventListener("keydown", this.handleDebugKey);
    window.addEventListener("blur", this.handleFocusLoss);
    window.addEventListener("resize", this.handleFullscreenEnvironmentChange);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    document.addEventListener(
      "fullscreenchange",
      this.handleFullscreenEnvironmentChange,
    );
    this.reducedMotionQuery.addEventListener(
      "change",
      this.handleReducedMotionChange,
    );
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
      this.renderer.setReducedMotion(this.reducedMotionQuery.matches);
      this.renderer.setDevelopmentProjectileCount(this.projectileCount);
      if (this.currentScenario !== "standard") {
        this.flow.restartBattle();
      }

      this.running = true;
      this.clock.reset(performance.now());
      this.previousRenderTimeMilliseconds = undefined;
      this.hud.ready(this.platform.kind);
      this.syncFullscreenState();
      if (GAME_DEBUG_ENABLED) {
        window.__GAME_DEBUG__ = this.debugApi;
      }
      const inputStatus = this.input.getStatus();
      this.presentDom(inputStatus, 0);
      this.elements.surface.dataset["ready"] = "true";
      this.animationFrameId = requestAnimationFrame(this.frame);
    } catch (error: unknown) {
      this.reportBootFailure(error);
      throw error;
    }
  }

  /**
   * Boot failures raised before `start()` can run still have to reach the same
   * overlay, otherwise the page just freezes on the initial boot state.
   */
  reportBootFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : "알 수 없는 초기화 오류";
    this.destroy();
    this.elements.surface.dataset["ready"] = "error";
    this.hud.failed(message);
  }

  destroy(): void {
    this.running = false;

    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }

    if (window.__GAME_DEBUG__ === this.debugApi) {
      delete window.__GAME_DEBUG__;
    }
    this.elements.fullscreenButton.removeEventListener("click", this.handleFullscreen);
    window.removeEventListener("keydown", this.handleDebugKey);
    window.removeEventListener("blur", this.handleFocusLoss);
    window.removeEventListener("resize", this.handleFullscreenEnvironmentChange);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    document.removeEventListener(
      "fullscreenchange",
      this.handleFullscreenEnvironmentChange,
    );
    this.reducedMotionQuery.removeEventListener(
      "change",
      this.handleReducedMotionChange,
    );
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
    this.performance.recordFrame(renderDeltaSeconds * 1_000);

    let inputStatus = this.input.getStatus();
    const advance = this.manualReplay
      ? { alpha: 1, steps: 0 }
      : this.clock.advance(nowMilliseconds, () => {
          const inputFrame = this.input.sampleFrame();
          inputStatus = this.input.getStatus();
          this.stepApplication(inputFrame);
        });
    const events = this.session.drainEvents();
    this.renderer.consume(events);
    this.audio.consume(events);
    this.renderer.present(
      this.session.frame,
      advance.alpha,
      this.manualReplay ? 0 : renderDeltaSeconds,
      this.performance,
    );
    this.renderer.render();
    this.presentDom(inputStatus, advance.alpha);

    this.animationFrameId = requestAnimationFrame(this.frame);
  };

  private stepApplication(inputFrame: PlayerInputFrame): void {
    const phaseBeforeInput = this.flow.phase;
    const transition = this.flow.handleInput(inputFrame.flow);

    if (transition.retryRequested) {
      this.resetBattle();
      return;
    }

    if (phaseBeforeInput !== "active" || this.flow.phase !== "active") {
      if (transition.battleStarted) {
        this.input.resetBattleInput();
        this.performance.reset();
      }
      return;
    }

    if (this.activeReplay !== null) {
      const replayInput = this.activeReplay.inputFrames[this.replayFrame];
      if (replayInput === undefined) {
        return;
      }
      this.session.step(replayInput.intents);
      this.replayFrame += 1;
    } else {
      this.session.step(inputFrame.intents);
      this.recordedInputFrames.push(
        Object.freeze({ intents: Object.freeze([...inputFrame.intents]) }),
      );
    }

    this.flow.observeOutcome(this.session.frame.current.battleOutcome);
  }

  private presentDom(inputStatus: InputStatus, alpha: number): void {
    const simulationFrame = this.session.frame;
    this.battleHud.present(simulationFrame.current, inputStatus.source);
    this.flowOverlay.present(this.flow.presentation(inputStatus.source));
    this.hud.present({
      actionDuration: simulationFrame.current.player.actionDuration,
      actionFrame: simulationFrame.current.player.actionFrame,
      actionKind: simulationFrame.current.player.actionKind,
      alpha,
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

    const { current } = simulationFrame;
    this.elements.surface.dataset["playerState"] = current.player.state;
    this.elements.surface.dataset["playerHealth"] = current.player.health.toString();
    this.elements.surface.dataset["playerX"] = current.player.body.position.x.toFixed(2);
    this.elements.surface.dataset["playerY"] = current.player.body.position.y.toFixed(2);
    this.elements.surface.dataset["playerElevation"] =
      current.player.body.position.elevation.toFixed(2);
    this.elements.surface.dataset["playerLocomotion"] = current.player.locomotion;
    this.elements.surface.dataset["playerAttack"] = current.player.attackId ?? "none";
    this.elements.surface.dataset["playerActionFrame"] =
      current.player.actionFrame.toString();
    this.elements.surface.dataset["playerAttackPhase"] =
      current.player.attackPhase ?? "none";
    this.elements.surface.dataset["enemyHealth"] = current.enemy.health.toString();
    this.elements.surface.dataset["enemyX"] = current.enemy.body.position.x.toFixed(2);
    this.elements.surface.dataset["enemyY"] = current.enemy.body.position.y.toFixed(2);
    this.elements.surface.dataset["enemyElevation"] =
      current.enemy.body.position.elevation.toFixed(2);
    this.elements.surface.dataset["enemyLocomotion"] = current.enemy.locomotion;
    this.elements.surface.dataset["enemyState"] = current.enemy.state;
    this.elements.surface.dataset["enemyAttack"] = current.enemy.attackId ?? "none";
    this.elements.surface.dataset["comboHits"] = current.player.comboHits.toString();
    this.elements.surface.dataset["battleOutcome"] = current.battleOutcome;
    this.elements.surface.dataset["inputLocked"] = current.inputLocked.toString();
    this.elements.surface.dataset["simTick"] = current.tick.toString();
    this.elements.surface.dataset["flowPhase"] = this.flow.phase;
    this.elements.surface.dataset["enemyAi"] = this.session.enemyAiState;
    this.elements.surface.dataset["scenario"] = this.currentScenario;
    this.elements.surface.dataset["candidateUi"] = this.candidateUi.toString();
    this.elements.surface.dataset["replayMode"] = this.debugMode();
    this.elements.surface.dataset["replayFrame"] = this.replayFrame.toString();
    this.elements.surface.dataset["replayLength"] =
      (this.activeReplay?.inputFrames.length ?? this.recordedInputFrames.length).toString();
    this.elements.surface.dataset["projectileCount"] = this.projectileCount.toString();
    this.elements.surface.dataset["debugLayers"] =
      this.renderer.enabledDebugLayers().join(",");
    this.elements.surface.dataset["pauseReason"] = this.flow.pauseReason ?? "none";
    this.elements.surface.dataset["reducedMotion"] =
      this.reducedMotionQuery.matches.toString();
  }

  private readonly handleDebugKey = (event: KeyboardEvent): void => {
    const layer = debugLayerForCode(event.code);

    if (layer === null) {
      return;
    }

    event.preventDefault();
    const enabled = this.toggleDebugLayer(layer);
    this.hud.showMessage(`DEBUG ${layer.toUpperCase()} ${enabled ? "ON" : "OFF"}`);
  };

  private toggleDebugLayer(layer: unknown): boolean {
    if (!isDebugLayerName(layer)) {
      throw new RangeError(
        "Debug layer must be collision, hitbox, velocity, combat, or performance.",
      );
    }

    const enabled = this.renderer.toggleDebugLayer(layer);
    this.elements.surface.dataset["debugLayers"] =
      this.renderer.enabledDebugLayers().join(",");
    return enabled;
  }

  private readonly handleFullscreen = (): void => {
    void this.platform
      .toggleFullscreen()
      .then((enabled) => {
        this.applyFullscreenState(enabled);
      })
      .catch((error: unknown) => {
        this.hud.showMessage(
          error instanceof Error ? error.message : "전체 화면 전환에 실패했습니다.",
        );
      });
  };

  private readonly handleFullscreenEnvironmentChange = (): void => {
    this.syncFullscreenState();
  };

  private readonly handleFocusLoss = (): void => {
    if (!this.running || !this.flow.pauseForFocusLoss()) {
      return;
    }

    this.input.resetBattleInput();
    this.clock.reset(performance.now());
    this.previousRenderTimeMilliseconds = undefined;
    this.presentDom(this.input.getStatus(), 0);
    this.hud.showMessage("창 포커스를 잃어 전투가 자동으로 일시 정지되었습니다.");
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.handleFocusLoss();
    }
  };

  private readonly handleReducedMotionChange = (
    event: MediaQueryListEvent,
  ): void => {
    this.renderer.setReducedMotion(event.matches);
    this.elements.surface.dataset["reducedMotion"] = event.matches.toString();
  };

  private syncFullscreenState(): void {
    const generation = this.fullscreenSyncGeneration + 1;
    this.fullscreenSyncGeneration = generation;
    void this.platform
      .isFullscreen()
      .then((enabled) => {
        if (generation === this.fullscreenSyncGeneration) {
          this.applyFullscreenState(enabled);
        }
      })
      .catch(() => undefined);
  }

  private applyFullscreenState(enabled: boolean): void {
    this.elements.fullscreenButton.textContent = enabled ? "창 모드" : "전체 화면";
    this.elements.fullscreenButton.setAttribute("aria-pressed", enabled.toString());
    this.elements.surface.dataset["fullscreen"] = enabled.toString();
  }

  private resetBattle(): void {
    this.session.reset();
    this.replayFrame = 0;
    this.recordedInputFrames = [];
    this.input.resetBattleInput();
    this.flow.restartBattle();
    this.battleHud.reset();
    this.performance.reset();
    this.renderer.reset(this.session.frame);
  }

  private loadDebugReplay(value: unknown): GameDebugDump {
    const builtIn = value === "air-combo";
    const replay = builtIn
      ? replayForDebugName("air-combo")
      : parseBattleReplay(value);
    this.performance.reset();
    this.session = new BattleSession(replay.recipe, replay.seed, this.performance);
    this.activeReplay = replay;
    this.replayFrame = 0;
    this.manualReplay = true;
    this.recordedInputFrames = [];
    this.currentScenario = builtIn ? "air-combo" : "standard";
    this.projectileCount = 0;
    this.input.resetBattleInput();
    this.flow.restartBattle();
    this.battleHud.reset();
    this.renderer.loadBattle(this.session.frame, this.projectileCount);
    this.clock.reset(performance.now());
    this.previousRenderTimeMilliseconds = undefined;
    this.presentDom(this.input.getStatus(), 1);
    return this.createDebugDump();
  }

  private stepDebugReplay(frames: number): GameDebugDump {
    if (!this.manualReplay || this.activeReplay === null) {
      throw new Error("Debug step requires a replay loaded through __GAME_DEBUG__.load().");
    }
    if (
      !Number.isInteger(frames) ||
      frames < 1 ||
      frames > MAX_MANUAL_STEP_FRAMES
    ) {
      throw new RangeError(
        `Debug step frames must be an integer from 1 to ${MAX_MANUAL_STEP_FRAMES}.`,
      );
    }

    for (let index = 0; index < frames; index += 1) {
      const inputFrame = this.activeReplay.inputFrames[this.replayFrame];
      if (inputFrame === undefined) {
        break;
      }

      this.session.step(inputFrame.intents);
      this.replayFrame += 1;
      this.renderer.consume(this.session.drainEvents());
      this.renderer.present(
        this.session.frame,
        1,
        MANUAL_STEP_SECONDS,
        this.performance,
      );
      this.flow.observeOutcome(this.session.frame.current.battleOutcome);
    }

    this.renderer.render();
    this.presentDom(this.input.getStatus(), 1);
    return this.createDebugDump();
  }

  private createDebugDump(): GameDebugDump {
    const replay =
      this.activeReplay ??
      createBattleReplay(
        this.session.battleRecipe,
        this.recordedInputFrames,
        this.session.battleSeed,
      );
    const snapshot = this.session.frame.current;

    return Object.freeze({
      scenario: this.currentScenario,
      mode: this.debugMode(),
      replayFrame: this.replayFrame,
      replayLength: replay.inputFrames.length,
      stateHash: hashSimulationSnapshot(snapshot),
      snapshot,
      replay,
      enabledDebugLayers: Object.freeze([...this.renderer.enabledDebugLayers()]),
      projectileCount: this.renderer.developmentProjectileCount,
      performance: this.performance.snapshot(),
      pauseReason: this.flow.pauseReason,
      reducedMotion: this.reducedMotionQuery.matches,
    });
  }

  private debugMode(): GameDebugDump["mode"] {
    if (this.activeReplay === null) {
      return "live";
    }
    return this.manualReplay ? "replay-manual" : "replay-auto";
  }
}
