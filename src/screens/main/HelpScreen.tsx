import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

export default function HelpScreen() {
  return (
    <View style={styles.container}>
      <FadeInView style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="construct-outline" size={36} color={colors.primary} />
        </View>
        <Text style={styles.title}>Coming soon</Text>
        <Text style={styles.subtitle}>
          We're building a dedicated space for help requests. For now, post with the{' '}
          <Text style={styles.highlight}>Need Help</Text> category on the Home feed — other students can see it and
          volunteer right away.
        </Text>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  content: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 22,
  },
  highlight: {
    fontFamily: fontFamily.bold,
    color: colors.secondary,
  },
});
