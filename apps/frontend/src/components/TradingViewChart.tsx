import { useMemo } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/theme';
import { tradingViewSymbol } from '../lib/tradingview';
import { AssetClass } from '../types/enums';

/**
 * Live TradingView chart for one ticker, embedded via their public
 * `advanced-chart` widget — no API key, no bundled JS, just an iframe whose
 * `src` carries the config as a URL-encoded JSON fragment.
 *
 * Style codes are TradingView's own: 1 = candles, 2 = line. Chosen by the
 * caller (a `ChartStyle` toggle usually sits in the same control row as the
 * rest of the page's pickers) rather than owned here, so it isn't stranded in
 * its own row.
 */

export enum ChartStyle {
  Candles = '1',
  Line = '2',
}

const FrameWrap = styled.div`
  padding: 8px 22px 20px;
`;

const Frame = styled.iframe`
  width: 100%;
  height: 680px;
  border: none;
  display: block;
  border-radius: ${theme.radius.md};
`;

interface Props {
  symbol: string;
  assetClass: AssetClass;
  style: ChartStyle;
  /** TradingView built-in study ids to overlay — e.g. from `studiesFor()`/`mergeStudies()`. */
  studies?: string[];
}

export function TradingViewChart({ symbol, assetClass, style, studies = [] }: Props) {
  const tvSymbol = useMemo(() => tradingViewSymbol(symbol, assetClass), [symbol, assetClass]);

  const src = useMemo(() => {
    const config = {
      symbol: tvSymbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style,
      locale: 'en',
      studies,
      backgroundColor: theme.colors.background,
      gridColor: theme.colors.borderSlate,
      enable_publishing: false,
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_legend: false,
      support_host: 'https://www.tradingview.com',
    };
    return `https://s.tradingview.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(
      JSON.stringify(config)
    )}`;
  }, [tvSymbol, style, studies]);

  return (
    <FrameWrap>
      {/* Keyed on the full src: the widget's config lives in the URL fragment, and
          since the path/query are otherwise identical, setting `src` on a
          persisting iframe is a same-document fragment navigation the widget
          never sees — only a remount forces the new symbol to actually load. */}
      <Frame key={src} src={src} title={`TradingView chart for ${symbol}`} loading="lazy" />
    </FrameWrap>
  );
}
