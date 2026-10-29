import { useId } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// The NewStep mark: an arched school window. On one side the night sky with
// its stars (the worried night before), on the other the sun rising (the new
// day). NewStep helps you through from one to the other.
//
// The same artwork is the app icon (assets/icon.png and the Android adaptive
// icon). The one-colour versions (the themed launcher icon and the
// status-bar notification icon) are drawn from this same 24x24 geometry.

const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';
const ARCH = 'M4.4 21 V10.4 A7.6 7.6 0 0 1 19.6 10.4 V21 Z';
const FRAME = '#FFF1C9';

const sparkle = (x: number, y: number, k: number) => `translate(${x - 12 * k} ${y - 12 * k}) scale(${k})`;

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  // 'light': on a bright background the window frame is dark wood, not cream.
  tone?: 'dark' | 'light';
};

export default function AppLogo({ size = 72, style, tone = 'dark' }: Props) {
  // SVG ids must be unique per instance (the mark can appear more than once).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const arch = `arch${uid}`;
  const right = `right${uid}`;
  const dawn = `dawn${uid}`;
  const sun = `sun${uid}`;
  const frame = tone === 'light' ? '#3B2F26' : FRAME;
  return (
    <View style={[{ width: size, height: size }, style]} accessible accessibilityRole="image" accessibilityLabel="NewStep">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id={dawn} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF8E8" />
            <Stop offset="1" stopColor="#FFE2B8" />
          </LinearGradient>
          <LinearGradient id={sun} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFC56A" />
            <Stop offset="1" stopColor="#F08A3C" />
          </LinearGradient>
          <ClipPath id={arch}>
            <Path d={ARCH} />
          </ClipPath>
          <ClipPath id={right}>
            <Rect x="12" y="0" width="12" height="21" />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${arch})`}>
          <Rect x="0" y="0" width="12" height="24" fill="#2E2757" />
          <Rect x="12" y="0" width="12" height="24" fill={`url(#${dawn})`} />
          <Circle cx="16" cy="19" r="3.8" fill={`url(#${sun})`} clipPath={`url(#${right})`} />
          <Path d={SPARKLE} fill={FRAME} transform={sparkle(7.4, 9.4, 0.13)} />
          <Path d={SPARKLE} fill="#FFFFFF" transform={sparkle(9.6, 14, 0.08)} />
        </G>
        <Path d={ARCH} fill="none" stroke={frame} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M12 3 V21" stroke={frame} strokeWidth={1.4} />
        <Path d="M3 21 H21" stroke={frame} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
