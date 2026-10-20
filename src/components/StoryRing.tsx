import { ReactNode, useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, warmGradient } from '../constants/theme';

// A story avatar's ring: the warm gold-to-coral gradient while there's
// something new to see, a quiet gray once it's been seen.

type Props = {
  size: number;
  active: boolean;
  children: ReactNode;
};

export default function StoryRing({ size, active, children }: Props) {
  const id = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = 2.2;
  const r = (size - stroke) / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={warmGradient[1]} />
            <Stop offset="1" stopColor={warmGradient[0]} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={active ? `url(#${id})` : colors.border}
          strokeWidth={active ? stroke : 1.5}
          fill="none"
        />
      </Svg>
      {children}
    </View>
  );
}
