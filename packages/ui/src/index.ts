// Shared UI design system constants, components, and helpers
export const UI_THEME = {
  colors: {
    bgDark: '#090d16',
    panelBg: '#111827',
    panelBorder: '#1f2937',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#f59e0b',
    textMain: '#f9fafb',
    textMuted: '#9ca3af'
  }
};

/**
 * BedrockOps "Command Center" design system tokens.
 * Minecraft-inspired professional aesthetic: deepslate surfaces, grass-green
 * primary, diamond-blue accents, dirt-brown container headers. See
 * docs/design/bedrockops-console.md for the full spec.
 */
export const THEME = {
  colors: {
    background: '#121414',
    surface: '#1b1c1c',
    surfaceContainer: '#1f2020',
    surfaceContainerHigh: '#292a2a',
    surfaceContainerHighest: '#343535',
    surfaceContainerLowest: '#0d0e0f',
    onSurface: '#e3e2e2',
    onSurfaceVariant: '#c3c9b7',
    outline: '#43493b',
    outlineStrong: '#8d9383',
    primary: '#a4d575',
    primaryContainer: '#709d45',
    onPrimary: '#1b3700',
    secondary: '#dac2af',
    secondaryContainer: '#574637',
    dirt: '#4a3a2c',
    tertiary: '#00dddd',
    onTertiary: '#003737',
    error: '#ffb4ab',
    errorContainer: '#93000a',
    warning: '#f5c451',
    // Log severity accents for the live console.
    logInfo: '#00dddd',
    logWarn: '#f5c451',
    logError: '#ffb4ab',
    logJoin: '#a4d575'
  },
  fonts: {
    heading: "'Space Grotesk', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
  },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
  space: { xs: '8px', sm: '16px', md: '24px', lg: '32px', xl: '48px' }
} as const;

export * from './components';
