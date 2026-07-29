import type { AppProps } from 'next/app';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from 'styled-components';
import { GlobalStyles } from '../styles/GlobalStyles';
import { SiteHeader } from '../components/SiteHeader';
import { SyncPanel } from '../components/SyncPanel';
import { DataProvider, useFinSnapData } from '../lib/dataContext';
import { theme } from '../styles/theme';

/** Split out so it can read the provider it is rendered inside. */
function Chrome({ children }: { children: React.ReactNode }) {
  const { snap, stale } = useFinSnapData();

  return (
    <>
      <SiteHeader snapAt={snap?.timestamp ?? null} stale={stale} />
      <SyncPanel />
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
        <Chrome>
          <Component {...pageProps} />
        </Chrome>
      </DataProvider>
    </ThemeProvider>
  );
}
