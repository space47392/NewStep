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

// tone 'light' is for the bright, cream screens (e.g. the star composer).
export default function SupportLines({ compact = false, tone = 'dark' }: { compact?: boolean; tone?: 'dark' | 'light' }) {
  const light = tone === 'light';
  return (
    <View style={[styles.box, light && styles.boxLight]}>
      <Text style={[styles.title, light && styles.titleLight]}>{compact ? "If you're worried about them" : "You don't have to carry this alone 💛"}</Text>
      <Text style={[styles.sub, light && styles.subLight]}>
        {compact
          ? 'Tell a trusted adult, or share these free lines that are open 24/7.'
          : 'Talking to someone can help, right now. These are free and open 24/7. If you are in danger, call 911.'}
      </Text>
      {LINES.map((line) => (
        <TouchableOpacity
          key={line.label}
          style={styles.row}
          onPress={() => Linking.openURL(line.url).catch(() => {})}
          accessibilityRole="button"
          accessibilityLabel={`${line.label}, ${line.detail}`}
        >
          <View style={styles.icon}>
            <Ionicons name={line.icon} size={16} color={colors.warm.honeyInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, light && styles.labelLight]}>{line.label}</Text>
            <Text style={[styles.detail, light && styles.detailLight]}>{line.detail}</Text>
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
  boxLight: {
    backgroundColor: '#FFF6E6',
    borderColor: '#F6DFB4',
  },
  title: {
    fontFamily: fontFamily.brand,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  titleLight: {
    color: colors.textDark,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
    marginTop: -4,
  },
  subLight: {
    color: colors.textMid,
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
  labelLight: {
    color: colors.textDark,
  },
  detail: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.warm.creamFaint,
  },
  detailLight: {
    color: colors.textMid,
  },
});
