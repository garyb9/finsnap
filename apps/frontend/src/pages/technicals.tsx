import { useMemo, useState } from 'react';
import Link from 'next/link';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { Page } from '../components/Page';
import { MainContainer } from '../components/MainContainer';
import { TechnicalsSkeleton } from '../components/skeletons/TechnicalsSkeleton';
import { useFinSnapData } from '../lib/dataContext';
import { changeColor, fmtMoneyShort, fmtPct, fmtPrice, scoreColor } from '../lib/format';
import { SizeKind, Timeframe } from '../types/enums';
import type { AssetSnap, TimeframeAnalysis } from '../types/finsnap';

/**
 * Live technical readouts for every asset, as one sortable table.
 *
 * These used to be a grid of per-asset cards, which made comparing two assets a
 * scrolling exercise. A table puts the same reading for every asset in a column
 * where the outliers are obvious — which is the only reason to look at twenty
 * of these at once.
 */

/** Longest horizon last, so the eye reads left-to-right from noise to trend. */
const TIMEFRAMES = [Timeframe.H1, Timeframe.H4, Timeframe.D, Timeframe.W, Timeframe.M, Timeframe.Y];

const SIZE_HINT: Record<SizeKind, string> = {
  [SizeKind.MarketCap]: 'Market capitalisation',
  [SizeKind.NetAssets]: 'Assets under management — a fund has no market cap',
};

const COLUMNS = `132px 110px 96px 58px repeat(${TIMEFRAMES.length}, minmax(52px, 1fr)) 92px 104px`;

// ---------- Sorting ----------

enum Dir {
  Asc = 'asc',
  Desc = 'desc',
}

type SortKey = string;
type Sort = { key: SortKey | null; dir: Dir };

const KEY_LABEL = 'label';
const KEY_PRICE = 'price';
const KEY_SIZE = 'size';
const KEY_TSMOM = 'tsmom';
const KEY_EMA = 'ema';
const KEY_BB = 'bb';

function tf(asset: AssetSnap, timeframe: Timeframe): TimeframeAnalysis | undefined {
  return asset.timeframes.find((t) => t.timeframe === timeframe);
}

/**
 * Numeric value for a column, or null when the asset has no reading.
 *
 * Nulls sort last in both directions — an asset with no yearly candles is
 * unknown, not flat, and treating it as zero would park it mid-table.
 */
function valueOf(asset: AssetSnap, key: SortKey): number | null {
  switch (key) {
    case KEY_PRICE:
      return asset.changePct;
    case KEY_SIZE:
      return asset.size?.value ?? null;
    case KEY_TSMOM:
      return asset.tsmom.score;
    case KEY_EMA: {
      const daily = tf(asset, Timeframe.D);
      return daily ? (daily.ema20AboveEma50 ? 1 : 0) : null;
    }
    case KEY_BB:
      return tf(asset, Timeframe.D)?.bollinger.percentB ?? null;
    default:
      return tf(asset, key as Timeframe)?.changePct ?? null;
  }
}

function sortAssets(assets: AssetSnap[], sort: Sort): AssetSnap[] {
  if (!sort.key) return assets;
  const sign = sort.dir === Dir.Asc ? 1 : -1;
  const sorted = [...assets];

  if (sort.key === KEY_LABEL) {
    return sorted.sort((a, b) => sign * a.label.localeCompare(b.label));
  }

  return sorted.sort((a, b) => {
    const left = valueOf(a, sort.key!);
    const right = valueOf(b, sort.key!);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return sign * (left - right);
  });
}

/** Descending → ascending → back to the snapshot's own order. */
function nextSort(current: Sort, clicked: SortKey): Sort {
  if (current.key !== clicked) return { key: clicked, dir: Dir.Desc };
  if (current.dir === Dir.Desc) return { key: clicked, dir: Dir.Asc };
  return { key: null, dir: Dir.Desc };
}

