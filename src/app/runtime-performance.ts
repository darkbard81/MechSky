export const PERFORMANCE_BUDGETS = Object.freeze({
  simulationAverageMilliseconds: 3,
  collisionHitAverageMilliseconds: 1.5,
  aiAverageMilliseconds: 1,
  minimumFramesPerSecond: 60,
  frameSpikeMilliseconds: 34,
});

const MAXIMUM_OBSERVABLE_FRAME_MILLISECONDS = 250;

export interface RuntimeTimingSummary {
  readonly averageMilliseconds: number;
  readonly maximumMilliseconds: number;
  readonly samples: number;
}

export interface RuntimeFrameSummary extends RuntimeTimingSummary {
  readonly framesPerSecond: number;
  readonly spikeCount: number;
}

export interface RuntimePerformanceSnapshot {
  readonly simulation: RuntimeTimingSummary;
  readonly collisionHit: RuntimeTimingSummary;
  readonly ai: RuntimeTimingSummary;
  readonly frame: RuntimeFrameSummary;
  readonly budgets: typeof PERFORMANCE_BUDGETS;
}

interface TimingAccumulator {
  samples: number;
  totalMilliseconds: number;
  maximumMilliseconds: number;
}

function createAccumulator(): TimingAccumulator {
  return {
    samples: 0,
    totalMilliseconds: 0,
    maximumMilliseconds: 0,
  };
}

function record(accumulator: TimingAccumulator, milliseconds: number): void {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError("Runtime timing samples must be finite and non-negative.");
  }

  accumulator.samples += 1;
  accumulator.totalMilliseconds += milliseconds;
  accumulator.maximumMilliseconds = Math.max(
    accumulator.maximumMilliseconds,
    milliseconds,
  );
}

function summarize(accumulator: TimingAccumulator): RuntimeTimingSummary {
  return Object.freeze({
    averageMilliseconds:
      accumulator.samples === 0
        ? 0
        : accumulator.totalMilliseconds / accumulator.samples,
    maximumMilliseconds: accumulator.maximumMilliseconds,
    samples: accumulator.samples,
  });
}

export class RuntimePerformanceMonitor {
  private readonly simulation = createAccumulator();
  private readonly collisionHit = createAccumulator();
  private readonly ai = createAccumulator();
  private readonly frame = createAccumulator();
  private observedFrameSpikeCount = 0;

  constructor(
    private readonly readNowMilliseconds: () => number = () => performance.now(),
  ) {}

  now(): number {
    return this.readNowMilliseconds();
  }

  recordSimulation(milliseconds: number): void {
    record(this.simulation, milliseconds);
  }

  recordCollisionHit(milliseconds: number): void {
    record(this.collisionHit, milliseconds);
  }

  recordAi(milliseconds: number): void {
    record(this.ai, milliseconds);
  }

  recordFrame(milliseconds: number): void {
    if (
      milliseconds <= 0 ||
      milliseconds > MAXIMUM_OBSERVABLE_FRAME_MILLISECONDS
    ) {
      return;
    }

    record(this.frame, milliseconds);
    if (milliseconds > PERFORMANCE_BUDGETS.frameSpikeMilliseconds) {
      this.observedFrameSpikeCount += 1;
    }
  }

  reset(): void {
    for (const accumulator of [
      this.simulation,
      this.collisionHit,
      this.ai,
      this.frame,
    ]) {
      accumulator.samples = 0;
      accumulator.totalMilliseconds = 0;
      accumulator.maximumMilliseconds = 0;
    }
    this.observedFrameSpikeCount = 0;
  }

  snapshot(): RuntimePerformanceSnapshot {
    const frame = summarize(this.frame);
    return Object.freeze({
      simulation: summarize(this.simulation),
      collisionHit: summarize(this.collisionHit),
      ai: summarize(this.ai),
      frame: Object.freeze({
        ...frame,
        framesPerSecond:
          frame.averageMilliseconds === 0
            ? 0
            : 1_000 / frame.averageMilliseconds,
        spikeCount: this.observedFrameSpikeCount,
      }),
      budgets: PERFORMANCE_BUDGETS,
    });
  }

  get simulationAverageMilliseconds(): number {
    return this.average(this.simulation);
  }

  get simulationMaximumMilliseconds(): number {
    return this.simulation.maximumMilliseconds;
  }

  get collisionHitAverageMilliseconds(): number {
    return this.average(this.collisionHit);
  }

  get collisionHitMaximumMilliseconds(): number {
    return this.collisionHit.maximumMilliseconds;
  }

  get aiAverageMilliseconds(): number {
    return this.average(this.ai);
  }

  get aiMaximumMilliseconds(): number {
    return this.ai.maximumMilliseconds;
  }

  get frameSpikeCount(): number {
    return this.observedFrameSpikeCount;
  }

  private average(accumulator: TimingAccumulator): number {
    return accumulator.samples === 0
      ? 0
      : accumulator.totalMilliseconds / accumulator.samples;
  }
}
