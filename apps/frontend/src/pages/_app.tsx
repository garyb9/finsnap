import { useState } from 'react';
import type { AppProps } from 'next/app';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from 'styled-components';
import { GlobalStyles } from '../styles/GlobalStyles';
import { Sidebar } from '../components/Sidebar';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileNavDrawer } from '../components/MobileNavDrawer';
import { SyncPanel } from '../components/SyncPanel';
import { CommandPalette } from '../components/CommandPalette';
import { ToastProvider } from '../components/Toast';
import { DataProvider, useFinSnapData } from '../lib/dataContext';
import { useCommandPalette } from '../lib/useCommandPalette';
import { useSyncToasts } from '../lib/useSyncToasts';
import { PinnedTickersProvider } from '../lib/usePinnedTickers';
import { theme } from '../styles/theme';

/** Split out so it can read the providers it is rendered inside. */
function Chrome({ children }: { children: React.ReactNode }) {
  const { snap, stale } = useFinSnapData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  useSyncToasts();

  return (
    <>
      <Sidebar
        snapAt={snap?.timestamp ?? null}
        stale={stale}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <MobileTopBar
        hasSnap={!!snap}
        stale={stale}
        onMenuClick={() => setDrawerOpen(true)}
        onSearchClick={() => setPaletteOpen(true)}
      />
      <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      <SyncPanel />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {children}
    </>
  );
}

/**
 * The header, the sync control and the data itself are app-level rather than
 * page-level: all three belong on every tab, and hoisting the fetching above
 * the router means switching tabs does not refetch what the app already has.
 */
export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <DataProvider>
        <ToastProvider>
          <PinnedTickersProvider>
            <Chrome>
              <Component {...pageProps} />
            </Chrome>
          </PinnedTickersProvider>
        </ToastProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
