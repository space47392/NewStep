import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import HelpStatusBadge from './HelpStatusBadge';
import CategoryBadge from './CategoryBadge';
import { formatRelativeTime } from '../lib/time';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';
import EventDetails from './EventDetails';
import { Post } from '../types';

type Props = {
  post: Post;
  onPress: () => void;
  // Hidden inside a single-category section (e.g. SchoolScreen's "Recent
  // Help") where every card would show the same badge — shown by default.
  showCategory?: boolean;
};

// A compact, read-only post preview — anywhere a post shows up as part of a
// list rather than the main feed (SchoolScreen's sections, SearchScreen's
// post results). No like/comment/volunteer controls of its own; tapping
// always goes to the real PostDetailScreen for full interaction.
export default function PostPreviewCard({ post, onPress, showCategory = true }: Props) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.header}>
        <Avatar uri={post.profiles?.avatar_url} size={32} />
        <View style={styles.headerText}>
          <Text style={styles.author}>{post.profiles?.full_name ?? 'Unknown'}</Text>
          <Text style={styles.timestamp}>{formatRelativeTime(post.created_at)}</Text>
        </View>
        {showCategory && <CategoryBadge category={post.category} size="sm" />}
      </View>
      {/* A "Need Help" result found via search may already be resolved — the
          same status pill Feed/PostDetail already use, so a search hit never
          looks indistinguishable from a still-open request (Step 43). Shown
          regardless of showCategory: even where the category label itself is
          hidden (already-known-category sections), the status is still new
          information worth showing. */}
      {post.category === 'Need Help' && (
        <View style={styles.statusRow}>
          <HelpStatusBadge status={post.status} />
        </View>
      )}
      <Text style={styles.content} numberOfLines={2}>
        {post.content}
      </Text>
      <EventDetails post={post} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    // Matches the radius every other primary card in the app already uses
    // (Feed/Post Detail/Profile/Notifications/Follow lists/School) — this
    // component alone used the smaller radius.md, which read as visually
    // inconsistent wherever a preview card sits near one of those (Search,
    // Help, School, Saved Posts).
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  author: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  statusRow: {
    marginBottom: spacing.xs,
  },
  content: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
    lineHeight: 19,
  },
});
