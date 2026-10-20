import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';

// The "Starry Step" app icon (assets/icon.png), drawn as SVG so it stays
// sharp at any size inside the app (login/sign-up logo, brand marks).
// Same artwork as the home-screen icon, with a rounded-square crop.
const ICON_XML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><defs> <linearGradient id=\"h\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9EF0FF\"/><stop offset=\"0.4\" stop-color=\"#C7A8FF\"/><stop offset=\"0.7\" stop-color=\"#FFB3E1\"/><stop offset=\"1\" stop-color=\"#FFF2A8\"/></linearGradient> <radialGradient id=\"nv\" cx=\"0.5\" cy=\"0.4\" r=\"0.8\"><stop offset=\"0\" stop-color=\"#2B2470\"/><stop offset=\"1\" stop-color=\"#14103D\"/></radialGradient> </defs><rect width=\"48\" height=\"48\" fill=\"url(#nv)\"/><g transform=\"rotate(-12 24 24)\"> <g stroke=\"#FFFFFF\" stroke-width=\"7\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"#FFFFFF\"> <g transform=\"translate(24 21) rotate(0) scale(1.3)\" stroke=\"#FFFFFF\" stroke-width=\"5.384615384615384\" stroke-linejoin=\"round\"> <ellipse cx=\"0\" cy=\"3\" rx=\"5.6\" ry=\"8\" fill=\"#FFFFFF\"/> <ellipse cx=\"0\" cy=\"13.5\" rx=\"4\" ry=\"3.4\" fill=\"#FFFFFF\"/> <g stroke=\"#FFFFFF\" fill=\"#FFFFFF\"> <circle cx=\"-4.4\" cy=\"-7.5\" r=\"1.5\"/><circle cx=\"-1.5\" cy=\"-8.6\" r=\"1.5\"/><circle cx=\"1.6\" cy=\"-8.4\" r=\"1.4\"/><circle cx=\"4.3\" cy=\"-7.2\" r=\"1.3\"/> </g> </g></g> <g transform=\"translate(24 21) rotate(0) scale(1.3)\" stroke=\"#1A1A2E\" stroke-width=\"1.6923076923076923\" stroke-linejoin=\"round\"> <ellipse cx=\"0\" cy=\"3\" rx=\"5.6\" ry=\"8\" fill=\"url(#h)\"/> <ellipse cx=\"0\" cy=\"13.5\" rx=\"4\" ry=\"3.4\" fill=\"url(#h)\"/> <g stroke=\"none\" fill=\"#1A1A2E\"> <circle cx=\"-4.4\" cy=\"-7.5\" r=\"1.5\"/><circle cx=\"-1.5\" cy=\"-8.6\" r=\"1.5\"/><circle cx=\"1.6\" cy=\"-8.4\" r=\"1.4\"/><circle cx=\"4.3\" cy=\"-7.2\" r=\"1.3\"/> </g> </g></g> <path opacity=\"1\" d=\"M39 6.8 Q39.8 9.2 42.2 10 Q39.8 10.8 39 13.2 Q38.2 10.8 35.8 10 Q38.2 9.2 39 6.8 Z\" fill=\"#FFE45C\"/><path opacity=\"0.8\" d=\"M43 17.6 Q43.35 18.65 44.4 19 Q43.35 19.35 43 20.4 Q42.65 19.35 41.6 19 Q42.65 18.65 43 17.6 Z\" fill=\"#FFFFFF\"/><path opacity=\"0.95\" d=\"M8 9.6 Q8.6 11.4 10.4 12 Q8.6 12.6 8 14.4 Q7.4 12.6 5.6 12 Q7.4 11.4 8 9.6 Z\" fill=\"#FFFFFF\"/><path opacity=\"1\" d=\"M13 4.8 Q13.3 5.7 14.2 6 Q13.3 6.3 13 7.2 Q12.7 6.3 11.8 6 Q12.7 5.7 13 4.8 Z\" fill=\"#FFB3E1\"/> <path opacity=\"1\" d=\"M41 34.4 Q41.65 36.35 43.6 37 Q41.65 37.65 41 39.6 Q40.35 37.65 38.4 37 Q40.35 36.35 41 34.4 Z\" fill=\"#9EF0FF\"/><path opacity=\"0.7\" d=\"M35 41.7 Q35.325 42.675 36.3 43 Q35.325 43.325 35 44.3 Q34.675 43.325 33.7 43 Q34.675 42.675 35 41.7 Z\" fill=\"#FFFFFF\"/><path opacity=\"1\" d=\"M8 34 Q8.5 35.5 10 36 Q8.5 36.5 8 38 Q7.5 36.5 6 36 Q7.5 35.5 8 34 Z\" fill=\"#FFB3E1\"/><path opacity=\"0.8\" d=\"M5 25.8 Q5.3 26.7 6.2 27 Q5.3 27.3 5 28.2 Q4.7 27.3 3.8 27 Q4.7 26.7 5 25.8 Z\" fill=\"#FFE45C\"/></svg>";

