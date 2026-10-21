import { useState } from 'react';
import { TextInput, View, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, light, spacing, radius, fontSize, fontFamily } from '../constants/theme';

type Props = TextInputProps & {
  // Optional leading icon; plain fields (sign-in) leave it out.
  icon?: keyof typeof Ionicons.glyphMap;
  // 'light' on the bright sign-in screens.
  tone?: 'dark' | 'light';
};

export default function IconInput({ icon, tone = 'dark', style, onFocus, onBlur, ...rest }: Props) {
  const isLight = tone === 'light';
  // A honey outline while typing, so it's clear which field is active.
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrapper, isLight && styles.wrapperLight, focused && styles.wrapperFocused]}>
      {icon ? <Ionicons name={icon} size={18} color={focused ? colors.primary : isLight ? light.textLight : colors.textLight} style={styles.icon} /> : null}
      <TextInput
        style={[styles.input, isLight && styles.inputLight, style]}
        placeholderTextColor={isLight ? light.textLight : colors.textLight}
        selectionColor={colors.primary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  wrapperLight: {
    backgroundColor: light.surface,
    borderColor: light.border,
  },
  wrapperFocused: {
    borderColor: colors.primary,
  },
  inputLight: {
    color: light.text,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
});
