import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';

type ToastContextType = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

const VISIBLE_DURATION = 2200;
const FADE_DURATION = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
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

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message ? (
        <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
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
    bottom: 110,
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
