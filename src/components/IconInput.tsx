import { TextInput, View, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

type Props = TextInputProps & {
  icon: keyof typeof Ionicons.glyphMap;
};

export default function IconInput({ icon, style, ...rest }: Props) {
  return (
    <View style={styles.wrapper}>
      <Ionicons name={icon} size={18} color={colors.textLight} style={styles.icon} />
      <TextInput style={[styles.input, style]} placeholderTextColor={colors.textLight} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
});
