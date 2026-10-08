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
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';

type Variant = 'primary' | 'outline' | 'destructive' | 'success';

type Props = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  // 'sm' — a compact pill for inline actions in list rows (e.g. Follow).
  size?: 'md' | 'sm';
};

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, text: '#fff' },
  destructive: { bg: colors.error, text: '#fff' },
  // accentDark, not success: white on the bright mint was ~1.8:1.
  success: { bg: colors.successSolid, text: '#fff' },
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
  size = 'md',
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
          size === 'sm' && styles.buttonSm,
          // A soft lift on filled variants only — outline buttons stay flat,
          // so the primary action reads as more prominent/pressable than a
          // secondary one, on top of (not instead of) the existing color
          // contrast (Visual Polish pass).
          variant !== 'outline' && !isDisabled && shadow.subtle,
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
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={v.text} style={styles.icon} /> : null}
            <Text style={[styles.text, size === 'sm' && styles.textSm, { color: v.text }]}>{title}</Text>
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
  buttonSm: {
    paddingVertical: spacing.xs + 3,
    borderRadius: radius.full,
  },
  textSm: {
    fontSize: fontSize.sm,
  },
  icon: {
    marginRight: spacing.xs,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
  },
});
