import { useState } from 'react';
import { TextInput, View, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

type Props = TextInputProps & {
  // Optional leading icon; plain fields (sign-in) leave it out.
  icon?: keyof typeof Ionicons.glyphMap;
};

export default function IconInput({ icon, style, onFocus, onBlur, ...rest }: Props) {
  // A honey outline while typing, so it's clear which field is active.
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrapper, focused && styles.wrapperFocused]}>
      {icon ? <Ionicons name={icon} size={18} color={focused ? colors.primary : colors.textLight} style={styles.icon} /> : null}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.textLight}
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
  wrapperFocused: {
    borderColor: colors.primary,
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
