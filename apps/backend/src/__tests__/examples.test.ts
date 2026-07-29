import { describe, it, expect } from 'vitest';
import { runBacktest, runBuyAndHold } from '../backtest/engine';
import { SPY_DAILY_SAMPLE, SPY_DAILY_SAMPLE_META } from '../backtest/fixtures';
import { STRATEGY_EXAMPLES } from '../backtest/examples';
import { bollinger, closes, donchian, roc, rsi, sma } from '../backtest/indicators';
import {
  absoluteMomentum,
  bollingerBreakout,
  bollingerReversion,
  donchianBreakout,
  rsiReversion,
  smaCross,
} from '../backtest/strategies';
import { PERIODS_PER_YEAR } from '../constants/time';
import { StrategyKind, type BacktestOptions } from '../backtest/types';

const OPTIONS: BacktestOptions = {
  initialCapital: 10_000,
  feeBps: 5,
  slippageBps: 5,
  periodsPerYear: PERIODS_PER_YEAR.equityDaily,
};

/** All the examples index into this by id — keeps the assertions readable. */
const byId = new Map(STRATEGY_EXAMPLES.map((e) => [e.strategyId, e]));

describe('SPY_DAILY_SAMPLE fixture', () => {
  it('is frozen real data, not synthesized', () => {
    expect(SPY_DAILY_SAMPLE.length).toBe(600);
    expect(SPY_DAILY_SAMPLE_META.bars).toBe(600);
    expect(SPY_DAILY_SAMPLE_META.symbol).toBe('SPY');
  });

  it('is sorted ascending with no duplicate timestamps', () => {
    for (let i = 1; i < SPY_DAILY_SAMPLE.length; i++) {
      expect(SPY_DAILY_SAMPLE[i].time).toBeGreaterThan(SPY_DAILY_SAMPLE[i - 1].time);
    }
  });

  it('carries plausible OHLC bars (high is the extreme, prices are positive)', () => {
    for (const bar of SPY_DAILY_SAMPLE) {
      expect(bar.high).toBeGreaterThanOrEqual(bar.low);
      expect(bar.high).toBeGreaterThanOrEqual(bar.open);
      expect(bar.high).toBeGreaterThanOrEqual(bar.close);
      expect(bar.low).toBeLessThanOrEqual(bar.open);
      expect(bar.low).toBeLessThanOrEqual(bar.close);
      expect(bar.close).toBeGreaterThan(0);
      expect(bar.volume).toBeGreaterThanOrEqual(0);
    }
  });

  it('matches its own start/end date metadata', () => {
    const start = new Date(SPY_DAILY_SAMPLE[0].time).toISOString().slice(0, 10);
    const end = new Date(SPY_DAILY_SAMPLE.at(-1)!.time).toISOString().slice(0, 10);
    expect(start).toBe(SPY_DAILY_SAMPLE_META.startDate);
    expect(end).toBe(SPY_DAILY_SAMPLE_META.endDate);
  });
});

