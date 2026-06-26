import { useRef } from 'react';
import {
  Animated,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

type Variant = 'primary' | 'outline' | 'destructive' | 'success';

type Props = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, text: '#fff' },
  destructive: { bg: colors.error, text: '#fff' },
  success: { bg: colors.success, text: '#fff' },
  outline: { bg: colors.cardBg, text: colors.primary, border: colors.primary },
};

export default function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
  style,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const v = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: v.bg, borderColor: v.border ?? v.bg, opacity: isDisabled ? 0.6 : 1 },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color={v.text} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={18} color={v.text} style={styles.icon} /> : null}
            <Text style={[styles.text, { color: v.text }]}>{title}</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.xs,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
  },
});
