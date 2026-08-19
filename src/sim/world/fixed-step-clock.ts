export interface FixedStepClockOptions {
  hz: number;
  maxCatchUpSteps: number;
}

export interface FixedStepAdvance {
  alpha: number;
  steps: number;
}

export class FixedStepClock {
  readonly stepMilliseconds: number;

  private accumulatorMilliseconds = 0;
  private previousTimeMilliseconds: number | undefined;

  constructor(private readonly options: FixedStepClockOptions) {
    if (options.hz <= 0) {
      throw new RangeError("Fixed-step frequency must be greater than zero.");
    }

    if (!Number.isInteger(options.maxCatchUpSteps) || options.maxCatchUpSteps < 1) {
      throw new RangeError("maxCatchUpSteps must be a positive integer.");
    }

    this.stepMilliseconds = 1000 / options.hz;
  }

  reset(nowMilliseconds: number): void {
    this.previousTimeMilliseconds = nowMilliseconds;
    this.accumulatorMilliseconds = 0;
  }

  advance(nowMilliseconds: number, step: () => void): FixedStepAdvance {
    const previousTime = this.previousTimeMilliseconds;

    if (previousTime === undefined) {
      this.reset(nowMilliseconds);
      return { alpha: 0, steps: 0 };
    }

    const elapsed = Math.max(0, nowMilliseconds - previousTime);
    const maximumElapsed = this.stepMilliseconds * this.options.maxCatchUpSteps;
    this.accumulatorMilliseconds += Math.min(elapsed, maximumElapsed);
    this.previousTimeMilliseconds = nowMilliseconds;

    const availableSteps = Math.floor(
      this.accumulatorMilliseconds / this.stepMilliseconds + 1e-9,
    );
    const steps = Math.min(availableSteps, this.options.maxCatchUpSteps);

    for (let index = 0; index < steps; index += 1) {
      step();
    }

    this.accumulatorMilliseconds = Math.max(
      0,
      this.accumulatorMilliseconds - steps * this.stepMilliseconds,
    );

    return {
      alpha: this.accumulatorMilliseconds / this.stepMilliseconds,
      steps,
    };
  }
}
