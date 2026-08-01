import { describe, it, expect } from 'vitest';
import { applicableStrategies, buyAndHold, getStrategy, STRATEGIES } from '../backtest/strategies';
import { StrategyKind } from '../backtest/types';
import { stateMachine, whenTrue, defined } from '../backtest/strategies/helpers';
import { emaCross, priceAboveSma, smaCross } from '../backtest/strategies/trend';
import {
  bollingerReversion,
  ibsReversion,
  nDayLowReversion,
  rsiReversion,
} from '../backtest/strategies/meanReversion';
import {
  absoluteMomentum,
  donchianBreakout,
  volatilitySqueezeBreakout,
} from '../backtest/strategies/breakout';
import { barsFromCloses, oscillatingCloses, risingCloses } from './helpers/bars';

describe('strategy registry', () => {
  it('has unique ids', () => {
    const ids = STRATEGIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes every strategy by id', () => {
    for (const strategy of STRATEGIES) {
      expect(getStrategy(strategy.id)).toBe(strategy);
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(getStrategy('does_not_exist')).toBeUndefined();
  });

  it('includes exactly one benchmark', () => {
    expect(STRATEGIES.filter((s) => s.kind === StrategyKind.Benchmark)).toHaveLength(1);
  });

  it('produces same-length 0-1 signals for every strategy', () => {
    const bars = barsFromCloses(risingCloses(400, 100, 0.5));

    for (const strategy of STRATEGIES) {
      const signals = strategy.signals(bars);
      expect(signals, strategy.id).toHaveLength(bars.length);
      expect(
        signals.every((s) => !Number.isFinite(s) || (s >= 0 && s <= 1)),
        strategy.id
      ).toBe(true);
    }
  });

  it('never throws on a series shorter than its warm-up', () => {
    const bars = barsFromCloses(risingCloses(5));
    for (const strategy of STRATEGIES) {
      expect(() => strategy.signals(bars), strategy.id).not.toThrow();
    }
  });
});

describe('applicableStrategies', () => {
  it('excludes strategies whose warm-up exceeds the history', () => {
    const applicable = applicableStrategies(100).map((s) => s.id);
    // A 200-day average needs far more than 100 bars to say anything.
    expect(applicable).not.toContain('sma_cross_50_200');
    expect(applicable).toContain('buy_and_hold');
  });

  it('admits everything given deep history', () => {
    expect(applicableStrategies(5_000)).toHaveLength(STRATEGIES.length);
  });
});

describe('stateMachine', () => {
  it('holds position until the exit condition fires', () => {
    // Enter at 1, exit at 4 — the bars between must stay long.
    const signals = stateMachine(
      6,
      (i) => i === 1,
      (i) => i === 4
    );
    expect(signals).toEqual([0, 1, 1, 1, 0, 0]);
  });

  it('ignores an enter condition while already long', () => {
    const signals = stateMachine(
      4,
      () => true,
      () => false
    );
    expect(signals).toEqual([1, 1, 1, 1]);
  });
});

describe('whenTrue', () => {
  it('maps a condition straight onto exposure', () => {
    expect(whenTrue(4, (i) => i % 2 === 0)).toEqual([1, 0, 1, 0]);
  });
});

describe('defined', () => {
  it('rejects NaN and Infinity', () => {
    expect(defined(1, 2)).toBe(true);
    expect(defined(1, NaN)).toBe(false);
    expect(defined(Infinity)).toBe(false);
  });
});

describe('trend strategies', () => {
  it('holds a steadily rising market', () => {
    const bars = barsFromCloses(risingCloses(400, 100, 0.5));
    expect(smaCross(50, 200).signals(bars).at(-1)).toBe(1);
    expect(emaCross(12, 26).signals(bars).at(-1)).toBe(1);
    expect(priceAboveSma(200).signals(bars).at(-1)).toBe(1);
  });

  it('goes flat in a steadily falling market', () => {
    const bars = barsFromCloses(risingCloses(400, 100, 0.5).reverse());
    expect(smaCross(50, 200).signals(bars).at(-1)).toBe(0);
    expect(priceAboveSma(200).signals(bars).at(-1)).toBe(0);
  });

  it('stays flat through the warm-up region', () => {
    const bars = barsFromCloses(risingCloses(400, 100, 0.5));
    const signals = smaCross(50, 200).signals(bars);
    expect(signals.slice(0, 199).every((s) => s === 0)).toBe(true);
  });
});

describe('momentum and breakout strategies', () => {
  it('absolute momentum is long while trailing return is positive', () => {
    const rising = barsFromCloses(risingCloses(400, 100, 0.5));
    expect(absoluteMomentum(252).signals(rising).at(-1)).toBe(1);

    const falling = barsFromCloses(risingCloses(400, 100, 0.5).reverse());
    expect(absoluteMomentum(252).signals(falling).at(-1)).toBe(0);
  });

  it('donchian breakout enters on new highs', () => {
    const bars = barsFromCloses(risingCloses(200, 100, 1));
    expect(donchianBreakout(20, 10).signals(bars).at(-1)).toBe(1);
  });

  it('volatility squeeze breakout enters after a quiet stretch breaks out', () => {
    // Flat prices compress the Bollinger band to its tightest reading, then a
    // sharp move breaks above the upper band while that squeeze is still recent.
    const bars = barsFromCloses([...Array(40).fill(100), 130]);
    expect(volatilitySqueezeBreakout(10, 2, 20, 5).signals(bars).at(-1)).toBe(1);
  });

  it('volatility squeeze breakout ignores a breakout with no prior squeeze', () => {
    // A steadily rising market never compresses — bandwidth keeps expanding —
    // so no bar ever qualifies as a fresh squeeze low, and the rule stays flat.
    const bars = barsFromCloses(risingCloses(200, 100, 1));
    expect(
      volatilitySqueezeBreakout(10, 2, 20, 5)
        .signals(bars)
        .every((s) => s === 0)
    ).toBe(true);
  });
});

describe('mean-reversion strategies', () => {
  it('rsi reversion trades an oscillating market', () => {
    const bars = barsFromCloses(oscillatingCloses(400, 100, 15, 30));
    const signals = rsiReversion(14, 30, 70).signals(bars);
    // It must actually change state, not sit in one position throughout.
    expect(new Set(signals.slice(60)).size).toBe(2);
  });

  it('bollinger reversion buys the lower band', () => {
    // A long calm stretch then a sharp drop pushes price outside the band.
    const bars = barsFromCloses([...Array(60).fill(100), 70]);
    expect(bollingerReversion(20, 2).signals(bars).at(-1)).toBe(1);
  });

  it('ibs reversion buys a close pinned to its own low', () => {
    // barsFromCloses sets the bar's low to min(open, close) — a falling day's
    // close always lands exactly on the low, so IBS is 0 throughout.
    const bars = barsFromCloses(risingCloses(30, 100, 0.5).reverse());
    expect(ibsReversion(10, 90).signals(bars).at(-1)).toBe(1);
  });

  it('ibs reversion exits a close pinned to its own high', () => {
    const bars = barsFromCloses(risingCloses(30, 100, 0.5));
    expect(ibsReversion(10, 90).signals(bars).at(-1)).toBe(0);
  });

  it('n-day low reversion buys a fresh closing low', () => {
    const bars = barsFromCloses(risingCloses(30, 100, 0.5).reverse());
    expect(nDayLowReversion(7).signals(bars).at(-1)).toBe(1);
  });

  it('n-day low reversion never enters a steadily rising market', () => {
    // Every close is a fresh high, never a fresh low — the entry condition
    // can't fire, so the strategy stays flat throughout.
    const bars = barsFromCloses(risingCloses(30, 100, 0.5));
    expect(
      nDayLowReversion(7)
        .signals(bars)
        .every((s) => s === 0)
    ).toBe(true);
  });
});

describe('buyAndHold', () => {
  it('is long on every bar', () => {
    const bars = barsFromCloses(risingCloses(50));
    expect(buyAndHold.signals(bars).every((s) => s === 1)).toBe(true);
  });
});
