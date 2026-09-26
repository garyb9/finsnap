import Link from 'next/link';
import styled from 'styled-components';
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { pulse } from '../styles/keyframes';
import { theme } from '../styles/theme';
import { relativeTime } from '../lib/format';
import { useSidebarState } from '../lib/useSidebarState';
import { NavList } from './NavList';
import { SyncPanel } from './SyncPanel';

const Rail = styled.aside<{ $collapsed: boolean }>`
  display: none;

  @media (min-width: ${theme.breakpoints.md}) {
    display: flex;
  }

  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: ${theme.zIndex.sidebar};
  width: ${({ $collapsed }) => ($collapsed ? theme.sidebarWidthCollapsed : theme.sidebarWidth)};
  flex-direction: column;
  border-right: 1px solid ${theme.colors.borderSlate};
  background: linear-gradient(180deg, rgba(2, 18, 15, 0.94) 0%, rgba(2, 18, 15, 0.86) 100%);
  backdrop-filter: blur(14px) saturate(140%);
  transition: width 0.18s ease;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Head = styled.div<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  gap: 8px;
  height: 52px;
  flex: none;
  padding: 0 ${({ $collapsed }) => ($collapsed ? '0' : '14px')};
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const Wordmark = styled(Link)`
  font-family: ${theme.fonts.heading};
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${theme.colors.text};
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;

  span {
    background: linear-gradient(92deg, ${theme.colors.accent} 0%, ${theme.colors.greenMuted} 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const CollapseButton = styled.button`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: ${theme.radius.sm};
  color: ${theme.colors.label};

  &:hover {
    color: ${theme.colors.accent};
    background: ${theme.colors.accentHover};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const SearchTrigger = styled.button<{ $collapsed: boolean }>`
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 8px 0;
  padding: 8px ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  border-radius: ${theme.radius.md};
  border: 1px solid ${theme.colors.borderSlate};
  color: ${theme.colors.textMuted};
  font-size: 0.76rem;

  &:hover {
    color: ${theme.colors.text};
    border-color: ${theme.colors.accent};
  }

  svg {
    width: 15px;
    height: 15px;
    flex: none;
  }
`;

const SearchLabel = styled.span`
  flex: 1;
  text-align: left;
`;

const SearchKbd = styled.kbd`
  font-size: 0.6rem;
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.label};
  border: 1px solid ${theme.colors.borderSlate};
  border-radius: 4px;
  padding: 1px 5px;
`;

const Spacer = styled.div`
  flex: 1;
`;

const Footer = styled.div<{ $collapsed: boolean; $stale: boolean }>`
  display: flex;
  flex-direction: ${({ $collapsed }) => ($collapsed ? 'column' : 'row')};
  align-items: center;
  justify-content: center;
  gap: ${({ $collapsed }) => ($collapsed ? '8px' : '7px')};
  padding: 12px ${({ $collapsed }) => ($collapsed ? '0' : '14px')};
  border-top: 1px solid ${theme.colors.borderSlate};
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ $stale }) => ($stale ? theme.colors.warning : theme.colors.textMuted)};
`;

const StatusText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* Expanded: pushed to the far end of the row, status on the left, sync on
   the right. Collapsed: no room for that, just stacks under the dot. */
const SyncSlot = styled.div<{ $collapsed: boolean }>`
  margin-left: ${({ $collapsed }) => ($collapsed ? '0' : 'auto')};
  flex: none;
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

export interface SidebarProps {
  snapAt?: string | null;
  stale?: boolean;
  onOpenSearch: () => void;
}

export function Sidebar({ snapAt, stale = false, onOpenSearch }: SidebarProps) {
  const { collapsed, canToggle, toggleCollapsed } = useSidebarState();

  return (
    <Rail $collapsed={collapsed}>
      <Head $collapsed={collapsed}>
        {!collapsed && (
          <Wordmark href="/">
            Fin<span>Snap</span>
          </Wordmark>
        )}
        {canToggle && (
          <CollapseButton
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          </CollapseButton>
        )}
      </Head>

      <SearchTrigger
        type="button"
        $collapsed={collapsed}
        onClick={onOpenSearch}
        title={collapsed ? 'Search (⌘K)' : undefined}
      >
        <Search aria-hidden />
        {!collapsed && (
          <>
            <SearchLabel>Search</SearchLabel>
            <SearchKbd>⌘K</SearchKbd>
          </>
        )}
      </SearchTrigger>

      <NavList collapsed={collapsed} />

      <Spacer />

      {snapAt && (
        <Footer $collapsed={collapsed} $stale={stale}>
          <StatusText title={stale ? 'Stale' : 'Live'}>
            <StatusDot $stale={stale} />
            {!collapsed && (
              <>
                {stale ? 'Stale' : 'Live'}
                <Dim>·</Dim>
                <Dim>{relativeTime(snapAt)}</Dim>
              </>
            )}
          </StatusText>
          <SyncSlot $collapsed={collapsed}>
            <SyncPanel compact />
          </SyncSlot>
        </Footer>
      )}
    </Rail>
  );
}