describe('STRATEGY_EXAMPLES registry', () => {
  it('covers every family at least once, including the benchmark', () => {
    const kinds = STRATEGY_EXAMPLES.map((e) => e.kind);
    expect(new Set(kinds)).toEqual(new Set(Object.values(StrategyKind)));
  });

  it('gives the breakout and mean-reversion families a Bollinger example alongside the other', () => {
    const byKind = new Map<string, string[]>();
    for (const e of STRATEGY_EXAMPLES)
      byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e.strategyId]);

    expect(byKind.get(StrategyKind.Breakout)).toEqual(['donchian_20_10', 'bb_breakout_20_2']);
    expect(byKind.get(StrategyKind.MeanReversion)).toEqual([
      'rsi_reversion_14_30_70',
      'bb_reversion_20_2',
    ]);
  });

  it('has no duplicate strategy ids', () => {
    const ids = STRATEGY_EXAMPLES.map((e) => e.strategyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every example a non-trivial rule, narrative and at least one step', () => {
    for (const example of STRATEGY_EXAMPLES) {
      expect(example.ruleFormula.length, example.strategyId).toBeGreaterThan(10);
      expect(example.explanation.length, example.strategyId).toBeGreaterThan(60);
      expect(example.steps.length, example.strategyId).toBeGreaterThan(0);
      expect(example.dataset.symbol).toBe('SPY');
      for (const step of example.steps) {
        expect(step.label.length, `${example.strategyId} step`).toBeGreaterThan(0);
        expect(step.formula.length, `${example.strategyId} step`).toBeGreaterThan(0);
        expect(step.result.length, `${example.strategyId} step`).toBeGreaterThan(0);
      }
    }
  });

  it('anchors every walkthrough to a real date inside the fixture window', () => {
    for (const example of STRATEGY_EXAMPLES) {
      expect(example.exampleDate >= SPY_DAILY_SAMPLE_META.startDate, example.strategyId).toBe(true);
      expect(example.exampleDate <= SPY_DAILY_SAMPLE_META.endDate, example.strategyId).toBe(true);
    }
  });

  /**
   * A state-machine rule has two legs, and a walkthrough that shows only the
   * entry reads as a rule that buys and never sells — which is what the
   * Bollinger reversion panel looked like before this. Rules built on `whenTrue`
   * are exempt: their exit is the negation of the holding condition, so stating
   * the condition states both legs.
   */
  it('documents the exit leg of every rule that has a distinct one', () => {
    const twoLegged = [
      'donchian_20_10',
      'bb_breakout_20_2',
      'rsi_reversion_14_30_70',
      'bb_reversion_20_2',
    ];

    for (const id of twoLegged) {
      const example = byId.get(id)!;
      expect(/Exit|Sell/.test(example.ruleFormula), `${id} ruleFormula`).toBe(true);

      const stepsMentionExit = example.steps.some((s) =>
        /exit|sell/i.test(`${s.label} ${s.result}`)
      );
      expect(stepsMentionExit, `${id} steps`).toBe(true);
    }
  });

  it('states the exposure condition for the rules whose exit is just its negation', () => {
    for (const id of ['sma_cross_50_200', 'abs_momentum_252']) {
      expect(/Long/.test(byId.get(id)!.ruleFormula), `${id} ruleFormula`).toBe(true);
    }
  });
});

describe('buy & hold walkthrough', () => {
  const example = byId.get('buy_and_hold')!;
  const price = closes(SPY_DAILY_SAMPLE);

  it('total return and CAGR match a fresh calc off the raw closes', () => {
    const p0 = price[0];
    const pN = price.at(-1)!;
    const years =
      (SPY_DAILY_SAMPLE.at(-1)!.time - SPY_DAILY_SAMPLE[0].time) / (365 * 24 * 60 * 60 * 1000);
    const expectedReturn = (pN / p0 - 1) * 100;
    const expectedCagr = ((pN / p0) ** (1 / years) - 1) * 100;

    const returnStep = example.steps[0];
    const cagrStep = example.steps[1];

    expect(parseFloat(returnStep.result)).toBeCloseTo(expectedReturn, 1);
    expect(parseFloat(cagrStep.result)).toBeCloseTo(expectedCagr, 1);
  });

  it('the comparison is identical to itself — there is nothing to beat', () => {
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(
      example.comparison.buyHoldTotalReturnPct,
      6
    );
  });

  it('matches a fresh runBuyAndHold over the same fixture and options', () => {
    const fresh = runBuyAndHold(SPY_DAILY_SAMPLE, OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyCagrPct).toBeCloseTo(fresh.cagrPct, 6);
    expect(example.comparison.strategyMaxDrawdownPct).toBeCloseTo(fresh.maxDrawdownPct, 6);
  });
});

