import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';

type Props = {
  schoolName: string;
  onDone: () => void;
};

const FLAGS = 12;
const FLAG_TINTS = [colors.secondary, colors.warning, colors.accent, colors.primary];
const HOLD_MS = 1600;

// Shown for a moment right after picking a school — the same pennant +
// bunting as the school page header, with the flags dropping in one by one
// and swinging into place. Tap anywhere to move on sooner.
export default function SchoolJoinedCelebration({ schoolName, onDone }: Props) {
  const card = useRef(new Animated.Value(0)).current;
  const flags = useRef(Array.from({ length: FLAGS }, () => new Animated.Value(0))).current;
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.spring(card, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.stagger(
        45,
        flags.map((f) => Animated.spring(f, { toValue: 1, friction: 3, tension: 90, useNativeDriver: true }))
      ),
    ]).start();
    const timer = setTimeout(finish, HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TouchableWithoutFeedback onPress={finish} accessibilityRole="button" accessibilityLabel={`You joined ${schoolName}. Tap to continue.`}>
      <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: card,
              transform: [
                { scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                { rotate: card.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '-1.5deg'] }) },
              ],
            },
          ]}
        >
          <View style={styles.pennant}>
            <Text style={styles.kicker}>YOU'RE IN!</Text>
            <Text style={styles.schoolName} numberOfLines={2}>
              🏫 {schoolName}
            </Text>
          </View>
          <View style={styles.bunting}>
            {flags.map((f, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.flag,
                  {
                    borderTopColor: FLAG_TINTS[i % FLAG_TINTS.length],
                    opacity: f.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
                    transform: [
                      { translateY: f.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
                      {
                        rotate: f.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [i % 2 ? '25deg' : '-25deg', i % 2 ? '-10deg' : '10deg', '0deg'],
                          easing: Easing.out(Easing.quad),
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
          <Text style={styles.body}>Welcome to your school community 👋</Text>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 18, 40, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    zIndex: 20,
    elevation: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  pennant: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  kicker: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xs,
    color: '#fff',
    opacity: 0.85,
    letterSpacing: 1.5,
  },
  schoolName: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: '#fff',
  },
  bunting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    height: 16,
  },
  flag: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  body: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
});
