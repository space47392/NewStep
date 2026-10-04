import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';
import NSIcon, { NSIconName } from './NSIcon';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  // Gives an empty state its own character (👋 for chat, 🔖 for saved…) —
  // shown instead of `icon`, slightly tilted, on `tint`.
  emoji?: string;
  // One of NewStep's own sticker icons — wins over emoji/icon when set.
  nsIcon?: NSIconName;
  tint?: string;
};

export default function EmptyState({ icon, title, subtitle, emoji, nsIcon, tint }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, tint ? { backgroundColor: tint } : null]}>
        {nsIcon ? (
          <View style={styles.sticker}>
            <NSIcon name={nsIcon} size={44} />
          </View>
        ) : emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : (
          <Ionicons name={icon} size={32} color={colors.primary} />
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sticker: {
    transform: [{ rotate: '-8deg' }],
  },
  emoji: {
    fontSize: 34,
    transform: [{ rotate: '-10deg' }],
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
