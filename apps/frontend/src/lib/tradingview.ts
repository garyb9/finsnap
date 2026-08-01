import { AssetClass } from '../types/enums';

/**
 * TradingView's symbol for a FinSnap ticker.
 *
 * FinSnap symbols follow Yahoo Finance conventions (BTC-USD, EURUSD=X, ^GSPC);
 * TradingView namespaces everything by exchange instead. Equities and ETFs
 * still resolve fine as a bare ticker — TradingView's own search picks the
 * primary listing — so only crypto and FX need translating. Crypto is pinned
 * to Coinbase, which lists every pair this project tracks against USD.
 */
export function tradingViewSymbol(symbol: string, assetClass: AssetClass): string {
  if (assetClass === AssetClass.Crypto) {
    return `COINBASE:${symbol.replace(/-USD$/, '')}USD`;
  }
  if (symbol.endsWith('=X')) return symbol.slice(0, -2);
  if (symbol.startsWith('^')) return symbol.slice(1);
  return symbol;
}
