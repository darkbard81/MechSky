import { EnemyAiController, type EnemyAiState } from "../sim/ai/enemy-ai";
import type { CommandIntent } from "../sim/input/command-intent";
import type { BattleRecipe } from "../sim/world/battle-recipe";
import type { SimEvent } from "../sim/world/sim-event";
import {
  SimulationWorld,
  type SimulationFrame,
  type SimulationStepObserver,
} from "../sim/world/world";
import type { RuntimePerformanceMonitor } from "./runtime-performance";

export class BattleSession {
  private simulation: SimulationWorld;
  private readonly enemyAi: EnemyAiController;
  private collisionStartMilliseconds = 0;
  private readonly simulationObserver: SimulationStepObserver = {
    beforeCollisionHit: () => {
      if (this.performance !== null) {
        this.collisionStartMilliseconds = this.performance.now();
      }
    },
    afterCollisionHit: () => {
      if (this.performance !== null) {
        this.performance.recordCollisionHit(
          this.performance.now() - this.collisionStartMilliseconds,
        );
      }
    },
  };

  constructor(
    private readonly recipe: BattleRecipe,
    private readonly seed = recipe.seed,
    private readonly performance: RuntimePerformanceMonitor | null = null,
  ) {
    const seededRecipe = { ...recipe, seed };
    this.simulation = new SimulationWorld(seededRecipe);
    this.enemyAi = new EnemyAiController(
      recipe.enemy.id,
      recipe.player.id,
      recipe.enemyAi,
      seed,
    );
  }

  get frame(): SimulationFrame {
    return this.simulation.getFrame();
  }

  get enemyAiState(): EnemyAiState {
    return this.enemyAi.state;
  }

  get battleRecipe(): BattleRecipe {
    return this.recipe;
  }

  get battleSeed(): number {
    return this.seed;
  }

  step(playerIntents: readonly CommandIntent[]): void {
    const aiStartMilliseconds = this.performance?.now();
    const aiIntents = this.enemyAi.decide(this.simulation.getFrame().current);
    if (aiStartMilliseconds !== undefined) {
      this.performance?.recordAi(this.performance.now() - aiStartMilliseconds);
    }

    const simulationStartMilliseconds = this.performance?.now();
    this.simulation.step(
      [...playerIntents, ...aiIntents],
      this.performance === null ? undefined : this.simulationObserver,
    );
    if (simulationStartMilliseconds !== undefined) {
      this.performance?.recordSimulation(
        this.performance.now() - simulationStartMilliseconds,
      );
    }
  }

  drainEvents(): readonly SimEvent[] {
    return this.simulation.drainEvents();
  }

  reset(): void {
    this.simulation.drainEvents();
    this.simulation = new SimulationWorld({ ...this.recipe, seed: this.seed });
    this.enemyAi.reset(this.seed);
  }
}
