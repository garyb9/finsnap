/** Deterministic PRNG (mulberry32) so synthetic-series tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, driven by a seeded uniform generator. */
function gaussian(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Cumulative sum of Gaussian steps — a textbook non-stationary random walk. */
export function randomWalk(n: number, seed: number, stepStd = 1): number[] {
  const rand = seededRandom(seed);
  const out = [0];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + gaussian(rand) * stepStd);
  return out;
}

/**
 * Cumulative sum of AR(1) increments with a positive coefficient — momentum
 * in the *returns*, not just a rising level. A plain random walk plus a
 * deterministic drift still has iid increments and scores Hurst ~= 0.5;
 * genuine persistence (H > 0.5) needs positive autocorrelation between
 * successive steps, which is what `phi` supplies here.
 */
export function persistentWalk(n: number, seed: number, phi: number, stepStd = 1): number[] {
  const rand = seededRandom(seed);
  const increments = [gaussian(rand) * stepStd];
  for (let i = 1; i < n; i++) {
    increments.push(phi * increments[i - 1] + gaussian(rand) * stepStd);
  }
  const out = [0];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + increments[i]);
  return out;
}

/**
 * Euler-Maruyama simulation of an OU process with known theta/mu/sigma, so
 * a fit can be checked against the parameters that generated the data
 * rather than against an arbitrary fixture.
 */
export function simulateOu(
  n: number,
  seed: number,
  theta: number,
  mu: number,
  sigma: number,
  dt = 1
): number[] {
  const rand = seededRandom(seed);
  const out = [mu];
  for (let i = 1; i < n; i++) {
    const drift = theta * (mu - out[i - 1]) * dt;
    const diffusion = sigma * Math.sqrt(dt) * gaussian(rand);
    out.push(out[i - 1] + drift + diffusion);
  }
  return out;
}
