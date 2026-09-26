import Link from 'next/link';
import styled from 'styled-components';
import { Menu, Search } from 'lucide-react';
import { pulse } from '../styles/keyframes';
import { theme } from '../styles/theme';

const Bar = styled.header`
  display: flex;

  @media (min-width: ${theme.breakpoints.md}) {
    display: none;
  }

  width: 100%;
  position: sticky;
  top: 0;
  z-index: ${theme.zIndex.sidebar};
  align-items: center;
  gap: 10px;
  height: ${theme.headerHeight};
  padding: 0 10px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
  background: linear-gradient(180deg, rgba(2, 18, 15, 0.94) 0%, rgba(2, 18, 15, 0.86) 100%);
  backdrop-filter: blur(14px) saturate(140%);
`;

const IconButton = styled.button`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: ${theme.radius.sm};
  color: ${theme.colors.textMuted};

  &:hover {
    color: ${theme.colors.accent};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const Wordmark = styled(Link)`
  font-family: ${theme.fonts.heading};
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${theme.colors.text};
  text-decoration: none;
  flex: 1;

  span {
    background: linear-gradient(92deg, ${theme.colors.accent} 0%, ${theme.colors.greenMuted} 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
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

export interface MobileTopBarProps {
  stale?: boolean;
  hasSnap?: boolean;
  onMenuClick: () => void;
  onSearchClick: () => void;
}

export function MobileTopBar({
  stale = false,
  hasSnap = false,
  onMenuClick,
  onSearchClick,
}: MobileTopBarProps) {
  return (
    <Bar>
      <IconButton type="button" onClick={onMenuClick} aria-label="Open navigation">
        <Menu aria-hidden />
      </IconButton>
      <Wordmark href="/">
        Fin<span>Snap</span>
      </Wordmark>
      {hasSnap && <StatusDot $stale={stale} aria-hidden />}
      <IconButton type="button" onClick={onSearchClick} aria-label="Search">
        <Search aria-hidden />
      </IconButton>
    </Bar>
  );
}
