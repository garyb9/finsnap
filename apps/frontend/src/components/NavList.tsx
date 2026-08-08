import Link from 'next/link';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { NAV_ITEMS } from '../lib/navIcons';
import { changeColor, fmtPct } from '../lib/format';
import { useFinSnapData } from '../lib/dataContext';
import { usePinnedTickers } from '../lib/usePinnedTickers';

const List = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
`;

const Item = styled(Link)<{ $active: boolean; $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px ${({ $collapsed }) => ($collapsed ? '0' : '12px')};
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  border-radius: ${theme.radius.md};
  font-size: 0.78rem;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  letter-spacing: 0.02em;
  text-decoration: none;
  color: ${({ $active }) => ($active ? theme.colors.background : theme.colors.textMuted)};
  background: ${({ $active }) => ($active ? theme.colors.accent : 'transparent')};
  white-space: nowrap;
  overflow: hidden;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  &:hover {
    color: ${({ $active }) => ($active ? theme.colors.background : theme.colors.text)};
    background: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.accentHover)};
  }

  svg {
    flex: none;
    width: 17px;
    height: 17px;
  }
`;

const Label = styled.span<{ $collapsed: boolean }>`
  display: ${({ $collapsed }) => ($collapsed ? 'none' : 'inline')};
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PinnedSection = styled.div`
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid ${theme.colors.borderSlate};
`;

const PinnedLabel = styled.div<{ $collapsed: boolean }>`
  display: ${({ $collapsed }) => ($collapsed ? 'none' : 'block')};
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${theme.colors.label};
  padding: 4px 12px 6px;
`;

const PinnedRow = styled(Link)<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px ${({ $collapsed }) => ($collapsed ? '0' : '12px')};
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  border-radius: ${theme.radius.md};
  text-decoration: none;
  font-size: 0.74rem;
  white-space: nowrap;
  overflow: hidden;

  &:hover {
    background: ${theme.colors.accentHover};
  }
`;

const PinnedDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex: none;
  background: ${theme.colors.label};
`;

const PinnedSymbol = styled.span<{ $tracked: boolean }>`
  font-weight: 700;
  color: ${({ $tracked }) => ($tracked ? theme.colors.textSlate : theme.colors.label)};
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PinnedChange = styled.span<{ $pct: number }>`
  margin-left: auto;
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 0.68rem;
  color: ${({ $pct }) => changeColor($pct)};
`;

export interface NavListProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

export function NavList({ collapsed, onNavigate }: NavListProps) {
  const { pathname } = useRouter();
  const { snap } = useFinSnapData();
  const { pinned } = usePinnedTickers();

  return (
    <>
      <List aria-label="Primary">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Item
            key={href}
            href={href}
            $active={pathname === href}
            $collapsed={collapsed}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
          >
            <Icon aria-hidden strokeWidth={2} />
            <Label $collapsed={collapsed}>{label}</Label>
          </Item>
        ))}
      </List>

      {pinned.length > 0 && (
        <PinnedSection>
          <PinnedLabel $collapsed={collapsed}>Pinned</PinnedLabel>
          <List aria-label="Pinned tickers">
            {pinned.map((symbol) => {
              // A pin can outlive the 24h window a searched ticker stays tracked for.
              const asset = snap
                ? Object.values(snap.assets).find((a) => a.symbol === symbol)
                : undefined;
              return (
                <PinnedRow
                  key={symbol}
                  href={`/chart?ticker=${encodeURIComponent(symbol)}`}
                  $collapsed={collapsed}
                  onClick={onNavigate}
                  title={collapsed ? symbol : undefined}
                >
                  <PinnedDot aria-hidden />
                  {!collapsed && (
                    <>
                      <PinnedSymbol $tracked={!!asset}>{asset?.label ?? symbol}</PinnedSymbol>
                      {asset && (
                        <PinnedChange $pct={asset.changePct}>
                          {fmtPct(asset.changePct)}
                        </PinnedChange>
                      )}
                    </>
                  )}
                </PinnedRow>
              );
            })}
          </List>
        </PinnedSection>
      )}
    </>
  );
}
