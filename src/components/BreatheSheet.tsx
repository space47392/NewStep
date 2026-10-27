import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View, useAnimatedValue } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LanternGlyph } from '../screens/main/LanternsScreen';
import { colors, fontFamily, fontSize, radius, spacing } from '../constants/theme';

// One quiet minute: a lantern's glow grows as you breathe in and softens as
// you breathe out (in 4s · hold 1s · out 6s), six times. Nothing to read,
// nothing to type — just follow the light.

const IN = 4000;
const HOLD = 1000;
const OUT = 6000;
const ROUNDS = 6;

type Phase = 'in' | 'hold' | 'out' | 'done';

export default function BreatheSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const glow = useAnimatedValue(0);
  const [phase, setPhase] = useState<Phase>('in');
  const [round, setRound] = useState(1);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      runningRef.current = false;
      glow.stopAnimation();
      return;
    }
    runningRef.current = true;
    setRound(1);
    glow.setValue(0);
    let r = 1;
    const cycle = () => {
      if (!runningRef.current) return;
      setPhase('in');
      Haptics.selectionAsync().catch(() => {});
      Animated.timing(glow, { toValue: 1, duration: IN, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(({ finished }) => {
        if (!finished || !runningRef.current) return;
        setPhase('hold');
        setTimeout(() => {
          if (!runningRef.current) return;
          setPhase('out');
          Haptics.selectionAsync().catch(() => {});
          Animated.timing(glow, { toValue: 0, duration: OUT, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(({ finished: f2 }) => {
            if (!f2 || !runningRef.current) return;
            if (r >= ROUNDS) {
              setPhase('done');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              return;
            }
            r += 1;
            setRound(r);
            cycle();
          });
        }, HOLD);
      });
    };
    const start = setTimeout(cycle, 600);
    return () => {
      clearTimeout(start);
      runningRef.current = false;
      glow.stopAnimation();
    };
  }, [visible, glow]);

  const words = phase === 'in' ? 'Breathe in…' : phase === 'hold' ? 'Hold…' : phase === 'out' ? 'And let it go…' : 'That was for you 💛';

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.kicker}>{phase === 'done' ? 'One minute, just for you' : `Breath ${round} of ${ROUNDS}`}</Text>

        <View style={styles.center}>
          <Animated.View
            style={[
              styles.glow,
              {
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.15] }) }],
              },
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id="breatheGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFD58A" stopOpacity={0.9} />
                  <Stop offset="0.5" stopColor="#F5A65B" stopOpacity={0.35} />
                  <Stop offset="1" stopColor="#F5A65B" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill="url(#breatheGlow)" />
            </Svg>
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: glow.interpolate({ inputRange: [0, 1], outputRange: [8, -8] }) }] }}>
            <LanternGlyph size={56} />
          </Animated.View>
        </View>

        <Text style={styles.words}>{words}</Text>
        <Text style={styles.hint}>{phase === 'done' ? "Come back whenever you need a minute." : 'Follow the light. Nothing else to do.'}</Text>

        <TouchableOpacity style={phase === 'done' ? styles.doneButton : styles.stop} onPress={onClose} accessibilityRole="button">
          <Text style={phase === 'done' ? styles.doneText : styles.stopText}>{phase === 'done' ? 'Done' : 'Stop for now'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1B1530',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  kicker: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: 'rgba(255,240,220,0.6)',
    marginTop: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
  },
  words: {
    fontFamily: fontFamily.brand,
    fontSize: 30,
    color: '#FFF4E2',
    textAlign: 'center',
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: 'rgba(255,240,220,0.6)',
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  stop: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  stopText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: 'rgba(255,240,220,0.55)',
  },
  doneButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doneText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.onPrimary,
  },
});
