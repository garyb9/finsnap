/**
 * Indicator library for the backtest engine.
 *
 * Every function returns an array the same length as its input, with `NaN`
 * through the warm-up region where the indicator is not yet defined. Strategies
 * treat `NaN` as "no opinion" and stay flat, which keeps warm-up out of the
 * results instead of silently trading on a half-formed average.
 */

export * from './bands';
export * from './movingAverages';
export * from './oscillators';
export * from './volatility';
