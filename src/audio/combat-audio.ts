import type { SimEvent } from "../sim/world/sim-event";

export type CombatSoundCue =
  | "melee"
  | "launcher"
  | "air"
  | "finisher"
  | "ground-slam";

export function resolveCombatSoundCue(event: SimEvent): CombatSoundCue | null {
  if (event.type === "ground-impact") {
    return "ground-slam";
  }
  if (event.type !== "hit-landed") {
    return null;
  }

  switch (event.attackId) {
    case "mech-ground-1":
    case "mech-ground-2":
      return "melee";
    case "mech-launcher":
      return "launcher";
    case "mech-air-1":
    case "mech-air-2":
      return "air";
    case "mech-finisher":
      return "finisher";
    default:
      return null;
  }
}

interface CueProfile {
  readonly frequency: number;
  readonly endFrequency: number;
  readonly durationSeconds: number;
  readonly volume: number;
  readonly wave: OscillatorType;
}

const CUE_PROFILES: Readonly<Record<CombatSoundCue, CueProfile>> = Object.freeze({
  melee: {
    frequency: 150,
    endFrequency: 85,
    durationSeconds: 0.09,
    volume: 0.09,
    wave: "square",
  },
  launcher: {
    frequency: 130,
    endFrequency: 310,
    durationSeconds: 0.15,
    volume: 0.11,
    wave: "sawtooth",
  },
  air: {
    frequency: 260,
    endFrequency: 120,
    durationSeconds: 0.11,
    volume: 0.08,
    wave: "triangle",
  },
  finisher: {
    frequency: 180,
    endFrequency: 52,
    durationSeconds: 0.24,
    volume: 0.14,
    wave: "sawtooth",
  },
  "ground-slam": {
    frequency: 72,
    endFrequency: 34,
    durationSeconds: 0.32,
    volume: 0.17,
    wave: "square",
  },
});

/** Minimal generated combat cues. No audio timing participates in simulation. */
export class CombatAudio {
  private context: AudioContext | undefined;

  constructor() {
    window.addEventListener("keydown", this.unlock, { passive: true });
    window.addEventListener("pointerdown", this.unlock, { passive: true });
  }

  consume(events: readonly SimEvent[]): void {
    for (const event of events) {
      const cue = resolveCombatSoundCue(event);
      if (cue !== null) {
        this.play(cue);
      }
    }
  }

  destroy(): void {
    window.removeEventListener("keydown", this.unlock);
    window.removeEventListener("pointerdown", this.unlock);
    const context = this.context;
    this.context = undefined;
    if (context !== undefined && context.state !== "closed") {
      void context.close();
    }
  }

  private readonly unlock = (): void => {
    const context = this.requireContext();
    if (context.state === "suspended") {
      void context.resume();
    }
  };

  private play(cue: CombatSoundCue): void {
    const context = this.requireContext();
    if (context.state === "suspended") {
      void context.resume();
    }

    const profile = CUE_PROFILES[cue];
    const now = context.currentTime;
    const end = now + profile.durationSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = profile.wave;
    oscillator.frequency.setValueAtTime(profile.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, end);
    gain.gain.setValueAtTime(profile.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.000_1, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(end);
  }

  private requireContext(): AudioContext {
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    return this.context;
  }
}
