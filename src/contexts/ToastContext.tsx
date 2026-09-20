import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef } from '../navigation/navigationRef';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';

type ToastContextType = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

const VISIBLE_DURATION = 2200;
const FADE_DURATION = 200;

// The 6 bottom-tab routes (see TabNavigator.tsx) — getCurrentRoute() drills
// down to whichever of these is focused when a tab screen is active, or to
// the actual stack screen name (PostDetail, Conversation, CreatePost, ...)
// when one is pushed on top, where the tab bar is hidden entirely.
const TAB_BAR_ROUTE_NAMES = new Set(['Feed', 'Search', 'Help', 'Chat', 'Volunteer', 'Profile']);
// Matches TabNavigator's own tabBarStyle.height — the safe-area inset is
// already handled separately below, so this is just the bar's own content height.
const TAB_BAR_HEIGHT = 64;
// StoryViewerScreen calls showToast() (handleSayHi's success/failure) but,
// unlike every other screen this height is meant for, isn't a tab-bar screen
// at all — it's a full-screen modal with its own bottom-anchored action pills
// row (bottom: spacing.xl, ~32-64px from the true bottom, not inset-aware).
// Without this, a toast there would land at the same low offset every other
// stack screen gets and visually overlap those pills right after the exact
// action that triggered it. Reusing TAB_BAR_HEIGHT's clearance here isn't
// about the tab bar — it just happens to comfortably clear that row too.
const EXTRA_CLEARANCE_ROUTE_NAMES = new Set([...TAB_BAR_ROUTE_NAMES, 'StoryViewer']);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (text: string) => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);

      setMessage(text);
      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
      ]).start();

      hideTimeout.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }).start(() =>
          setMessage(null)
        );
      }, VISIBLE_DURATION);
    },
    [opacity, translateY]
  );

  // Computed fresh each time a toast actually shows/hides (this provider only
  // re-renders then) — reads the navigator's current route imperatively via
  // navigationRef, same pattern App.tsx's push-tap handler already uses, since
  // ToastProvider sits above NavigationContainer in the tree and can't use
  // navigation hooks directly. On a tab screen, clears the tab bar itself; on
  // StoryViewer, clears its own bottom action-pills row; on every other stack
  // screen (PostDetail, Conversation, CreatePost, ...) where neither exists,
  // sits just above the safe area instead of leaving a large unexplained gap.
  const needsExtraClearance =
    navigationRef.isReady() && EXTRA_CLEARANCE_ROUTE_NAMES.has(navigationRef.getCurrentRoute()?.name ?? '');
  const bottomOffset = insets.bottom + (needsExtraClearance ? TAB_BAR_HEIGHT + spacing.sm : spacing.lg);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message ? (
        <Animated.View
          style={[styles.toast, { bottom: bottomOffset, opacity, transform: [{ translateY }] }]}
          pointerEvents="none"
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.textDark,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    ...shadow.floating,
  },
  text: {
    color: '#fff',
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
  },
});
