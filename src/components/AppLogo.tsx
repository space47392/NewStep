import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop, SvgXml } from 'react-native-svg';

// The "Starry Step" app icon (assets/icon.png), drawn as SVG so it stays
// sharp at any size inside the app (login/sign-up logo, brand marks).
// Same artwork as the home-screen icon, with a rounded-square crop.
const ICON_XML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"><defs> <linearGradient id=\"h\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9EF0FF\"/><stop offset=\"0.4\" stop-color=\"#C7A8FF\"/><stop offset=\"0.7\" stop-color=\"#FFB3E1\"/><stop offset=\"1\" stop-color=\"#FFF2A8\"/></linearGradient> <radialGradient id=\"nv\" cx=\"0.5\" cy=\"0.4\" r=\"0.8\"><stop offset=\"0\" stop-color=\"#2B2470\"/><stop offset=\"1\" stop-color=\"#14103D\"/></radialGradient> </defs><rect width=\"48\" height=\"48\" fill=\"url(#nv)\"/><g transform=\"rotate(-12 24 24)\"> <g stroke=\"#FFFFFF\" stroke-width=\"7\" stroke-linejoin=\"round\" stroke-linecap=\"round\" fill=\"#FFFFFF\"> <g transform=\"translate(24 21) rotate(0) scale(1.3)\" stroke=\"#FFFFFF\" stroke-width=\"5.384615384615384\" stroke-linejoin=\"round\"> <ellipse cx=\"0\" cy=\"3\" rx=\"5.6\" ry=\"8\" fill=\"#FFFFFF\"/> <ellipse cx=\"0\" cy=\"13.5\" rx=\"4\" ry=\"3.4\" fill=\"#FFFFFF\"/> <g stroke=\"#FFFFFF\" fill=\"#FFFFFF\"> <circle cx=\"-4.4\" cy=\"-7.5\" r=\"1.5\"/><circle cx=\"-1.5\" cy=\"-8.6\" r=\"1.5\"/><circle cx=\"1.6\" cy=\"-8.4\" r=\"1.4\"/><circle cx=\"4.3\" cy=\"-7.2\" r=\"1.3\"/> </g> </g></g> <g transform=\"translate(24 21) rotate(0) scale(1.3)\" stroke=\"#1A1A2E\" stroke-width=\"1.6923076923076923\" stroke-linejoin=\"round\"> <ellipse cx=\"0\" cy=\"3\" rx=\"5.6\" ry=\"8\" fill=\"url(#h)\"/> <ellipse cx=\"0\" cy=\"13.5\" rx=\"4\" ry=\"3.4\" fill=\"url(#h)\"/> <g stroke=\"none\" fill=\"#1A1A2E\"> <circle cx=\"-4.4\" cy=\"-7.5\" r=\"1.5\"/><circle cx=\"-1.5\" cy=\"-8.6\" r=\"1.5\"/><circle cx=\"1.6\" cy=\"-8.4\" r=\"1.4\"/><circle cx=\"4.3\" cy=\"-7.2\" r=\"1.3\"/> </g> </g></g> <path opacity=\"1\" d=\"M39 6.8 Q39.8 9.2 42.2 10 Q39.8 10.8 39 13.2 Q38.2 10.8 35.8 10 Q38.2 9.2 39 6.8 Z\" fill=\"#FFE45C\"/><path opacity=\"0.8\" d=\"M43 17.6 Q43.35 18.65 44.4 19 Q43.35 19.35 43 20.4 Q42.65 19.35 41.6 19 Q42.65 18.65 43 17.6 Z\" fill=\"#FFFFFF\"/><path opacity=\"0.95\" d=\"M8 9.6 Q8.6 11.4 10.4 12 Q8.6 12.6 8 14.4 Q7.4 12.6 5.6 12 Q7.4 11.4 8 9.6 Z\" fill=\"#FFFFFF\"/><path opacity=\"1\" d=\"M13 4.8 Q13.3 5.7 14.2 6 Q13.3 6.3 13 7.2 Q12.7 6.3 11.8 6 Q12.7 5.7 13 4.8 Z\" fill=\"#FFB3E1\"/> <path opacity=\"1\" d=\"M41 34.4 Q41.65 36.35 43.6 37 Q41.65 37.65 41 39.6 Q40.35 37.65 38.4 37 Q40.35 36.35 41 34.4 Z\" fill=\"#9EF0FF\"/><path opacity=\"0.7\" d=\"M35 41.7 Q35.325 42.675 36.3 43 Q35.325 43.325 35 44.3 Q34.675 43.325 33.7 43 Q34.675 42.675 35 41.7 Z\" fill=\"#FFFFFF\"/><path opacity=\"1\" d=\"M8 34 Q8.5 35.5 10 36 Q8.5 36.5 8 38 Q7.5 36.5 6 36 Q7.5 35.5 8 34 Z\" fill=\"#FFB3E1\"/><path opacity=\"0.8\" d=\"M5 25.8 Q5.3 26.7 6.2 27 Q5.3 27.3 5 28.2 Q4.7 27.3 3.8 27 Q4.7 26.7 5 25.8 Z\" fill=\"#FFE45C\"/></svg>";

