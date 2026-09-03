import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';
import { PostStatus } from '../types';

// Small, friendly state pill for "Need Help" posts — Open/Helping/Completed —
// shared by FeedScreen and PostDetailScreen so the same three colors/labels
// mean the same thing everywhere, rather than each screen inventing its own.
// Pure presentation: reads post.status, never writes it.
const STATUS_CONFIG: Record<PostStatus, { emoji: string; label: string; bg: string; text: string }> = {
  open: { emoji: '🟢', label: 'Open', bg: colors.border, text: colors.textMid },
  accepted: { emoji: '🤝', label: 'Helping', bg: colors.primaryLight, text: colors.primary },
  // Same accentLight/success pairing PostDetailScreen's helper card already
  // used for "completed" before this — kept consistent rather than invented fresh.
  completed: { emoji: '✅', label: 'Completed', bg: colors.accentLight, text: colors.success },
};

export default function HelpStatusBadge({ status }: { status: PostStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>
        {config.emoji} {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  text: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
  },
});
