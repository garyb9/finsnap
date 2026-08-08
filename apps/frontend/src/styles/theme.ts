export const theme = {
  colors: {
    background: '#0a0a0a',
    backgroundGradientStart: '#0b1c1c',
    backgroundGradientMid: '#02120f',
    backgroundGradientEnd: '#000000',
    backgroundElevated: '#0b1920',
    cardBgStart: '#0f2626',
    cardBgEnd: '#02120f',
    slateOverlay: 'rgba(15, 35, 42, 0.4)',
    slateOverlayStrong: 'rgba(15, 35, 42, 0.6)',
    slateOverlayMuted: 'rgba(15, 35, 42, 0.7)',
    slateOverlayLight: 'rgba(15, 35, 42, 0.2)',
    slateOverlayDark: 'rgba(15, 35, 42, 0.8)',
    slateOverlayTableOdd: 'rgba(15, 35, 42, 0.45)',
    text: '#f0f0f0',
    textSecondary: '#a0a0a0',
    textMuted: '#94b3b8',
    textSlate: '#e2eef0',
    textSlateLight: '#cbdfe1',
    label: '#64858b',
    link: '#00e0c6',
    linkHover: '#00e0c6',
    greenMuted: '#00cfc0',
    success: '#4ade80',
    warning: '#facc15',
    danger: '#f87171',
    accent: '#2ec2ae',
    accentSoft: 'rgba(46, 194, 174, 0.14)',
    accentHover: 'rgba(46, 194, 174, 0.10)',
    // Strategy-kind tag colors — one hue per family, distinct from the
    // success/warning/danger triad above since those already carry their own
    // meaning (beats/loses, caution, etc.) everywhere a strategy's numbers show up.
    kindTrend: '#60a5fa',
    kindMomentum: '#c084fc',
    kindBreakout: '#fb923c',
    kindMeanReversion: '#f472b6',
    border: '#2a2a2a',
    borderLight: '#3a3a3a',
    borderSlate: 'rgba(148, 179, 184, 0.18)',
    borderSlateStrong: 'rgba(148, 179, 184, 0.2)',
    borderSlateMuted: 'rgba(148, 179, 184, 0.25)',
    borderSlateTable: 'rgba(148, 179, 184, 0.35)',
    codeBackground: '#1a1a1a',
    codeBackgroundSlate: 'rgba(15, 35, 42, 0.9)',
    white: '#ffffff',
    shadowLight: 'rgba(0, 0, 0, 0.04)',
    shadowMedium: 'rgba(0, 0, 0, 0.1)',
    shadowSoft: '0 18px 40px rgba(15, 35, 42, 0.6)',
    shadowCard: '0 10px 30px rgba(15, 35, 42, 0.5)',
    borderTransparent: 'rgba(160, 160, 160, 0.18)',
  },
  fonts: {
    body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    heading: 'Space Grotesk, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    matrix: '"Courier New", "Fira Code", "Monaco", "Consolas", monospace',
    mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    base: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '18px',
    pill: '999px',
  },
  maxWidth: {
    content: '800px',
    dashboard: '1400px',
  },
  /**
   * Height of the mobile top bar (`MobileTopBar`), shown only below `md` now
   * that navigation lives in a left sidebar on larger screens. Anything that
   * sticks to the top on mobile, or that a deep link scrolls to, has to clear
   * it — hard-coding the number in several places is how one of them silently
   * ends up underneath.
   */
  headerHeight: '46px',
  /** Width of the left sidebar in its expanded and collapsed states. */
  sidebarWidth: '240px',
  sidebarWidthCollapsed: '64px',
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
  /**
   * Chrome that sits above ordinary page content, in ascending order of "must
   * win": the persistent sidebar, then in-page popovers (search results,
   * dropdown panels), the docked sync control, chart tooltips (must always be
   * readable over a card), and finally anything Radix portals to
   * `document.body` — command palette, mobile nav drawer, toasts — which
   * renders outside every other stacking context and would otherwise land
   * beneath the bands above by accident.
   */
  zIndex: {
    sidebar: 30,
    popover: 41,
    syncDock: 40,
    tooltip: 100,
    overlay: 900,
  },
};

export type Theme = typeof theme;
