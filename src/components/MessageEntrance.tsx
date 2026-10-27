import { ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useAnimatedValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../constants/theme';

// How a brand-new chat message arrives — NewStep's own touch:
//  * yours floats up softly, like a lantern let go, and lights a tiny star
//    by its corner that twinkles once and fades;
//  * theirs eases in from their side.
// Only messages that just happened animate; scrolling through history stays
// still.
const SPARKLE = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';
const FRESH_MS = 8000;

type Props = {
  mine: boolean;
  createdAt: string;
  children: ReactNode;
};

export default function MessageEntrance({ mine, createdAt, children }: Props) {
  // Decided once, when the bubble first mounts.
  const [fresh] = useState(() => Date.now() - new Date(createdAt).getTime() < FRESH_MS);
  const t = useAnimatedValue(fresh ? 0 : 1);
  const star = useAnimatedValue(0);

  useEffect(() => {
    if (!fresh) return;
    Animated.spring(t, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    if (mine) {
      Animated.sequence([
        Animated.delay(140),
        Animated.timing(star, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [fresh, mine, t, star]);

  if (!fresh) return <>{children}</>;

  return (
    <View>
      <Animated.View
        style={{
          opacity: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: mine
            ? [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
                { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ]
            : [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
        }}
      >
        {children}
      </Animated.View>
      {mine ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.star,
            {
              opacity: star.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateY: star.interpolate({ inputRange: [0, 1], outputRange: [6, -10] }) },
                { scale: star.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.1, 0.8] }) },
                { rotate: star.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
              ],
            },
          ]}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d={SPARKLE} fill={colors.primary} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
    right: 2,
    top: -4,
  },
});
