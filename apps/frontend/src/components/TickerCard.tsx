import Link from 'next/link';
import styled from 'styled-components';
import { Pin } from 'lucide-react';
import { theme } from '../styles/theme';
import { changeColor, fmtPct, fmtPrice, scoreColor } from '../lib/format';
import { Sparkline } from './Sparkline';
import { usePinnedTickers } from '../lib/usePinnedTickers';
import type { AssetSnap } from '../types/finsnap';

const Wrap = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlate};
  background: ${theme.colors.slateOverlay};
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover {
    border-color: ${theme.colors.accent};
    background: ${theme.colors.slateOverlayStrong};
  }
`;

/** Stretched-link: makes the whole card navigable while the pin button,
    rendered after and given its own stacking context, stays independently clickable. */
const CardLink = styled(Link)`
  position: absolute;
  inset: 0;
  border-radius: inherit;
`;

const Head = styled.div`
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
`;

const SymbolGroup = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
`;

const Symbol = styled.span`
  font-size: 0.85rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const SubSymbol = styled.span`
  font-size: 0.64rem;
  color: ${theme.colors.label};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PinButton = styled.button<{ $pinned: boolean }>`
  all: unset;
  position: relative;
  z-index: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: ${theme.radius.sm};
  color: ${({ $pinned }) => ($pinned ? theme.colors.accent : theme.colors.label)};

  &:hover {
    color: ${theme.colors.accent};
    background: ${theme.colors.accentHover};
  }

  svg {
    width: 13px;
    height: 13px;
    fill: ${({ $pinned }) => ($pinned ? 'currentColor' : 'none')};
  }
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

const Price = styled.span`
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${theme.colors.textSlate};
`;

const Change = styled.span<{ $pct: number }>`
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  color: ${({ $pct }) => changeColor($pct)};
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const TsmomBadge = styled.span<{ $score: number }>`
  font-size: 0.64rem;
  font-weight: 600;
  white-space: nowrap;
  color: ${({ $score }) => scoreColor($score)};
`;

export interface TickerCardProps {
  asset: AssetSnap;
}

export function TickerCard({ asset }: TickerCardProps) {
  const { isPinned, toggle } = usePinnedTickers();
  const pinned = isPinned(asset.symbol);

  return (
    <Wrap>
      <CardLink
        href={`/chart?ticker=${encodeURIComponent(asset.symbol)}`}
        aria-label={`View ${asset.label} on the chart page`}
      />
      <Head>
        <SymbolGroup>
          <Symbol>{asset.label}</Symbol>
          {asset.symbol !== asset.label && <SubSymbol>{asset.symbol}</SubSymbol>}
        </SymbolGroup>
        <PinButton
          type="button"
          $pinned={pinned}
          onClick={() => toggle(asset.symbol)}
          aria-label={pinned ? `Unpin ${asset.label}` : `Pin ${asset.label}`}
          title={pinned ? 'Unpin' : 'Pin to sidebar'}
        >
          <Pin aria-hidden />
        </PinButton>
      </Head>
      <PriceRow>
        <Price>${fmtPrice(asset.currentPrice)}</Price>
        <Change $pct={asset.changePct}>{fmtPct(asset.changePct)}</Change>
      </PriceRow>
      <Foot>
        <Sparkline timeframes={asset.timeframes} />
        <TsmomBadge $score={asset.tsmom.score}>TSMOM {asset.tsmom.score}</TsmomBadge>
      </Foot>
    </Wrap>
  );
}
