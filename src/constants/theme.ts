export const colors = {
  primary: '#6C63FF',
  primaryLight: '#EEF0FF',
  secondary: '#FF6584',
  secondaryLight: '#FFE9EE',
  accent: '#43D9A2',
  accentLight: '#E3FBF1',
  background: '#F8F9FE',
  cardBg: '#FFFFFF',
  textDark: '#1A1A2E',
  textMid: '#4A4A68',
  textLight: '#9A9AB4',
  border: '#E8E8F0',
  tabBar: '#FFFFFF',
  tabActive: '#6C63FF',
  tabInactive: '#B0B0C8',
  error: '#FF4D4D',
  errorLight: '#FFEAEA',
  success: '#43D9A2',
  warning: '#FFB800',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
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
};

// Soft, consistent card elevation used across the app instead of one-off shadow props.
export const shadow = {
  card: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  // Lighter than `card` — for small elements (chat bubbles, badges) that need
  // just a hint of lift rather than a full card shadow.
  subtle: {
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
};
