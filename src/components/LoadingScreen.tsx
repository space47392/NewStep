import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

type Props = {
  message?: string;
};

const STEPS = 3;
const STEP_MS = 280;

// Three footprints lighting up one after another — "taking a step" — instead
// of a generic spinner, matching the footprints on the login screen.
export default function LoadingScreen({ message }: Props) {
  const steps = useRef(Array.from({ length: STEPS }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        ...steps.map((v) => Animated.timing(v, { toValue: 1, duration: STEP_MS, useNativeDriver: true })),
        Animated.delay(STEP_MS),
        Animated.parallel(steps.map((v) => Animated.timing(v, { toValue: 0, duration: STEP_MS, useNativeDriver: true }))),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [steps]);

  return (
    <View style={styles.container} accessible accessibilityRole="progressbar" accessibilityLabel={message ?? 'Loading'}>
      <View style={styles.trail}>
        {steps.map((v, i) => (
          <Animated.View
            key={i}
            style={{
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }),
              transform: [
                { translateY: i % 2 === 0 ? 6 : -6 },
                { rotate: '-90deg' },
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            }}
          >
            <Ionicons name="footsteps" size={24} color={colors.primary} />
          </Animated.View>
        ))}
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  trail: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  message: {
    marginTop: spacing.md,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
});
