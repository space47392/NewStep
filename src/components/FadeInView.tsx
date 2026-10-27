import { useEffect, ReactNode } from 'react';
import { Animated, Easing, StyleProp, ViewStyle, useAnimatedValue } from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
};

// Kept short on purpose: content should feel instant, the motion is only a
// soft settle. Stagger delays from lists are capped so nothing waits long.
const MAX_DELAY = 90;

export default function FadeInView({ children, style, delay = 0 }: Props) {
  const opacity = useAnimatedValue(0.35);
  const translateY = useAnimatedValue(6);

  useEffect(() => {
    const d = Math.min(delay, MAX_DELAY);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, delay: d, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, delay: d, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [delay, opacity, translateY]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
