export const SIMULATION_HZ = 60;

export interface SimulationSnapshot {
  readonly tick: number;
  readonly elapsedSeconds: number;
}

export interface SimulationFrame {
  readonly previous: SimulationSnapshot;
  readonly current: SimulationSnapshot;
}

export class SimulationWorld {
  private previousSnapshot: SimulationSnapshot = { tick: 0, elapsedSeconds: 0 };
  private currentSnapshot: SimulationSnapshot = { tick: 0, elapsedSeconds: 0 };

  step(): void {
    this.previousSnapshot = this.currentSnapshot;

    const tick = this.currentSnapshot.tick + 1;
    this.currentSnapshot = {
      tick,
      elapsedSeconds: tick / SIMULATION_HZ,
    };
  }

  getFrame(): SimulationFrame {
    return {
      previous: this.previousSnapshot,
      current: this.currentSnapshot,
    };
  }
}