// Material Design 'foot-print' outline (24x24 grid).
const FOOT_PATH =
  'M15.98 2.02L15.98 2.02Q16.59 2.02 17.11 2.34Q17.63 2.67 17.86 3.23Q18.09 3.80 17.98 4.38Q17.86 4.97 17.41 5.41Q16.97 5.86 16.38 5.98Q15.80 6.09 15.23 5.86Q14.67 5.63 14.34 5.11Q14.02 4.59 14.02 3.98L14.02 3.98Q14.02 3.19 14.60 2.60Q15.19 2.02 15.98 2.02ZM12.05 3L12.05 3Q12.66 3 13.10 3.45Q13.55 3.89 13.55 4.50Q13.55 5.11 13.10 5.55Q12.66 6 12.05 6Q11.44 6 10.99 5.55Q10.55 5.11 10.55 4.50Q10.55 3.89 10.99 3.45Q11.44 3 12.05 3ZM9.09 4.50L9.09 4.50Q9.52 4.50 9.80 4.78Q10.08 5.06 10.08 5.48Q10.08 5.91 9.80 6.21Q9.52 6.52 9.09 6.52Q8.67 6.52 8.39 6.21Q8.11 5.91 8.11 5.48Q8.11 5.06 8.39 4.78Q8.67 4.50 9.09 4.50ZM7.03 6L7.03 6Q7.45 6 7.76 6.28Q8.06 6.56 8.06 6.98Q8.06 7.41 7.76 7.71Q7.45 8.02 7.03 8.02Q6.61 8.02 6.33 7.71Q6.05 7.41 6.05 6.98Q6.05 6.56 6.33 6.28Q6.61 6 7.03 6ZM14.53 12L14.53 12Q15.66 12 16.38 11.18Q17.11 10.36 17.02 9.23L17.02 9.23Q16.88 8.25 16.13 7.62Q15.38 6.98 14.39 6.98L14.39 6.98L11.91 6.98Q9.89 6.98 8.27 8.23Q6.66 9.47 6.14 11.39L6.14 11.39Q5.91 12.14 6.23 12.80L6.23 12.80Q6.89 14.20 6.87 15.73Q6.84 17.25 6.23 18.56L6.23 18.56Q5.81 19.45 6.28 20.30L6.28 20.30Q6.94 21.28 7.99 21.73Q9.05 22.17 10.17 21.89L10.17 21.89Q11.02 21.70 11.67 21.16Q12.33 20.63 12.66 19.83Q12.98 19.03 12.89 18.19Q12.80 17.34 12.33 16.62Q11.86 15.89 11.91 15L11.91 15L11.91 15Q11.86 14.25 12.14 13.50L12.14 13.50Q12.75 12 14.53 12Z';

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  // 'icon' (default): the old home-screen icon. 'mark': the brand mark.
  variant?: 'icon' | 'mark';
};

export default function AppLogo({ size = 72, style, variant = 'icon' }: Props) {
  if (variant === 'mark') {
    // The brand mark: one footprint (the new step) filled with a soft dusk
    // sky — violet into pink into peach, night turning to morning — and a
    // School Sky star. No tile, so it sits on any background. The outline is
    // the Material Design footprint, so its shape is natural.
    return (
      <View style={[{ width: size, height: size }, style]} accessible accessibilityRole="image" accessibilityLabel="NewStep">
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id="nsDuskStep" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#9C8BE0" />
              <Stop offset="0.5" stopColor="#E58FB0" />
              <Stop offset="1" stopColor="#FBBE84" />
            </LinearGradient>
          </Defs>
          <G transform="rotate(-10 12 12)">
            <Path d={FOOT_PATH} fill="url(#nsDuskStep)" />
          </G>
          <Path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" transform="translate(19 0.2) scale(0.19)" fill="#FFE3A6" />
        </Svg>
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
