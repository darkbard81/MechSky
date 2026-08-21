const UINT32_MAX = 0xffff_ffff;

export class SeededPrng {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 1 || seed > UINT32_MAX) {
      throw new RangeError("PRNG seed must be an unsigned non-zero 32-bit integer.");
    }

    this.state = seed >>> 0;
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / (UINT32_MAX + 1);
  }

  nextSigned(): number {
    return this.nextFloat() * 2 - 1;
  }
}
