import { createGlobalStyle } from 'styled-components';
import { theme } from './theme';

export const GlobalStyles = createGlobalStyle`
  :root {
    color-scheme: dark;
    --bg: ${theme.colors.background};
    --bg-elevated: ${theme.colors.backgroundElevated};
    --border: ${theme.colors.border};
    --accent: ${theme.colors.accent};
    --accent-soft: ${theme.colors.accentSoft};
    --text: ${theme.colors.text};
    --muted: ${theme.colors.textSecondary};
    --danger: ${theme.colors.danger};
    --radius: ${theme.radius.md};
    --shadow-soft: ${theme.colors.shadowSoft};
    --font-sans: ${theme.fonts.body};
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    font-family: ${theme.fonts.body};
    background: radial-gradient(circle at top, ${theme.colors.backgroundGradientStart} 0, ${theme.colors.backgroundGradientMid} 50%, ${theme.colors.backgroundGradientEnd} 100%) fixed;
    background-color: ${theme.colors.backgroundGradientEnd};
    color: ${theme.colors.text};
    line-height: 1.6;
    font-size: ${theme.fontSizes.base};
  }

  a {
    color: ${theme.colors.link};
    text-decoration: none;
    transition: color 0.2s ease;
  }

  a:hover {
    color: ${theme.colors.linkHover};
  }

  .highlight-link {
    color: ${theme.colors.link};
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: ${theme.fonts.heading};
    font-weight: 600;
    line-height: 1.3;
    margin: 0 0 ${theme.spacing.md} 0;
  }

  h1 {
    font-size: ${theme.fontSizes['4xl']};
  }

  h2 {
    font-size: ${theme.fontSizes['3xl']};
  }

  h3 {
    font-size: ${theme.fontSizes['2xl']};
  }

  h4 {
    font-size: ${theme.fontSizes.xl};
  }

  p {
    margin: 0 0 ${theme.spacing.md} 0;
  }

  ul, ol {
    margin: 0 0 ${theme.spacing.md} 0;
    padding-left: ${theme.spacing.xl};
  }

  li {
    margin-bottom: ${theme.spacing.xs};
  }

  blockquote {
    border-left: 4px solid ${theme.colors.border};
    margin: ${theme.spacing.lg} 0;
    padding-left: ${theme.spacing.lg};
    font-style: italic;
    color: ${theme.colors.textSecondary};
  }

  code {
    font-family: ${theme.fonts.mono};
    font-size: 0.85rem;
    background-color: ${theme.colors.codeBackground};
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    border-radius: 4px;
  }

  .api-url code {
    background: ${theme.colors.codeBackgroundSlate};
    border-radius: ${theme.radius.pill};
    padding: 4px 10px;
    border: 1px solid ${theme.colors.border};
  }

  pre {
    background-color: ${theme.colors.codeBackground};
    padding: ${theme.spacing.lg};
    border-radius: 8px;
    overflow-x: auto;
    margin: ${theme.spacing.lg} 0;
  }

  pre code {
    background: none;
    padding: 0;
  }

  img {
    max-width: 100%;
    height: auto;
  }

  hr {
    border: none;
    border-top: 1px solid ${theme.colors.border};
    margin: ${theme.spacing.xl} 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: ${theme.spacing.lg} 0;
  }

  th, td {
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    text-align: left;
    border-bottom: 1px solid ${theme.colors.border};
  }

  th {
    font-weight: 600;
  }

  .table-section {
    width: 100%;
    max-width: 1080px;
    background: radial-gradient(circle at top left, ${theme.colors.cardBgStart} 0, ${theme.colors.cardBgEnd} 55%);
    border-radius: 24px;
    padding: 24px;
    border: 1px solid ${theme.colors.borderSlateMuted};
    box-shadow: ${theme.colors.shadowSoft};
    position: relative;
    overflow: hidden;
  }

  .table-section::before {
    content: '';
    position: absolute;
    inset: -40%;
    background: radial-gradient(circle at top right, ${theme.colors.accentSoft}, transparent 55%);
    opacity: 0.7;
    pointer-events: none;
  }

  .table-section table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    position: relative;
    z-index: 1;
  }

  .table-section thead th {
    text-align: left;
    font-weight: 500;
    padding: 8px 10px;
    color: ${theme.colors.textSecondary};
    border-bottom: 1px solid ${theme.colors.borderSlateTable};
    white-space: nowrap;
  }

  .table-section tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid ${theme.colors.slateOverlayDark};
  }

  .table-section tbody tr:last-child td {
    border-bottom: none;
  }

  .table-section tbody tr:nth-child(odd) {
    background: ${theme.colors.slateOverlayTableOdd};
  }

  .table-section tbody tr:nth-child(even) {
    background: ${theme.colors.slateOverlayLight};
  }

  .table-section tbody tr:hover {
    background: ${theme.colors.accentHover};
  }

  .table-section tbody td:nth-child(1) {
    color: ${theme.colors.textSecondary};
  }

  .table-section tbody td:nth-child(4) {
    font-variant-numeric: tabular-nums;
  }

  .table-section tbody td:nth-child(5) {
    color: ${theme.colors.accent};
  }

  .table-section tbody td:nth-child(7) {
    color: ${theme.colors.danger};
  }

  @media (max-width: ${theme.breakpoints.md}) {
    .page {
      padding: 32px 12px 28px;
    }

    .header h1 {
      font-size: 2rem;
    }

    .table-section {
      padding: 16px;
      border-radius: ${theme.radius.lg};
    }

    .table-section table {
      font-size: 0.78rem;
    }

    .table-section thead th,
    .table-section tbody td {
      padding: 6px 6px;
    }
  }
`;
