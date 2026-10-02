import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

const STEPS = 3;
const STEP_MS = 220;

// Little footprints stepping forward one after another — NewStep's take on
// the "the other person is typing" dots, same footprints as the login intro
// and loading screen.
export default function TypingIndicator() {
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
    <View style={styles.row} accessible accessibilityLabel="Typing">
      {steps.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
            transform: [
              { translateY: i % 2 === 0 ? 2 : -2 },
              { rotate: '90deg' },
              { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            ],
          }}
        >
          <Ionicons name="footsteps" size={13} color={colors.primary} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
});
