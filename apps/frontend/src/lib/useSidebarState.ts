import { useEffect, useLayoutEffect, useState } from 'react';
import { theme } from '../styles/theme';
import { useLocalStorage } from './useLocalStorage';

export type SidebarTier = 'mobile' | 'tablet' | 'desktop';

const MD_PX = parseInt(theme.breakpoints.md, 10);
const LG_PX = parseInt(theme.breakpoints.lg, 10);

function tierOf(width: number): SidebarTier {
  if (width < MD_PX) return 'mobile';
  if (width < LG_PX) return 'tablet';
  return 'desktop';
}

// Avoids a "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Below `md`: no rail (mobile top bar + drawer instead). `md`–`lg`: rail
 * forced to icon-only, no user override. `>= lg`: user-toggleable, persisted.
 *
 * Sets `--sidebar-width` on the document root so `Page.tsx`/`SyncPanel.tsx`
 * can read it without a shared context.
 */
export function useSidebarState() {
  const [storedCollapsed, setStoredCollapsed] = useLocalStorage('finsnap:sidebar-collapsed', false);
  const [tier, setTier] = useState<SidebarTier>('desktop');

  useEffect(() => {
    const update = () => setTier(tierOf(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const collapsed = tier === 'mobile' ? false : tier === 'tablet' ? true : storedCollapsed;
  const canToggle = tier === 'desktop';

  useIsoLayoutEffect(() => {
    const width =
      tier === 'mobile' ? '0px' : collapsed ? theme.sidebarWidthCollapsed : theme.sidebarWidth;
    document.documentElement.style.setProperty('--sidebar-width', width);
  }, [tier, collapsed]);

  return {
    tier,
    collapsed,
    canToggle,
    toggleCollapsed: () => canToggle && setStoredCollapsed((v) => !v),
  };
}
