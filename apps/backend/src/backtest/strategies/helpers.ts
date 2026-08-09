import type { Signal } from '../types';

/**
 * Build signals from a long/flat state machine.
 *
 * Many rules are asymmetric — RSI buys oversold but sells overbought, breakouts
 * enter on a high but exit on a trailing stop — so a simple `condition ? 1 : 0`
 * map would flip the position on every bar in between. The machine holds its
 * state until the opposite condition fires.
 *
 * Both predicates must return `false` while their indicators are still warming
 * up; `NaN` comparisons do that naturally, which is why the indicator library
 * pads warm-up with `NaN` rather than zero.
 */
export function stateMachine(
  length: number,
  enter: (i: number) => boolean,
  exit: (i: number) => boolean
): Signal[] {
  const signals = new Array<Signal>(length).fill(0);
  let position = 0;

  for (let i = 0; i < length; i++) {
    if (position === 0) {
      if (enter(i)) position = 1;
    } else if (exit(i)) {
      position = 0;
    }
    signals[i] = position;
  }

  return signals;
}

/** Map a per-bar boolean condition directly to exposure. */
export function whenTrue(length: number, condition: (i: number) => boolean): Signal[] {
  const signals = new Array<Signal>(length).fill(0);
  for (let i = 0; i < length; i++) signals[i] = condition(i) ? 1 : 0;
  return signals;
}

/** True only when every value is a real number — guards indicator warm-up. */
export function defined(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

/**
 * Scale a base long/flat signal down when realized volatility runs hotter
 * than `targetVol`, and back up (capped at `maxLeverage`) when it's calmer —
 * the risk-sizing counterpart to `whenTrue`/`stateMachine`, which only ever
 * decide direction. `NaN`/non-positive realized vol (warm-up) scales to zero,
 * matching how every other indicator treats warm-up as "no opinion."
 */
export function volatilityScaled(
  baseSignal: Signal[],
  realizedVol: number[],
  targetVol: number,
  maxLeverage = 1
): Signal[] {
  return baseSignal.map((signal, i) => {
    const vol = realizedVol[i];
    if (!Number.isFinite(vol) || vol <= 0) return 0;
    return signal * Math.max(Math.min(targetVol / vol, maxLeverage), 0);
  });
}