// ---------- Styled ----------

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
  overflow: hidden;
`;

const Head = styled.div`
  padding: 18px 24px 14px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const Title = styled.h1`
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  margin: 0 0 7px;
`;

/** Sends the reader to the thing the sentence is telling them to prefer. */
const InlineLink = styled(Link)`
  color: ${theme.colors.accent};
  text-decoration: none;
  border-bottom: 1px solid ${theme.colors.accent}55;

  &:hover {
    border-bottom-color: ${theme.colors.accent};
  }
`;

const Lede = styled.p`
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.6;
  color: ${theme.colors.label};
`;

const Scroll = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Grid = styled.div`
  min-width: 1020px;
`;

const Row = styled.div<{ $header?: boolean }>`
  display: grid;
  grid-template-columns: ${COLUMNS};
  gap: 16px;
  align-items: center;
  padding: ${({ $header }) => ($header ? '9px 24px' : '12px 24px')};
  border-bottom: 1px solid
    ${({ $header }) => ($header ? theme.colors.borderSlate : theme.colors.slateOverlayDark)};

  ${({ $header }) =>
    $header &&
    `font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase;
     color: ${theme.colors.label}; background: ${theme.colors.slateOverlay};`}

  &:last-child {
    border-bottom: none;
  }
`;

const HeadCell = styled.button<{ $end?: boolean }>`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: ${({ $end }) => ($end ? 'flex-end' : 'flex-start')};
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: nowrap;

  &:hover {
    color: ${theme.colors.accent};
  }
`;

const Active = styled.span`
  color: ${theme.colors.accent};
`;

const Caret = styled.span<{ $visible: boolean }>`
  font-size: 0.55rem;
  line-height: 1;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  color: ${theme.colors.accent};
`;

const Ident = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const Label = styled.span`
  font-size: 0.84rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const SubLabel = styled.span`
  font-size: 0.62rem;
  color: ${theme.colors.label};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PriceCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const Price = styled.span`
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlate};
`;

const Change = styled.span<{ $pct: number }>`
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: ${({ $pct }) => changeColor($pct)};
`;

const Size = styled.span`
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlateLight};
`;

const Score = styled.span<{ $score: number }>`
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${({ $score }) => scoreColor($score)};
`;

const Muted = styled.span`
  font-size: 0.72rem;
  color: ${theme.colors.label};
`;

const Structure = styled.span<{ $bullish: boolean }>`
  font-size: 0.7rem;
  font-weight: 600;
  color: ${({ $bullish }) => ($bullish ? theme.colors.success : theme.colors.danger)};
  white-space: nowrap;
`;

const BandCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

/** Where price sits inside its ±2σ envelope, as a marker on a track. */
const BandTrack = styled.div<{ $pct: number }>`
  height: 3px;
  border-radius: 2px;
  background: ${theme.colors.slateOverlayDark};
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: -2px;
    left: ${({ $pct }) => Math.min(100, Math.max(0, $pct))}%;
    transform: translateX(-50%);
    width: 3px;
    height: 7px;
    border-radius: 1px;
    background: ${theme.colors.accent};
  }
`;

// ---------- Component ----------

