import { describe, expect, it } from 'vitest';
import { buildCorrelationMatrix, CORRELATION_WINDOWS } from '../analyzers/correlation';
import type { CorrelationSeries } from '../analyzers/correlation';
import { AssetCategory } from '../constants/enums';
import type { Bar } from '../collectors/types';

const DAY_MS = 86_400_000;
const START = Date.UTC(2024, 0, 1);

/** Daily bars from a list of closes, one calendar day apart. */
function makeBars(closes: number[]): Bar[] {
  return closes.map((close, i) => ({
    time: START + i * DAY_MS,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
  }));
}

function series(
  label: string,
  closes: number[],
  category = AssetCategory.EquityIndex
): CorrelationSeries {
  return { symbol: label, label, category, bars: makeBars(closes) };
}

const maxWindow = CORRELATION_WINDOWS.find((w) => w.id === 'max')!;

describe('buildCorrelationMatrix', () => {
  it('scores an asset perfectly correlated with itself as 1', () => {
    const closes = [
      100, 101, 99, 103, 105, 104, 108, 110, 107, 112, 115, 111, 118, 120, 117, 122, 125, 121, 128,
      130, 126,
    ];
    const matrix = buildCorrelationMatrix([series('A', closes), series('B', closes)], maxWindow);

    const edge = matrix.edges.find((e) => e.a === 'A' && e.b === 'B');
    expect(edge?.r).toBeCloseTo(1, 2);
  });

  it('scores an inverted series as -1', () => {
    const closes = [
      100, 102, 99, 103, 97, 105, 96, 106, 95, 108, 94, 109, 93, 111, 92, 112, 91, 114, 90, 115, 89,
    ];

    // Built so each day's return on B is the exact negative of A's — the only
    // construction where the *returns* correlation, not just the price shape,
    // comes out to -1.
    const inverted = [100];
    for (let i = 1; i < closes.length; i++) {
      const returnA = closes[i] / closes[i - 1] - 1;
      inverted.push(inverted[i - 1] * (1 - returnA));
    }

    const matrix = buildCorrelationMatrix([series('A', closes), series('B', inverted)], maxWindow);

    const edge = matrix.edges.find((e) => e.a === 'A' && e.b === 'B');
    expect(edge?.r).toBeCloseTo(-1, 2);
  });

  it('reports 0 rather than a noisy figure below the minimum sample size', () => {
    const matrix = buildCorrelationMatrix(
      [series('A', [100, 101, 99]), series('B', [50, 49, 51])],
      maxWindow
    );

    const edge = matrix.edges.find((e) => e.a === 'A' && e.b === 'B');
    expect(edge?.r).toBe(0);
    expect(edge?.sample).toBe(2);
  });

  it('ignores bars outside the requested window', () => {
    const flat = Array.from({ length: 400 }, () => 100);
    const walk = flat.map((_, i) => 100 + Math.sin(i / 3) * 10);

    const cutMatrix = buildCorrelationMatrix(
      [series('A', flat), series('B', walk)],
      CORRELATION_WINDOWS.find((w) => w.id === '3m')!
    );

    // 3 months of daily bars out of a 400-bar series is a small, fixed slice.
    const edge = cutMatrix.edges.find((e) => e.a === 'A' && e.b === 'B')!;
    expect(edge.sample).toBeLessThan(100);
  });

  it('orders nodes by category then label, and keeps the grid symmetric with a unit diagonal', () => {
    const closes = [
      100, 102, 101, 104, 103, 106, 105, 108, 107, 110, 109, 112, 111, 114, 113, 116, 115, 118, 117,
      120, 119,
    ];
    const matrix = buildCorrelationMatrix(
      [
        series('SPY', closes, AssetCategory.EquityIndex),
        series('BTC', closes, AssetCategory.Crypto),
        series('GLD', closes, AssetCategory.Commodity),
      ],
      maxWindow
    );

    expect(matrix.nodes.map((n) => n.label)).toEqual(['BTC', 'SPY', 'GLD']);

    const n = matrix.nodes.length;
    for (let i = 0; i < n; i++) {
      expect(matrix.grid[i][i]).toBe(1);
      for (let j = 0; j < n; j++) {
        expect(matrix.grid[i][j]).toBe(matrix.grid[j][i]);
      }
    }
  });
});
