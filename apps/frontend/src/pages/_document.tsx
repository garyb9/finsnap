import Document, {
  Html,
  Head,
  Main,
  NextScript,
  type DocumentContext,
  type DocumentInitialProps,
} from 'next/document';
import { ServerStyleSheet } from 'styled-components';
import type { AppType, AppProps } from 'next/app';
import React from 'react';

const DESCRIPTION =
  'Pre-market backtest report for BTC and equities — every strategy, every window, one verdict per asset.';

/**
 * Collects styled-components styles during SSR so the first paint arrives
 * already styled. Without this the dashboard flashes unstyled on load.
 */
export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps> {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: (App: AppType) => (props: AppProps) =>
            sheet.collectStyles(React.createElement(App, props)),
        });

      const initialProps = await Document.getInitialProps(ctx);
      return {
        ...initialProps,
        styles: React.Children.toArray([initialProps.styles, sheet.getStyleElement()]),
      };
    } finally {
      sheet.seal();
    }
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
            rel="stylesheet"
          />
          <meta name="description" content={DESCRIPTION} />
          <meta name="theme-color" content="#080c14" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
