import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { colors } from '../constants/theme';
import { SkyMood, skyMood } from '../lib/sky';

// NewStep's own mood faces, drawn like the rest of the sticker icons (NSIcon):
// a flat colour, one ink outline, and only as much face as the feeling needs.
// Used instead of system emoji, which look different on every phone.

const INK = colors.ink;
const SW = 2.6; // outline width in the 48×48 grid
const CHEEK = '#FF9BB0';

function Features({ mood }: { mood: SkyMood }) {
  const line = { stroke: INK, strokeWidth: SW, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (mood) {
    case 'happy':
      return (
        <G>
          <Path d="M15 22 q3.5 -4 7 0" {...line} />
          <Path d="M26 22 q3.5 -4 7 0" {...line} />
          <Path d="M17 29 q7 7 14 0" {...line} />
          <Ellipse cx={13} cy={28} rx={2.6} ry={1.8} fill={CHEEK} opacity={0.8} />
          <Ellipse cx={35} cy={28} rx={2.6} ry={1.8} fill={CHEEK} opacity={0.8} />
        </G>
      );
    case 'excited':
      return (
        <G>
          {/* Sparkle eyes and a big open smile. */}
          <Path d="M18.5 16.5 l1.3 3.4 3.4 1.3 -3.4 1.3 -1.3 3.4 -1.3 -3.4 -3.4 -1.3 3.4 -1.3 z" fill={INK} />
          <Path d="M29.5 16.5 l1.3 3.4 3.4 1.3 -3.4 1.3 -1.3 3.4 -1.3 -3.4 -3.4 -1.3 3.4 -1.3 z" fill={INK} />
          <Path d="M16 29 h16 q-1 8 -8 8 q-7 0 -8 -8 z" fill={INK} />
          <Path d="M19.5 33.5 q4.5 2.6 9 0" stroke="#FF7A93" strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </G>
      );
    case 'chill':
      return (
        <G>
          <Path d="M15 22 q3.5 3.5 7 0" {...line} />
          <Path d="M26 22 q3.5 3.5 7 0" {...line} />
          <Path d="M20 30 q4 3 8 0" {...line} />
          <Ellipse cx={13} cy={27} rx={2.4} ry={1.6} fill={CHEEK} opacity={0.6} />
          <Ellipse cx={35} cy={27} rx={2.4} ry={1.6} fill={CHEEK} opacity={0.6} />
        </G>
      );
    case 'nervous':
      return (
        <G>
          <Circle cx={18} cy={21} r={2.2} fill={INK} />
          <Circle cx={30} cy={21} r={2.2} fill={INK} />
          <Path d="M16 31 q2 -2.5 4 0 t4 0 t4 0 t4 0" {...line} />
          {/* A little sweat drop. */}
          <Path d="M41 7 q3 4.5 0 6.5 q-3 -2 0 -6.5 z" fill="#8FD3FF" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </G>
      );
    case 'tired':
      return (
        <G>
          <Path d="M15 22.5 h7" {...line} />
          <Path d="M26 22.5 h7" {...line} />
          <Ellipse cx={24} cy={31} rx={3} ry={2.4} fill={INK} />
          <Path d="M37.5 2.5 h6 l-6 6 h6" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </G>
      );
    case 'down':
    default:
      return (
        <G>
          <Path d="M14.5 17.5 l5 -2" {...line} />
          <Path d="M33.5 17.5 l-5 -2" {...line} />
          <Circle cx={18} cy={22.5} r={2.2} fill={INK} />
          <Circle cx={30} cy={22.5} r={2.2} fill={INK} />
          <Path d="M19 32 q5 -4 10 0" {...line} />
          {/* One small tear. */}
          <Path d="M16 26 q2.4 3.6 0 5.2 q-2.4 -1.6 0 -5.2 z" fill="#8FD3FF" />
        </G>
      );
  }
}

export default function MoodFace({ mood, size = 28 }: { mood: SkyMood; size?: number }) {
  const fill = skyMood(mood).color;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx={24} cy={24} r={19} fill={fill} stroke={INK} strokeWidth={SW} />
      {/* A soft highlight, like the other stickers. */}
      <Path d="M13 15 q4 -6 11 -7" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.55} />
      <Features mood={mood} />
    </Svg>
  );
}
