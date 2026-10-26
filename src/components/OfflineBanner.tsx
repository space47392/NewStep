import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, fontSize, spacing } from '../constants/theme';

// A small pill that slides down when the phone loses its connection, so a
// post or message that won't go through never fails silently. When the
// connection comes back it says so for a moment, then slides away.
export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');
  const slide = useRef(new Animated.Value(0)).current;
  const wasOffline = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((s) => {
      // isInternetReachable is null while unknown — only trust a clear "no".
      const offline = s.isConnected === false || s.isInternetReachable === false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (offline) {
        wasOffline.current = true;
        setState('offline');
      } else if (wasOffline.current) {
        wasOffline.current = false;
        setState('back');
        hideTimer.current = setTimeout(() => setState('online'), 2200);
      }
    });
    return () => {
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: state === 'online' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state, slide]);

  const back = state === 'back';
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.pill,
        back && styles.pillBack,
        {
          top: insets.top + spacing.sm,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Ionicons name={back ? 'checkmark-circle' : 'cloud-offline'} size={15} color="#FFF4E2" />
      <Text style={styles.text}>{back ? "You're back online" : "You're offline — we'll keep trying"}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3A2E28',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    zIndex: 1000,
    elevation: 10,
  },
  pillBack: {
    backgroundColor: '#1F8A63',
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: '#FFF4E2',
  },
});
