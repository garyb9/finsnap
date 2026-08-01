import Link from 'next/link';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import { pulse } from '../styles/keyframes';
import { theme } from '../styles/theme';
import { relativeTime } from '../lib/format';
import { TickerSearch } from './TickerSearch';

/**
 * The bar across the top of every page: identity on the left, section tabs in
 * the middle, live data freshness on the right.
 *
 * It absorbed the standalone status pill that used to sit under the title.
 * Freshness is ambient information — you want it visible without it taking a
 * row of its own above the thing you came to read.
 */

const Bar = styled.header`
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  background: linear-gradient(180deg, rgba(2, 18, 15, 0.94) 0%, rgba(2, 18, 15, 0.86) 100%);
  backdrop-filter: blur(14px) saturate(140%);
`;

const Inner = styled.div`
  max-width: ${theme.maxWidth.dashboard};
  margin: 0 auto;
  height: ${theme.headerHeight};
  padding: 0 22px 0 22px;
  display: flex;
  align-items: center;
  gap: 22px;

  /* Clears the docked sync control, which aligns to this same container, with
     a little breathing room so the status readout is adjacent, not touching. */
  padding-right: 126px;

  @media (max-width: ${theme.breakpoints.md}) {
    padding: 0 10px;
    padding-right: 104px;
    gap: 12px;
  }
`;

const Wordmark = styled(Link)`
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  font-family: ${theme.fonts.heading};
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${theme.colors.text};
  text-decoration: none;
  white-space: nowrap;
  flex: none;

  span {
    background: linear-gradient(92deg, ${theme.colors.accent} 0%, ${theme.colors.greenMuted} 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

/**
 * Tabs sit in a recessed track so the active one reads as selected rather than
 * merely coloured — the distinction matters at this size.
 */
const Tabs = styled.nav`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: ${theme.radius.pill};
  background: ${theme.colors.slateOverlayDark};
  border: 1px solid ${theme.colors.borderSlate};
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Tab = styled(Link)<{ $active: boolean }>`
  font-size: 0.71rem;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  padding: 5px 13px;
  border-radius: ${theme.radius.pill};
  transition:
    color 0.15s ease,
    background 0.15s ease;
  color: ${({ $active }) => ($active ? theme.colors.background : theme.colors.textMuted)};
  background: ${({ $active }) => ($active ? theme.colors.accent : 'transparent')};

  &:hover {
    color: ${({ $active }) => ($active ? theme.colors.background : theme.colors.text)};
    background: ${({ $active }) => ($active ? theme.colors.accent : theme.colors.accentHover)};
  }
`;

const Status = styled.div<{ $stale: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ $stale }) => ($stale ? theme.colors.warning : theme.colors.textMuted)};

  /* Below the breakpoint the sync control already signals freshness; this is
     the first thing to go rather than letting the tabs be squeezed. */
  @media (max-width: ${theme.breakpoints.md}) {
    display: none;
  }
`;

const StatusDot = styled.span<{ $stale: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: ${({ $stale }) => ($stale ? theme.colors.warning : theme.colors.success)};
  animation: ${pulse} 2s ease-in-out infinite;
`;

const Dim = styled.span`
  color: ${theme.colors.label};
`;

const TABS = [
  { href: '/', label: 'Dashboard' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/chart', label: 'Chart' },
  { href: '/options', label: 'Options' },
  { href: '/technicals', label: 'Technicals' },
  { href: '/correlation', label: 'Correlation' },
  { href: '/guide', label: 'Guide' },
];

export interface SiteHeaderProps {
  /** ISO timestamp of the latest snapshot, when one has loaded */
  snapAt?: string | null;
  stale?: boolean;
}

export function SiteHeader({ snapAt, stale = false }: SiteHeaderProps) {
  const { pathname } = useRouter();

  return (
    <Bar>
      <Inner>
        <Wordmark href="/">
          Fin<span>Snap</span>
        </Wordmark>

        <Tabs>
          {TABS.map((tab) => (
            <Tab key={tab.href} href={tab.href} $active={pathname === tab.href}>
              {tab.label}
            </Tab>
          ))}
        </Tabs>

        <TickerSearch />

        {snapAt && (
          <Status $stale={stale}>
            <StatusDot $stale={stale} />
            {stale ? 'Stale' : 'Live'}
            <Dim>·</Dim>
            <Dim>{relativeTime(snapAt)}</Dim>
          </Status>
        )}
      </Inner>
    </Bar>
  );
}
