import type { FlowInput, InputSource } from "../input/player-input";
import type { BattleOutcome } from "../sim/world/world";

export type GameFlowPhase = "intro" | "active" | "paused" | "victory" | "defeat";
export type GamePauseReason = "manual" | "focus-loss";

export interface GameFlowTransition {
  readonly battleStarted: boolean;
  readonly retryRequested: boolean;
}

const NO_TRANSITION: GameFlowTransition = Object.freeze({
  battleStarted: false,
  retryRequested: false,
});

export interface GameFlowPresentation {
  readonly phase: GameFlowPhase;
  readonly kicker: string;
  readonly title: string;
  readonly message: string;
  readonly prompt: string;
}

export class GameFlow {
  private currentPhase: GameFlowPhase = "intro";
  private currentPauseReason: GamePauseReason | null = null;

  get phase(): GameFlowPhase {
    return this.currentPhase;
  }

  get pauseReason(): GamePauseReason | null {
    return this.currentPauseReason;
  }

  handleInput(input: FlowInput): GameFlowTransition {
    if (this.currentPhase === "intro" && input.confirm) {
      this.currentPhase = "active";
      return { battleStarted: true, retryRequested: false };
    }

    if (this.currentPhase === "active" && input.pause) {
      this.currentPhase = "paused";
      this.currentPauseReason = "manual";
      return NO_TRANSITION;
    }

    if (this.currentPhase === "paused" && input.pause) {
      this.currentPhase = "active";
      this.currentPauseReason = null;
      return NO_TRANSITION;
    }

    if (
      (this.currentPhase === "victory" || this.currentPhase === "defeat") &&
      input.confirm
    ) {
      return { battleStarted: false, retryRequested: true };
    }

    return NO_TRANSITION;
  }

  observeOutcome(outcome: BattleOutcome): void {
    if (this.currentPhase !== "active" || outcome === "ongoing") {
      return;
    }

    this.currentPhase = outcome;
  }

  pauseForFocusLoss(): boolean {
    if (this.currentPhase !== "active") {
      return false;
    }

    this.currentPhase = "paused";
    this.currentPauseReason = "focus-loss";
    return true;
  }

  restartBattle(): void {
    this.currentPhase = "active";
    this.currentPauseReason = null;
  }

  presentation(source: InputSource): GameFlowPresentation {
    const confirm = source === "gamepad" ? "A 버튼으로" : "Enter / Z로";
    const pause = source === "gamepad" ? "Menu 버튼으로" : "Esc로";

    switch (this.currentPhase) {
      case "intro":
        return {
          phase: this.currentPhase,
          kicker: "M7 // RELEASE CANDIDATE",
          title: "교전 준비",
          message: "적 기체가 접근과 반격을 시작합니다. 콤보를 연결해 먼저 격파하세요.",
          prompt: `${confirm} 전투 시작`,
        };
      case "paused":
        return {
          phase: this.currentPhase,
          kicker:
            this.currentPauseReason === "focus-loss"
              ? "FOCUS LOST // AUTO PAUSE"
              : "BATTLE PAUSED",
          title: "일시 정지",
          message:
            this.currentPauseReason === "focus-loss"
              ? "창 포커스를 잃어 simulation과 입력을 안전하게 멈췄습니다."
              : "simulation과 전투 입력이 멈췄습니다.",
          prompt: `${pause} 계속`,
        };
      case "victory":
        return {
          phase: this.currentPhase,
          kicker: "MISSION COMPLETE",
          title: "승리",
          message: "적 기체의 전투 기능을 정지시켰습니다.",
          prompt: `${confirm} 즉시 재시작`,
        };
      case "defeat":
        return {
          phase: this.currentPhase,
          kicker: "MISSION FAILED",
          title: "패배",
          message: "플레이어 기체의 전투 기능이 정지했습니다.",
          prompt: `${confirm} 즉시 재시작`,
        };
      case "active":
        return {
          phase: this.currentPhase,
          kicker: "",
          title: "",
          message: "",
          prompt: "",
        };
    }
  }
}