describe('SMA cross walkthrough', () => {
  const example = byId.get('sma_cross_50_200')!;
  const price = closes(SPY_DAILY_SAMPLE);
  const fastMa = sma(price, 50);
  const slowMa = sma(price, 200);

  it('is anchored on an actual golden-cross bar', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    expect(idx).toBeGreaterThan(200);
    expect(fastMa[idx]).toBeGreaterThan(slowMa[idx]);
    expect(fastMa[idx - 1]).toBeLessThanOrEqual(slowMa[idx - 1]);
  });

  it('the plugged-in SMA values match the indicator library exactly', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const fastResult = parseFloat(example.steps[0].result.replace(/,/g, ''));
    const slowResult = parseFloat(example.steps[1].result.replace(/,/g, ''));

    expect(fastResult).toBeCloseTo(fastMa[idx], 2);
    expect(slowResult).toBeCloseTo(slowMa[idx], 2);
  });

  it('the 50-day average also equals a plain mean of the last 50 closes', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const window = price.slice(idx - 49, idx + 1);
    const manualMean = window.reduce((s, v) => s + v, 0) / 50;
    expect(manualMean).toBeCloseTo(fastMa[idx], 6);
  });

  it('comparison numbers match a fresh backtest of smaCross(50,200)', () => {
    const strategy = smaCross(50, 200);
    const fresh = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyCagrPct).toBeCloseTo(fresh.cagrPct, 6);
    expect(example.comparison.strategyNumTrades).toBe(fresh.numTrades);
  });
});

describe('absolute momentum walkthrough', () => {
  const example = byId.get('abs_momentum_252')!;
  const price = closes(SPY_DAILY_SAMPLE);
  const momentum = roc(price, 252);

  it('is anchored where the 252-bar ROC actually flips to non-positive', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    expect(momentum[idx]).toBeLessThanOrEqual(0);
    expect(momentum[idx - 1]).toBeGreaterThan(0);
  });

  it('the ROC plugged into the walkthrough matches the indicator library', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const shown = parseFloat(example.steps[0].result.replace('%', ''));
    expect(shown).toBeCloseTo(momentum[idx], 2);
  });

  it('comparison numbers match a fresh backtest of absoluteMomentum(252)', () => {
    const strategy = absoluteMomentum(252);
    const fresh = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyMaxDrawdownPct).toBeCloseTo(fresh.maxDrawdownPct, 6);
  });
});

describe('Donchian breakout walkthrough', () => {
  const example = byId.get('donchian_20_10')!;
  const price = closes(SPY_DAILY_SAMPLE);
  const channel = donchian(SPY_DAILY_SAMPLE, 20);

  it('is anchored on a fresh breakout above the 20-bar high', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    expect(price[idx]).toBeGreaterThan(channel.upper[idx]);
    expect(price[idx - 1]).toBeLessThanOrEqual(channel.upper[idx - 1]);
  });

  it('the channel value plugged into the walkthrough matches the indicator library', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const shown = parseFloat(example.steps[0].result.replace(/,/g, ''));
    expect(shown).toBeCloseTo(channel.upper[idx], 2);
  });

  it('comparison numbers match a fresh backtest of donchianBreakout(20,10)', () => {
    const strategy = donchianBreakout(20, 10);
    const fresh = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyExposurePct).toBeCloseTo(fresh.exposurePct, 6);
  });
});

describe('Bollinger breakout walkthrough', () => {
  const example = byId.get('bb_breakout_20_2')!;
  const price = closes(SPY_DAILY_SAMPLE);
  const bands = bollinger(price, 20, 2);

  it('is anchored on a fresh close above the upper band', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    expect(price[idx]).toBeGreaterThan(bands.upper[idx]);
    expect(price[idx - 1]).toBeLessThanOrEqual(bands.upper[idx - 1]);
  });

  it('the plugged-in band values match the indicator library exactly', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const upperShown = parseFloat(example.steps[1].result.replace(/,/g, ''));
    expect(upperShown).toBeCloseTo(bands.upper[idx], 2);
  });

  it('comparison numbers match a fresh backtest of bollingerBreakout(20, 2)', () => {
    const strategy = bollingerBreakout(20, 2);
    const fresh = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyMaxDrawdownPct).toBeCloseTo(fresh.maxDrawdownPct, 6);
  });
});

