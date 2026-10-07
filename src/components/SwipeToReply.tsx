import { ReactNode, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/theme';

// Drag a chat bubble to the right to reply to it. Only claims clearly
// horizontal drags, so the list still scrolls normally up and down.
const TRIGGER = 56;
const MAX_PULL = 80;

type Props = {
  children: ReactNode;
  onReply: () => void;
  enabled?: boolean;
};

export default function SwipeToReply({ children, onReply, enabled = true }: Props) {
  const dx = useRef(new Animated.Value(0)).current;
  const triggeredRef = useRef(false);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          triggeredRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          const pull = Math.max(0, Math.min(MAX_PULL, g.dx * 0.6));
          dx.setValue(pull);
          if (pull >= TRIGGER && !triggeredRef.current) {
            triggeredRef.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } else if (pull < TRIGGER && triggeredRef.current) {
            triggeredRef.current = false;
          }
        },
        onPanResponderRelease: () => {
          if (triggeredRef.current) onReplyRef.current();
          triggeredRef.current = false;
          Animated.spring(dx, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
        },
        onPanResponderTerminate: () => {
          triggeredRef.current = false;
          Animated.spring(dx, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
        },
      }),
    [dx]
  );

  if (!enabled) return <>{children}</>;

  const iconOpacity = dx.interpolate({ inputRange: [0, TRIGGER], outputRange: [0, 1], extrapolate: 'clamp' });
  const iconScale = dx.interpolate({ inputRange: [0, TRIGGER], outputRange: [0.5, 1], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View style={[styles.icon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
        <Ionicons name="arrow-undo" size={16} color={colors.primary} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: dx }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: 4,
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
