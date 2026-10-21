// Design system: clean like Instagram, warm in the accents. Surfaces are a
// near-neutral dark (only a breath of warmth) with no glows; warmth comes
// from a lantern-gold accent and a gold-to-coral gradient on the few things
// that should feel special (logo, story rings), because the app is about
// people helping each other. Titles are clean bold sans; the friendly,
// rounded Fredoka is kept for the "NewStep" wordmark.
//
// Token names are kept from the old light theme: textDark is the *main*
// (light) text colour, the *Light tokens are dim tinted surfaces, and the
// *Dark tokens are the bright text/icon colour used on those tints.
export const colors = {
  primary: '#F5BC5C',
  // Text and icons ON a primary fill (honey is light, so never white).
  onPrimary: '#2A1D12',
  primaryLight: '#3A2E1E',
  // Text on primaryLight (badges, links on tinted chips).
  primaryDark: '#FFD99B',
  secondary: '#FF6584',
  secondaryLight: '#3A2238',
  secondaryDark: '#FF9BB0',
  accent: '#43D9A2',
  accentLight: '#173832',
  accentDark: '#7EE6BE',
  // Calm, flat surfaces: most content sits straight on the background,
  // separated by hairlines; cards only where something needs grouping.
  background: '#121110',
  cardBg: '#1D1B1A',
  textDark: '#F6F3EF',
  textMid: '#D0CBC5',
  // Secondary text; ~5.5:1 on background.
  textLight: '#9B958F',
  border: '#33302D',
  // Thin separators between rows and sections.
  hairline: '#262321',
  tabBar: '#121110',
  tabActive: '#F5BC5C',
  tabInactive: '#7A7279',
  error: '#FF6B6B',
  errorLight: '#3D1F2A',
  success: '#43D9A2',
  // Solid fill behind white text (success buttons).
  successSolid: '#1F8A63',
  warning: '#FFB800',
  warningLight: '#3A311C',
  questionLight: '#2B2856',
  eventDark: '#FFD45C',
  eventLight: '#3A311C',
  // A step above cards: toasts, floating buttons, sheets.
  raised: '#282523',
  // App icon / splash / footprint intro background.
  night: '#1C1752',
  // Sticker outline ink (NSIcon, InterestIcon, TabGlyph). Stays dark in
  // every theme — it's part of the sticker art, not text.
  ink: '#1A1A2E',
  // School Sky's warm night: honey light and cream text over the sky, so
  // it feels like looking up from somewhere cosy rather than at a screen.
  warm: {
    honey: '#F5C27A',
    honeyInk: '#2A1D12',
    cream: '#FFF3E2',
    creamMuted: 'rgba(255,238,218,0.72)',
    creamFaint: 'rgba(255,238,218,0.5)',
    glass: 'rgba(26,21,40,0.78)',
    glassSoft: 'rgba(255,236,214,0.07)',
    line: 'rgba(255,224,186,0.16)',
  },
  // NewStep sticker icon fills (NSIcon).
  sticker: {
    yellow: '#FFD45C',
    pink: '#FF9BB0',
    mint: '#7EE6BE',
    lilac: '#B7B1FF',
    blue: '#8FB4FF',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Corners: small chips 10, inputs/buttons 14, cards 20, sheets 28.
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
};

// Poppins is loaded via useFonts() in App.tsx — friendly, rounded, modern, reads
// well at both heading and body sizes. Falls back to the system font automatically
// if used before fonts finish loading (App.tsx gates rendering on that, so it won't).
export const fontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extrabold: 'Poppins_800ExtraBold',
  // Fredoka — the "NewStep" wordmark (and the cosy School Sky / Lanterns titles).
  brand: 'Fredoka_700Bold',
};

// Type scale: every text style the app needs, with line heights set so
// paragraphs breathe. Spread into a style: { ...typography.body, color }.
export const typography = {
  // Big screen titles ("Notifications", "Chat").
  largeTitle: { fontFamily: 'Poppins_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  headline: { fontFamily: 'Poppins_600SemiBold', fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: 'Poppins_400Regular', fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, lineHeight: 22 },
  callout: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 16 },
  // Small caps-style section labels.
  overline: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
} as const;

// The bright side: the sign-in screens. You walk up out of the dark
// footsteps intro into a warm, bright world.
export const light = {
  background: '#FFFAF2',
  surface: '#FFFFFF',
  text: '#221B16',
  textMid: '#5C5148',
  textLight: '#8E8278',
  border: '#EADFD2',
  hairline: '#F1E8DC',
};

// The warm accent gradient (gold to coral), for the few special things:
// the logo tile and unseen story rings.
export const warmGradient = ['#F7C873', '#EE8E5A'] as const;

// Soft, consistent card elevation used across the app instead of one-off shadow props.
export const shadow = {
  // Flat on purpose (calm UI): cards are set apart by colour, not shadow.
  card: {},
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  // Lighter than `card` — for small elements (chat bubbles, badges) that need
  // just a hint of lift rather than a full card shadow.
  subtle: {},
};
