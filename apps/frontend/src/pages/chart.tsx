import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { LoadingStateContent } from '../components/LoadingState';
import { CardTitle } from '../components/Card';
import { ChartStyle, TradingViewChart } from '../components/TradingViewChart';
import { Dropdown } from '../components/Dropdown';
import { StrategyStatsCard } from '../components/StrategyStatsCard';
import { useFinSnapData } from '../lib/dataContext';
import { fetchAssetReport } from '../lib/api';
import { changeColor, fmtMoneyShort, fmtPct, fmtPrice } from '../lib/format';
import { mergeStudies, studiesFor } from '../lib/tradingviewStudies';
import { StrategyKind } from '../types/enums';
import type { AssetReport } from '../types/assetReport';

/**
 * A live TradingView chart per ticker, with an optional overlay of a
 * strategy's own indicator(s) and its record against buy & hold — and,
 * against a second strategy, a side-by-side comparison of both.
 */

/** Falls back through SPY, then whatever the universe lists first. */
const DEFAULT_SYMBOL = 'SPY';

/** Dropdown sentinel for "nothing picked" — Dropdown's value type is string, not string | null. */
const NONE = '';

const Wrap = styled.section`
  width: 100%;
  border-radius: ${theme.radius.lg};
  border: 1px solid ${theme.colors.borderSlate};
  background: radial-gradient(
    circle at top left,
    ${theme.colors.cardBgStart} 0,
    ${theme.colors.cardBgEnd} 70%
  );
  box-shadow: ${theme.colors.shadowCard};
  display: flex;
  flex-direction: column;
`;

/** Title, ticker picker, price and the strategy/compare pickers, all in one row. */
const ControlRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 22px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const PriceBlock = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  line-height: 1;
`;

const PriceNum = styled.span`
  font-size: 1.3rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
  font-variant-numeric: tabular-nums;
`;

const TickerLabel = styled.span`
  font-size: 0.82rem;
  color: ${theme.colors.label};
`;

const Change = styled.span<{ $pct: number }>`
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: ${({ $pct }) => changeColor($pct)};
`;

const ClearButton = styled.button`
  all: unset;
  cursor: pointer;
  font-size: 0.66rem;
  line-height: 1;
  color: ${theme.colors.label};
  padding: 4px;

  &:hover {
    color: ${theme.colors.danger};
  }
`;

const Note = styled.div`
  margin: 12px 22px 0;
  padding: 8px 12px;
  border-radius: ${theme.radius.sm};
  background: ${theme.colors.slateOverlay};
  border: 1px solid ${theme.colors.borderSlate};
  font-size: 0.7rem;
  line-height: 1.55;
  color: ${theme.colors.textMuted};

  b {
    color: ${theme.colors.textSlateLight};
  }
`;

const StatsRow = styled.div`
  width: 100%;
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const Empty = styled.div`
  padding: 22px;
  font-size: 0.78rem;
  color: ${theme.colors.label};
  text-align: center;
`;

