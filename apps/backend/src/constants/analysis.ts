/** Bars of each timeframe kept for indicator context in the live snapshot. */
export const CONTEXT_BARS = 300;

/** Default indicator periods used by the live multi-timeframe analysis. */
export const LIVE_INDICATOR_PERIODS = {
  sma: 20,
  bollinger: 20,
  bollingerStd2: 2,
  bollingerStd3: 3,
  emaFast: 20,
  emaSlow: 50,
  rsi: 14,
} as const;

/** Lookback and threshold for the EMA trajectory label. */
export const TRAJECTORY = {
  lookback: 5,
  /** Percent change above/below which the slope is called rising/falling */
  thresholdPct: 0.2,
} as const;

/** EMA spread thresholds, in percent, for the crossover label. */
export const EMA_CROSS_THRESHOLD_PCT = 1;

/** Snapshot is considered stale beyond this age. */
export const SNAP_STALE_MS = 15 * 60 * 1000;

/** On startup, rebuild if the stored snap or report is older than this. */
export const STARTUP_SNAP_MAX_AGE_MS = 15 * 60 * 1000;
export const STARTUP_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// --- TSMOM ---

export const TSMOM_TIMEFRAME_WEIGHTS = {
  '5M': 0.5,
  '1H': 1,
  '4H': 1.5,
  D: 2,
  W: 2.5,
  M: 3,
} as const;

export const TSMOM_COMPONENT_WEIGHTS = {
  directional: 0.25,
  emaStructure: 0.25,
  emaTrajectory: 0.2,
  acceleration: 0.15,
  bbConfirmation: 0.15,
} as const;

export const TSMOM_LABELS = [
  { min: 75, label: 'strong continuation' },
  { min: 60, label: 'continuation' },
  { min: 45, label: 'indecision' },
  { min: 30, label: 'fading' },
  { min: -Infinity, label: 'reversal pressure' },
] as const;
