import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from './PrimaryButton';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  subtitle?: string;
  onRetry: () => void;
  retrying?: boolean;
};

// Same visual shape as EmptyState, plus a retry action — the distinct
// "this failed to load" state that was previously indistinguishable from
// genuine emptiness across most list screens (every one of them fell back to
// a silent catch + EmptyState). Never used for a background-refresh failure
// when data is already showing — that stays a toast, per each screen's own
// hasLoadedOnce-style guard (Step 36).
export default function ErrorState({
  icon = 'cloud-offline-outline',
  title = "Couldn't load this right now",
  subtitle = 'Check your connection and try again.',
  onRetry,
  retrying = false,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={32} color={colors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <PrimaryButton
        title="Try Again"
        icon="refresh-outline"
        variant="outline"
        onPress={onRetry}
        loading={retrying}
        style={styles.button}
      />
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
    backgroundColor: colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
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
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  button: {
    minWidth: 160,
  },
});
