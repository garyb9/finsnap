import { Fragment, useMemo, useState } from 'react';
import styled from 'styled-components';
import { CardTitle } from './Card';
import { CATEGORY_LABEL } from '../lib/format';
import { ALL_TICKERS, summarizeChain } from '../lib/options';
import { theme } from '../styles/theme';
import { AssetCategory, OptionsSide } from '../types/enums';
import type { Guide, GuideAsset } from '../types/guide';
import type { AssetSnap } from '../types/finsnap';

/** Display order for the rail's category groups — independent of the order
 * symbols happen to be configured in (see `groupByCategory`). */
const CATEGORY_ORDER: AssetCategory[] = [
  AssetCategory.EquityIndex,
  AssetCategory.Commodity,
  AssetCategory.Sector,
  AssetCategory.Industry,
  AssetCategory.Currency,
  AssetCategory.Bond,
  AssetCategory.Volatility,
  AssetCategory.Crypto,
  AssetCategory.Stock,
];

/**
 * Ticker picker for the options page. No card chrome of its own — it's the
 * left column of `OptionsPanel`'s single shared card rather than a floating
 * box beside it, separated from the detail column by that panel's own
 * divider. A vertical list scales with list length instead of card width,
 * which is what a wrapped or scrolling row ran out of once the universe
 * passed ~20 symbols.
 */
const Wrap = styled.section`
  flex: none;
  width: 136px;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const FilterInput = styled.input`
  font-family: inherit;
  font-size: 0.7rem;
  color: ${theme.colors.textSlate};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: ${theme.radius.sm};
  padding: 5px 8px;
  margin-top: 12px;
  width: 100%;
  outline: none;

  &::placeholder {
    color: ${theme.colors.label};
  }

  &:focus {
    border-color: ${theme.colors.accent};
  }
`;

/**
 * Fills whatever height `Wrap` ends up with — which, now that the row beside
 * it stretches both cards to the taller one, is the detail card's own height
 * rather than a fixed cap. Only scrolls if the list still doesn't fit.
 */
const List = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 6px;
  padding-right: 6px;
`;

/**
 * One eyebrow label per category, pinned to the top of the scroll area while
 * its group is in view — with ~25 tickers across seven-odd categories,
 * knowing which group you're looking at matters more than seeing the label
 * scroll past once. Doubles as the collapse toggle for its group.
 */
const GroupLabel = styled.button`
  all: unset;
  cursor: pointer;
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  padding: 6px 2px 3px;

  &:first-of-type {
    padding-top: 0;
  }

  &:hover {
    color: ${theme.colors.textMuted};
  }
`;

const Chevron = styled.span<{ $collapsed: boolean }>`
  flex: none;
  font-size: 0.55rem;
  transform: rotate(${({ $collapsed }) => ($collapsed ? '-90deg' : '0deg')});
  transition: transform 0.15s;
`;

const Item = styled.button<{ $active: boolean }>`
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 6px;
  border-radius: ${theme.radius.sm};
  background: ${({ $active }) => ($active ? theme.colors.accentSoft : 'transparent')};
  transition: background 0.15s;

  &:hover {
    background: ${({ $active }) => ($active ? theme.colors.accentSoft : theme.colors.accentHover)};
  }
`;

const Symbol = styled.span<{ $active: boolean }>`
  flex: none;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: ${({ $active }) => ($active ? theme.colors.textSlate : theme.colors.label)};
`;

