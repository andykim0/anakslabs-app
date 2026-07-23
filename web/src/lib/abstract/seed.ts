/** FNV-1a over JavaScript UTF-16 code units, fixed to unsigned 32-bit arithmetic. */
export function fnv1a32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One deterministic xorshift32 step. Zero is remapped so a sequence cannot become permanently zero. */
export function xorshift32(value: number): number {
  let next = value >>> 0;
  if (next === 0) next = 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

export function stableIndex(seed: string, size: number): number {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('stableIndex size must be a positive integer');
  }
  return fnv1a32(seed) % size;
}

export function stableSeedHex(seed: string): string {
  return fnv1a32(seed).toString(16).padStart(8, '0');
}

export class StableSeedSequence {
  private state: number;

  constructor(seed: string) {
    this.state = fnv1a32(seed);
  }

  nextUint32(): number {
    this.state = xorshift32(this.state);
    return this.state;
  }

  index(size: number): number {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error('StableSeedSequence size must be a positive integer');
    }
    return this.nextUint32() % size;
  }

  pick<const Value>(values: readonly Value[]): Value {
    if (values.length === 0) throw new Error('StableSeedSequence cannot pick from an empty list');
    return values[this.index(values.length)]!;
  }
}
