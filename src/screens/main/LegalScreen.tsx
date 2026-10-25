import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FadeInView from '../../components/FadeInView';
import { LEGAL_DOCS, LEGAL_INTROS, LEGAL_TITLES, LEGAL_UPDATED, LegalDoc } from '../../constants/legal';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';

// Terms / Privacy / Community Guidelines. Opened from Settings and from the
// sign-up screen, so it only relies on goBack().
export default function LegalScreen() {
  const navigation = useNavigation();
  const { doc } = useRoute<RouteProp<{ Legal: { doc: LegalDoc } }, 'Legal'>>().params;
  const insets = useSafeAreaInsets();
  const sections = LEGAL_DOCS[doc];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]}>
      <FadeInView>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={20} color={colors.textDark} accessibilityLabel="Back" />
        </TouchableOpacity>
        <Text style={styles.title}>{LEGAL_TITLES[doc]}</Text>
        <Text style={styles.intro}>{LEGAL_INTROS[doc]}</Text>
        <Text style={styles.updated}>Last updated {LEGAL_UPDATED}</Text>
      </FadeInView>

      <FadeInView delay={40} style={styles.card}>
        {sections.map((section, i) => (
          <View key={section.heading} style={[styles.section, i > 0 && styles.sectionDivider]}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body.map((p) => (
              <Text key={p.slice(0, 40)} style={styles.body}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textDark,
  },
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  updated: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
  },
  section: {
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 21,
    color: colors.textMid,
  },
});