export default function TechnicalsPage() {
  const { snap, guide, loading } = useFinSnapData();
  const [sort, setSort] = useState<Sort>({ key: null, dir: Dir.Desc });

  const infoBySymbol = useMemo(
    () => new Map((guide?.assets ?? []).map((a) => [a.symbol, a])),
    [guide]
  );

  const assets = useMemo(
    () => sortAssets(snap ? Object.values(snap.assets) : [], sort),
    [snap, sort]
  );

  if (loading && !snap) {
    return (
      <Page>
        <MainContainer>
          <TechnicalsSkeleton />
        </MainContainer>
      </Page>
    );
  }

  const header = (key: SortKey, label: string, hint?: string, end?: boolean) => {
    const active = sort.key === key;
    const Text = active ? Active : 'span';
    return (
      <HeadCell
        $end={end}
        onClick={() => setSort(nextSort(sort, key))}
        title={hint ? `${hint} — click to sort` : 'Click to sort'}
      >
        <Text>{label}</Text>
        <Caret $visible={active}>{sort.dir === Dir.Asc ? '▲' : '▼'}</Caret>
      </HeadCell>
    );
  };

  return (
    <Page>
      <MainContainer>
        <Wrap>
          <Head>
            <Title>Technicals</Title>
            <Lede>
              Where each asset stands right now, across every timeframe the data supports. This is
              the live read, not the backtest — nothing here has been tested for edge, which is what
              the <InlineLink href="/">daily report</InlineLink> is for.
            </Lede>
          </Head>

          <Scroll>
            <Grid>
              <Row $header>
                {header(KEY_LABEL, 'Asset')}
                {header(KEY_PRICE, 'Price', 'Last price and its daily move')}
                {header(
                  KEY_SIZE,
                  'Size',
                  'Market cap for crypto, assets under management for funds'
                )}
                {header(KEY_TSMOM, 'TSMOM', 'Blended trend-strength score, 0-100')}
                {TIMEFRAMES.map((t) => header(t, t, `Change over the last ${t} candle`))}
                {header(KEY_EMA, 'EMA 20/50', 'Whether the fast average is above the slow one')}
                {header(KEY_BB, '%B', 'Position inside the ±2σ Bollinger envelope')}
              </Row>

              {assets.map((asset) => {
                const daily = tf(asset, Timeframe.D);
                const info = infoBySymbol.get(asset.symbol);

                return (
                  <Row key={asset.symbol}>
                    <Ident>
                      <Label>{asset.label}</Label>
                      {info && <SubLabel title={info.name}>{info.shortName}</SubLabel>}
                    </Ident>

                    <PriceCell>
                      <Price>${fmtPrice(asset.currentPrice)}</Price>
                      <Change $pct={asset.changePct}>{fmtPct(asset.changePct, 2)}</Change>
                    </PriceCell>

                    <div>
                      {asset.size ? (
                        <Size title={SIZE_HINT[asset.size.kind]}>
                          {fmtMoneyShort(asset.size.value)}
                        </Size>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </div>

                    <div>
                      <Score $score={asset.tsmom.score} title={asset.tsmom.label}>
                        {asset.tsmom.score}
                      </Score>
                    </div>

                    {TIMEFRAMES.map((t) => {
                      const analysis = tf(asset, t);
                      return (
                        <div key={t}>
                          {analysis ? (
                            <Change $pct={analysis.changePct}>
                              {fmtPct(analysis.changePct, 1)}
                            </Change>
                          ) : (
                            <Muted>—</Muted>
                          )}
                        </div>
                      );
                    })}

                    <div>
                      {daily ? (
                        <Structure
                          $bullish={daily.ema20AboveEma50}
                          title={`EMA20 $${fmtPrice(daily.ema20)} · EMA50 $${fmtPrice(daily.ema50)}`}
                        >
                          {daily.ema20AboveEma50 ? '20 › 50' : '20 ‹ 50'}
                        </Structure>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </div>

                    <div>
                      {daily ? (
                        <BandCell>
                          <Muted
                            title={
                              `±2σ: $${fmtPrice(daily.bollinger.std2.lower)} – ` +
                              `$${fmtPrice(daily.bollinger.std2.upper)} · ` +
                              `bandwidth ${daily.bollinger.bandwidth.toFixed(1)}%`
                            }
                          >
                            {(daily.bollinger.percentB * 100).toFixed(0)}%
                          </Muted>
                          <BandTrack $pct={daily.bollinger.percentB * 100} />
                        </BandCell>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </div>
                  </Row>
                );
              })}
            </Grid>
          </Scroll>
        </Wrap>
      </MainContainer>
    </Page>
  );
}
