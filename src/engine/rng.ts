export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number): number {
  if (Number.isNaN(seed) || !Number.isFinite(seed)) {
    return Date.now() >>> 0;
  }
  return seed >>> 0;
}
