// "Warm night" design system. The app sits in a warm, low-glare dark
// (charcoal with a hint of plum, not blue-black), with warm-white text and
// the brand violet for actions. Honey (colors.warm) marks the cosy moments.
//
// Token names are kept from the old light theme: textDark is the *main*
// (light) text colour, the *Light tokens are dim tinted surfaces, and the
// *Dark tokens are the bright text/icon colour used on those tints.
export const colors = {
  // White text on primary is ~4.5:1.
  primary: '#7066F0',
  primaryLight: '#2B2740',
  // Text on primaryLight (badges, links on tinted chips).
  primaryDark: '#CEC9FF',
  secondary: '#FF6584',
  secondaryLight: '#3A2238',
  secondaryDark: '#FF9BB0',
  accent: '#43D9A2',
  accentLight: '#173832',
  accentDark: '#7EE6BE',
  // Calm, flat surfaces: most content sits straight on the background,
  // separated by hairlines; cards only where something needs grouping.
  background: '#15131A',
  cardBg: '#1F1C25',
  textDark: '#F7F3EE',
  textMid: '#D2CBC4',
  // Secondary text; ~5.5:1 on background.
  textLight: '#9A928C',
  border: '#332E3B',
  // Thin separators between rows and sections.
  hairline: '#26222C',
  tabBar: '#15131A',
  tabActive: '#F5C27A',
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
  raised: '#2A2631',
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
  // Fredoka — only for the "NewStep" wordmark, to match the sticker app icon.
  brand: 'Fredoka_700Bold',
};

// Type scale: every text style the app needs, with line heights set so
// paragraphs breathe. Spread into a style: { ...typography.body, color }.
export const typography = {
  // Big screen titles ("Notifications", "Chat").
  largeTitle: { fontFamily: 'Poppins_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  headline: { fontFamily: 'Poppins_600SemiBold', fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: 'Poppins_400Regular', fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, lineHeight: 22 },
  callout: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 16 },
  // Small caps-style section labels.
  overline: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
} as const;

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
