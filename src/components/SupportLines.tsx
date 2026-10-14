import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, spacing } from '../constants/theme';

// Free, 24/7 support lines, shown whenever something sounds like someone
// might be in danger. Each row calls or texts straight from the phone.
const LINES: { label: string; detail: string; url: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Call or text 988', detail: 'Suicide & Crisis Lifeline (US) · 24/7', url: 'tel:988', icon: 'call' },
  { label: 'Text HOME to 741741', detail: 'Crisis Text Line (US) · 24/7', url: 'sms:741741?body=HOME', icon: 'chatbubble-ellipses' },
  { label: 'Korea: 109 · Teens: 1388', detail: '자살예방상담 109 · 청소년상담 1388', url: 'tel:109', icon: 'call' },
];

export default function SupportLines({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{compact ? "If you're worried about them" : "You don't have to carry this alone 💛"}</Text>
      <Text style={styles.sub}>
        {compact
          ? 'Tell a trusted adult, or share these free lines that are open 24/7.'
          : 'Talking to someone can help, right now. These are free and open 24/7. If you are in danger, call 911.'}
      </Text>
      {LINES.map((l) => (
        <TouchableOpacity
          key={l.label}
          style={styles.row}
          onPress={() => Linking.openURL(l.url).catch(() => {})}
          accessibilityRole="button"
          accessibilityLabel={`${l.label}, ${l.detail}`}
        >
          <View style={styles.icon}>
            <Ionicons name={l.icon} size={16} color={colors.warm.honeyInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{l.label}</Text>
            <Text style={styles.detail}>{l.detail}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(245,194,122,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,194,122,0.3)',
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
    marginTop: -4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.warm.honey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  detail: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
});
