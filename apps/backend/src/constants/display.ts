import { SignalAction, Verdict, WindowId } from './enums';

export const VERDICT_LABEL: Record<Verdict, string> = {
  [Verdict.StrongBuy]: 'STRONG BUY',
  [Verdict.Accumulate]: 'ACCUMULATE',
  [Verdict.Neutral]: 'NEUTRAL',
  [Verdict.Reduce]: 'REDUCE',
  [Verdict.Avoid]: 'AVOID',
};

export const VERDICT_DOT: Record<Verdict, string> = {
  [Verdict.StrongBuy]: '🟢',
  [Verdict.Accumulate]: '🟩',
  [Verdict.Neutral]: '⬜',
  [Verdict.Reduce]: '🟧',
  [Verdict.Avoid]: '🔴',
};

export const ACTION_LABEL: Record<SignalAction, string> = {
  [SignalAction.Enter]: 'ENTER',
  [SignalAction.Hold]: 'hold',
  [SignalAction.Exit]: 'EXIT',
  [SignalAction.StayOut]: 'cash',
};

export const ACTION_PHRASE: Record<SignalAction, string> = {
  [SignalAction.Enter]: 'fires a fresh entry',
  [SignalAction.Hold]: 'is already long',
  [SignalAction.Exit]: 'is exiting',
  [SignalAction.StayOut]: 'is staying in cash',
};

export const ACTION_DOT: Record<SignalAction.Enter | SignalAction.Exit, string> = {
  [SignalAction.Enter]: '🟢',
  [SignalAction.Exit]: '🔴',
};

/** Windows preferred for the single headline stat, best-supported first. */
export const HEADLINE_WINDOWS: WindowId[] = [
  WindowId.Y5,
  WindowId.Y3,
  WindowId.Max,
  WindowId.Y2,
  WindowId.Y1,
];

/** Column widths for the fixed-width text tables. */
export const COLUMN = {
  label: 6,
  price: 9,
  changePct: 7,
  verdict: 11,
  action: 6,
  strategyName: 28,
  score: 3,
} as const;

/** Edge-score bands used in written rationales. */
export const EDGE_NOTES = [
  { min: 65, note: 'strong historical edge' },
  { min: 55, note: 'modest edge' },
  { min: 45, note: 'no clear edge over buy & hold' },
  { min: -Infinity, note: 'historically worse than holding' },
] as const;

/** TSMOM score bands for the status dot. */
export const TSMOM_BANDS = [
  { min: 60, dot: '🟢' },
  { min: 45, dot: '🟡' },
  { min: -Infinity, dot: '🔴' },
] as const;

/** Bollinger bandwidth regime labels. */
export const BANDWIDTH_BANDS = [
  { min: 5, label: 'wide' },
  { min: 2, label: 'moderate' },
  { min: -Infinity, label: 'tight' },
] as const;

/** Position of price inside the Bollinger envelope. */
export const PERCENT_B_BANDS = [
  { min: 0.8, label: 'upper band' },
  { min: 0.6, label: 'upper half' },
  { min: 0.4, label: 'mid' },
  { min: 0.2, label: 'lower half' },
  { min: -Infinity, label: 'lower band' },
] as const;