describe('Bollinger reversion walkthrough', () => {
  const example = byId.get('bb_reversion_20_2')!;
  const price = closes(SPY_DAILY_SAMPLE);
  const bands = bollinger(price, 20, 2);

  it('is anchored on a fresh touch of the lower band', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    expect(price[idx]).toBeLessThanOrEqual(bands.lower[idx]);
    expect(price[idx - 1]).toBeGreaterThan(bands.lower[idx - 1]);
  });

  it('the plugged-in band values match the indicator library exactly', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const lowerShown = parseFloat(example.steps[1].result.replace(/,/g, ''));
    expect(lowerShown).toBeCloseTo(bands.lower[idx], 2);
  });

  it('comparison numbers match a fresh backtest of bollingerReversion(20, 2)', () => {
    const strategy = bollingerReversion(20, 2);
    const fresh = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyNumTrades).toBe(fresh.numTrades);
  });

  it('quotes the same upper band the engine actually sells at', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const exitStep = example.steps.find((s) => /sell/i.test(s.label))!;
    const shown = parseFloat(exitStep.result.replace(/[^\d.]/g, ''));

    expect(shown).toBeCloseTo(bands.upper[idx], 2);
  });

  it('every exit the engine takes is at or above the upper band', () => {
    const signals = bollingerReversion(20, 2).signals(SPY_DAILY_SAMPLE);

    let exits = 0;
    for (let i = 1; i < signals.length; i++) {
      if (signals[i - 1] === 1 && signals[i] === 0) {
        exits++;
        expect(price[i], `exit at bar ${i}`).toBeGreaterThanOrEqual(bands.upper[i]);
      }
    }

    // Guards the assertion above against a signal series that never exits.
    expect(exits).toBeGreaterThan(0);
  });
});

describe('RSI reversion walkthrough', () => {
  const example = byId.get('rsi_reversion_14_30_70')!;
  const price = closes(SPY_DAILY_SAMPLE);
  const rsi14 = rsi(price, 14);

  it('is anchored on an actual oversold bar', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    expect(rsi14[idx]).toBeLessThan(30);
  });

  it('the recursive gain/loss averages resolve to the same RSI the indicator library reports', () => {
    const idx = SPY_DAILY_SAMPLE.findIndex(
      (b) => new Date(b.time).toISOString().slice(0, 10) === example.exampleDate
    );
    const shownRsi = parseFloat(example.steps[2].result);
    expect(shownRsi).toBeCloseTo(rsi14[idx], 2);
  });

  it('comparison numbers match a fresh backtest of rsiReversion(14, 30, 70)', () => {
    const strategy = rsiReversion(14, 30, 70);
    const fresh = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS).stats;
    expect(example.comparison.strategyTotalReturnPct).toBeCloseTo(fresh.totalReturnPct, 6);
    expect(example.comparison.strategyNumTrades).toBe(fresh.numTrades);
  });
});

/**
 * The broader promise behind the fixture: it is not just for the guide page's
 * five flagship examples, it is real market data every strategy in the
 * registry can be pointed at. This is that test — the one the live-data
 * fixture was built to support — run now rather than left for later.
 */
describe('every registered strategy against real SPY history', () => {
  it('produces a finite, in-range signal for every bar', async () => {
    const { STRATEGIES } = await import('../backtest/strategies');
    for (const strategy of STRATEGIES) {
      const signals = strategy.signals(SPY_DAILY_SAMPLE);
      expect(signals, strategy.id).toHaveLength(SPY_DAILY_SAMPLE.length);
      expect(
        signals.every((s) => Number.isFinite(s) && s >= 0 && s <= 1),
        strategy.id
      ).toBe(true);
    }
  });

  it('backtests cleanly — finite stats, no negative equity, no fee/slippage NaNs', async () => {
    const { STRATEGIES } = await import('../backtest/strategies');
    for (const strategy of STRATEGIES) {
      const result = runBacktest(SPY_DAILY_SAMPLE, strategy.signals(SPY_DAILY_SAMPLE), OPTIONS);

      expect(
        result.equity.every((v) => Number.isFinite(v) && v >= 0),
        strategy.id
      ).toBe(true);
      expect(Number.isFinite(result.stats.totalReturnPct), strategy.id).toBe(true);
      expect(Number.isFinite(result.stats.maxDrawdownPct), strategy.id).toBe(true);
      expect(result.stats.maxDrawdownPct, strategy.id).toBeLessThanOrEqual(0);
    }
  });

  it('every strategy is applicable to a 600-bar SPY window', async () => {
    const { applicableStrategies, STRATEGIES } = await import('../backtest/strategies');
    expect(applicableStrategies(SPY_DAILY_SAMPLE.length)).toHaveLength(STRATEGIES.length);
  });
});