// The brand mark: two footprints — a new step — in ink on a honey tile,
// like the app icon. Used on the sign-in screens and in the Home header.
const MARK_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="nsTile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7C873"/><stop offset="1" stop-color="#EE8E5A"/></linearGradient></defs><rect width="48" height="48" rx="12.5" fill="url(#nsTile)"/><g fill="#2A1D12"><g transform="translate(16.5 29.5) rotate(-8) scale(-0.48 0.48) translate(-24 -25)"><path d="M24 44.5 C19 44.5 17.4 40.6 17.9 37 C18.4 33.6 19.8 31.2 19.6 27.8 C19.4 24.4 15.6 21.6 15.8 16.8 C16 12.4 19.8 10.6 24.4 10.8 C29.6 11 33.2 13.6 32.8 18.6 C32.4 23 30.6 26 30.8 30 C31 33.4 31.4 36 31 38.8 C30.6 42.6 28.4 44.5 24 44.5 Z"/><ellipse cx="18.6" cy="6.6" rx="3" ry="3.5"/><circle cx="23.6" cy="4.7" r="2.4"/><circle cx="27.6" cy="5.2" r="2.15"/><circle cx="31" cy="7.1" r="1.9"/><circle cx="33.6" cy="10" r="1.65"/></g><g transform="translate(31.5 18.5) rotate(8) scale(0.48) translate(-24 -25)"><path d="M24 44.5 C19 44.5 17.4 40.6 17.9 37 C18.4 33.6 19.8 31.2 19.6 27.8 C19.4 24.4 15.6 21.6 15.8 16.8 C16 12.4 19.8 10.6 24.4 10.8 C29.6 11 33.2 13.6 32.8 18.6 C32.4 23 30.6 26 30.8 30 C31 33.4 31.4 36 31 38.8 C30.6 42.6 28.4 44.5 24 44.5 Z"/><ellipse cx="18.6" cy="6.6" rx="3" ry="3.5"/><circle cx="23.6" cy="4.7" r="2.4"/><circle cx="27.6" cy="5.2" r="2.15"/><circle cx="31" cy="7.1" r="1.9"/><circle cx="33.6" cy="10" r="1.65"/></g></g></svg>`;

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  // 'icon' (default): the home-screen icon. 'mark': the flat footprint.
  variant?: 'icon' | 'mark';
  // 'mark' only: a soft honey glow behind it (big sign-in logo).
  glow?: boolean;
};

export default function AppLogo({ size = 72, style, variant = 'icon', glow: withGlow = false }: Props) {
  if (variant === 'mark') {
    if (!withGlow) {
      return (
        <View style={[{ width: size, height: size }, style]} accessible accessibilityRole="image" accessibilityLabel="NewStep">
          <SvgXml xml={MARK_XML} width={size} height={size} />
        </View>
      );
    }
    const glow = size * 1.9;
    return (
      <View
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, style]}
        accessible
        accessibilityRole="image"
        accessibilityLabel="NewStep"
      >
        <Svg width={glow} height={glow} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="markGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#F5C27A" stopOpacity={0.22} />
              <Stop offset="0.6" stopColor="#F5C27A" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#F5C27A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={glow} height={glow} fill="url(#markGlow)" />
        </Svg>
        <SvgXml xml={MARK_XML} width={size * 1.05} height={size * 1.05} />
      </View>
    );
  }
  return (
    <View
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.24 }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="NewStep"
    >
      <SvgXml xml={ICON_XML} width={size} height={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
  },
});