export default function ChartPage() {
  const router = useRouter();
  const { snap, guide, loading } = useFinSnapData();
  const assets = useMemo(() => (snap ? Object.values(snap.assets) : []), [snap]);
  const infoBySymbol = useMemo(
    () => new Map((guide?.assets ?? []).map((a) => [a.symbol, a])),
    [guide]
  );

  // Null until the user picks explicitly — SPY (or the first available asset)
  // is resolved below rather than baked into the initial state, so it still
  // lands on SPY the moment the universe loads instead of racing it.
  const [pickedSymbol, setPickedSymbol] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  // Lets the command palette (and any other deep link) land straight on a ticker.
  useEffect(() => {
    const q = router.query.ticker;
    if (typeof q === 'string' && q) setPickedSymbol(q.toUpperCase());
  }, [router.query.ticker]);

  const asset =
    assets.find((a) => a.symbol === pickedSymbol) ??
    assets.find((a) => a.symbol === DEFAULT_SYMBOL) ??
    assets[0];

  // Biggest first — size is the one axis every asset in the universe shares,
  // crypto and funds included, so it's a more useful default order than
  // whatever order the snapshot happens to list them in.
  const tickerOptions = useMemo(
    () =>
      [...assets]
        .sort((a, b) => (b.size?.value ?? -1) - (a.size?.value ?? -1))
        .map((a) => ({
          value: a.symbol,
          primary: a.label,
          secondary: infoBySymbol.get(a.symbol)?.name,
          meta: `$${fmtPrice(a.currentPrice)}${a.size ? ` · ${fmtMoneyShort(a.size.value)}` : ''}`,
        })),
    [assets, infoBySymbol]
  );

  // Tradeable strategies only — the benchmark has no indicator of its own,
  // and it is what every backtest is already measured against.
  const strategyChoices = useMemo(
    () => (guide?.strategies ?? []).filter((s) => s.kind !== StrategyKind.Benchmark),
    [guide]
  );

  const strategyOptions = useMemo(
    () => [
      { value: NONE, primary: 'No overlay', secondary: 'Just the price chart' },
      ...strategyChoices.map((s) => ({ value: s.id, primary: s.name, secondary: s.description })),
    ],
    [strategyChoices]
  );

  const compareOptions = useMemo(
    () => [
      { value: NONE, primary: 'None', secondary: "Don't compare" },
      ...strategyChoices
        .filter((s) => s.id !== strategyId)
        .map((s) => ({ value: s.id, primary: s.name, secondary: s.description })),
    ],
    [strategyChoices, strategyId]
  );

  // Every strategy's full result for this asset, fetched once per ticker —
  // whichever strategy gets picked afterward is already in there, so picking
  // a strategy never has to wait on a new request.
  const [assetReport, setAssetReport] = useState<AssetReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    setReportLoading(true);
    setAssetReport(null);
    void fetchAssetReport(asset.symbol).then((report) => {
      if (cancelled) return;
      setAssetReport(report);
      setReportLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [asset?.symbol]);

  const primaryMapping = strategyId ? studiesFor(strategyId) : null;
  const compareMapping = compareId ? studiesFor(compareId) : null;
  const studies = useMemo(
    () => mergeStudies(primaryMapping, compareMapping),
    [primaryMapping, compareMapping]
  );

  if (loading && !snap) {
    return (
      <Page>
        <LoadingStateContent />
      </Page>
    );
  }

  return (
    <Page>
      <MainContainer>
        <Wrap>
          <ControlRow>
            <CardTitle style={{ margin: 0, whiteSpace: 'nowrap', lineHeight: 1 }}>Chart</CardTitle>

            <Dropdown
              placeholder="Select a ticker…"
              options={tickerOptions}
              value={asset?.symbol ?? null}
              onChange={setPickedSymbol}
            />

            {asset && (
              <>
                <PriceBlock>
                  <PriceNum>${fmtPrice(asset.currentPrice)}</PriceNum>
                  <TickerLabel>{asset.label}</TickerLabel>
                  <Change $pct={asset.changePct}>{fmtPct(asset.changePct, 2)}</Change>
                </PriceBlock>

                <Dropdown
                  placeholder="No overlay"
                  options={strategyOptions}
                  value={strategyId ?? NONE}
                  onChange={(v) => {
                    setStrategyId(v === NONE ? null : v);
                    if (v === NONE) setCompareId(null);
                  }}
                />

                {strategyId && (
                  <Dropdown
                    placeholder="None"
                    options={compareOptions}
                    value={compareId ?? NONE}
                    onChange={(v) => setCompareId(v === NONE ? null : v)}
                  />
                )}

                {strategyId && (
                  <ClearButton
                    onClick={() => {
                      setStrategyId(null);
                      setCompareId(null);
                    }}
                  >
                    Clear
                  </ClearButton>
                )}
              </>
            )}
          </ControlRow>

          {asset ? (
            <>
              {primaryMapping && (
                <Note>
                  <b>{strategyChoices.find((s) => s.id === strategyId)?.name}:</b>{' '}
                  {primaryMapping.studies.length > 0
                    ? primaryMapping.note
                    : `No chart overlay available for this rule — ${primaryMapping.note}`}
                </Note>
              )}
              {compareMapping && (
                <Note>
                  <b>{strategyChoices.find((s) => s.id === compareId)?.name}:</b>{' '}
                  {compareMapping.studies.length > 0
                    ? compareMapping.note
                    : `No chart overlay available for this rule — ${compareMapping.note}`}
                </Note>
              )}

              <TradingViewChart
                symbol={asset.symbol}
                assetClass={asset.assetClass}
                style={ChartStyle.Candles}
                studies={studies}
              />
            </>
          ) : (
            <Empty>No assets to chart yet.</Empty>
          )}
        </Wrap>

        {asset && strategyId && (
          <StatsRow>
            <StrategyStatsCard
              report={assetReport}
              strategyId={strategyId}
              loading={reportLoading}
            />
            {compareId && (
              <StrategyStatsCard
                report={assetReport}
                strategyId={compareId}
                loading={reportLoading}
              />
            )}
          </StatsRow>
        )}
      </MainContainer>
    </Page>
  );
}
