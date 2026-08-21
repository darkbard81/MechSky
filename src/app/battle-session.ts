import { EnemyAiController, type EnemyAiState } from "../sim/ai/enemy-ai";
import type { CommandIntent } from "../sim/input/command-intent";
import type { BattleRecipe } from "../sim/world/battle-recipe";
import type { SimEvent } from "../sim/world/sim-event";
import { SimulationWorld, type SimulationFrame } from "../sim/world/world";

export class BattleSession {
  private simulation: SimulationWorld;
  private readonly enemyAi: EnemyAiController;

  constructor(
    private readonly recipe: BattleRecipe,
    private readonly seed = recipe.seed,
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
    const aiIntents = this.enemyAi.decide(this.simulation.getFrame().current);
    this.simulation.step([...playerIntents, ...aiIntents]);
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
