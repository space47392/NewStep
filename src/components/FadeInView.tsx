import { useEffect, useRef, ReactNode } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
};

// Kept short on purpose: content should feel instant, the motion is only a
// soft settle. Stagger delays from lists are capped so nothing waits long.
const MAX_DELAY = 90;

export default function FadeInView({ children, style, delay = 0 }: Props) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    const d = Math.min(delay, MAX_DELAY);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, delay: d, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, delay: d, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
