import { ReactNode, useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

// A pressable that gently sinks while held and springs back on release,
// with a light tap of haptics — for tiles, tabs and chips across the app.
type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  // How far it sinks while held (0.96 = 4%).
  pressedScale?: number;
  haptic?: boolean;
};

export default function PressableScale({ style, children, pressedScale = 0.95, haptic = true, onPressIn, onPressOut, onPress, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  // The outer Pressable takes the layout (flex, width, margins) so the item
  // sits in rows exactly as a plain view would; the inner view scales.
  const flat = StyleSheet.flatten(style) ?? {};
  const { flex, flexGrow, flexShrink, flexBasis, width, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical } = flat;
  const outer = { flex, flexGrow, flexShrink, flexBasis, width, alignSelf, margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical };
  const inner = { ...flat, flex: flex != null ? 1 : undefined, width: width != null ? '100%' as const : undefined, alignSelf: undefined, margin: undefined, marginTop: undefined, marginBottom: undefined, marginLeft: undefined, marginRight: undefined, marginHorizontal: undefined, marginVertical: undefined };
  return (
    <Pressable
      {...rest}
      style={outer}
      onPressIn={(e) => {
        Animated.spring(scale, { toValue: pressedScale, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
    >
      <Animated.View style={[inner, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