/** Plain-English handle from the field guide — 'QQQ' next to 'Nasdaq 100'. */
const SubLabel = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.6rem;
  color: ${theme.colors.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/**
 * Today's dominant wall for that chain, reduced to a color — a real circle
 * rather than a text glyph, since a bullet character's own vertical metrics
 * never quite line up with the symbol's baseline next to it.
 */
const Dot = styled.span<{ $side: OptionsSide }>`
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${({ $side }) =>
    $side === OptionsSide.Calls ? theme.colors.success : theme.colors.danger};
`;

const NoMatches = styled.div`
  font-size: 0.68rem;
  color: ${theme.colors.label};
  padding: 6px 6px 0;
`;

/** Today's dominant wall for one ticker's whole chain, reduced to a color. */
function wallSide(asset: AssetSnap): OptionsSide.Calls | OptionsSide.Puts | null {
  const heaviest = summarizeChain(asset.options?.expirations ?? []).heaviest;
  return heaviest?.side ?? null;
}

interface Props {
  /** Already filtered to assets that carry a usable chain. */
  assets: AssetSnap[];
  guide: Guide | null;
  active: string;
  onSelect: (symbol: string) => void;
}

interface Group {
  key: string;
  label: string;
  assets: AssetSnap[];
}

/**
 * True grouping by category rather than run-detection over the existing
 * order — the universe is *mostly* configured in category order, but not
 * strictly (VNQ sits next to XLRE for `.env` readability despite being
 * `industry`, not `sector`), so detecting "the category changed since the
 * last ticker" produced the same category heading twice with a different
 * one wedged in between. Grouping by category directly is correct regardless
 * of how contiguous the underlying order happens to be. Searched tickers get
 * their own trailing group, keyed separately from any real category.
 */
function groupByCategory(assets: AssetSnap[], infoBySymbol: Map<string, GuideAsset>): Group[] {
  const groups = new Map<string, Group>();
  const searched: AssetSnap[] = [];

  for (const a of assets) {
    if (a.searched) {
      searched.push(a);
      continue;
    }
    const category = infoBySymbol.get(a.symbol)?.category;
    if (category === undefined) continue;
    const existing = groups.get(category);
    if (existing) existing.assets.push(a);
    else groups.set(category, { key: category, label: CATEGORY_LABEL[category], assets: [a] });
  }

  const ordered = CATEGORY_ORDER.map((category) => groups.get(category)).filter(
    (group): group is Group => group !== undefined
  );
  if (searched.length > 0) ordered.push({ key: 'searched', label: 'Searched', assets: searched });
  return ordered;
}

export function OptionsTickerRail({ assets, guide, active, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const infoBySymbol = useMemo(
    () => new Map((guide?.assets ?? []).map((a) => [a.symbol, a])),
    [guide]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      const info = infoBySymbol.get(a.symbol);
      return (
        a.label.toLowerCase().includes(q) ||
        info?.shortName.toLowerCase().includes(q) ||
        info?.name.toLowerCase().includes(q)
      );
    });
  }, [assets, infoBySymbol, query]);

  const groups = useMemo(() => groupByCategory(filtered, infoBySymbol), [filtered, infoBySymbol]);

  function toggle(key: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (assets.length === 0) return null;

  return (
    <Wrap>
      <CardTitle style={{ margin: 0 }}>Tickers</CardTitle>
      <FilterInput
        placeholder="Filter…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter tickers"
      />

      <Item $active={active === ALL_TICKERS} onClick={() => onSelect(ALL_TICKERS)}>
        <Symbol $active={active === ALL_TICKERS}>All</Symbol>
      </Item>

      <List>
        {groups.length === 0 && <NoMatches>No matches</NoMatches>}
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <Fragment key={group.key}>
              <GroupLabel onClick={() => toggle(group.key)} aria-expanded={!isCollapsed}>
                {group.label}
                <Chevron $collapsed={isCollapsed}>▾</Chevron>
              </GroupLabel>
              {!isCollapsed &&
                group.assets.map((a) => {
                  const isActive = active === a.symbol;
                  const info = infoBySymbol.get(a.symbol);
                  const side = wallSide(a);
                  return (
                    <Item
                      key={a.symbol}
                      $active={isActive}
                      onClick={() => onSelect(a.symbol)}
                      title={info?.name}
                    >
                      <Symbol $active={isActive}>{a.label}</Symbol>
                      {info && <SubLabel>({info.shortName})</SubLabel>}
                      {side && <Dot $side={side} />}
                    </Item>
                  );
                })}
            </Fragment>
          );
        })}
      </List>
    </Wrap>
  );
}
