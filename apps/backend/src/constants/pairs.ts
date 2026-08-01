/**
 * Candidate pairs to test for cointegration.
 *
 * This is a shortlist of *hypotheses*, not a guarantee — every pair here
 * still has to pass Engle-Granger (both directions) and the Hurst exponent
 * check in `analyzers/pairs.ts` before it trades. What earns a pair a spot
 * on this list is a real economic reason the two prices might share a
 * long-run equilibrium, the thing the source article is explicit about
 * wanting beyond the statistics alone. Both legs are already part of
 * `config.universe`, so no new data collection is needed to test any of
 * these.
 */

export interface PairCandidateSpec {
  legA: string;
  legB: string;
  /** One-line economic reason these two might be cointegrated, not just correlated. */
  rationale: string;
}

export const CANDIDATE_PAIRS: PairCandidateSpec[] = [
  {
    legA: 'GLD',
    legB: 'SLV',
    rationale:
      'Both precious metals, driven by the same real-rate and dollar-strength backdrop — ' +
      'the gold/silver ratio has a long history of trading in a band.',
  },
  {
    legA: 'LQD',
    legB: 'HYG',
    rationale:
      'Both corporate credit, split by quality. The spread between them is a standard ' +
      'read on credit-market nervousness, which is itself mean-reverting between crises.',
  },
  {
    legA: 'XLY',
    legB: 'XLP',
    rationale:
      'Discretionary vs staples — what people buy when comfortable vs what they buy ' +
      'regardless. The classic risk-appetite pair inside the same equity market.',
  },
  {
    legA: 'EEM',
    legB: 'EFA',
    rationale:
      'Both "world ex-US" equity beta, split by development status. Share a global-growth ' +
      'and dollar-strength driver even though their regional composition differs.',
  },
  {
    legA: 'XLE',
    legB: 'USO',
    rationale:
      'Energy equities vs the commodity itself — XLE holds producers whose earnings track ' +
      'crude with a lag, so the two should not drift apart indefinitely.',
  },
  {
    legA: 'SPY',
    legB: 'QQQ',
    rationale:
      'Broad market vs its own most concentrated, tech-heavy subset. QQQ is close to a ' +
      'levered bet on part of SPY, not an independent series.',
  },
];
