import { View, Text, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import HelpStatusPill from './HelpStatusPill';
import { useAuth } from '../contexts/AuthContext';
import CategoryBadge from './CategoryBadge';
import { formatRelativeTime } from '../lib/time';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';
import EventDetails from './EventDetails';
import PressableScale from './PressableScale';
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
  const { user } = useAuth();
  return (
    <PressableScale style={styles.card} pressedScale={0.98} haptic={false} onPress={onPress}>
      <View style={styles.header}>
        <Avatar uri={post.profiles?.avatar_url} size={32} />
        <View style={styles.headerText}>
          <Text style={styles.author}>{post.profiles?.full_name ?? 'Unknown'}</Text>
          <Text style={styles.timestamp}>{formatRelativeTime(post.created_at)}</Text>
        </View>
        {showCategory && <CategoryBadge category={post.category} size="sm" />}
      </View>
      <Text style={styles.content} numberOfLines={2}>
        {post.content}
      </Text>
      <EventDetails post={post} />
      {/* A "Need Help" result found via search may already be resolved — the
          same step tracker Feed/PostDetail use, so a search hit never looks
          indistinguishable from a still-open request (Step 43). Shown
          regardless of showCategory: even where the category label itself is
          hidden (already-known-category sections), the status is still new
          information worth showing. */}
      {post.category === 'Need Help' && (
        <View style={styles.status}>
          <HelpStatusPill status={post.status} helper={post.helper} offersToChoose={post.author_id === user?.id ? post.help_offer_count ?? 0 : 0} />
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
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
  status: {
    marginTop: spacing.sm,
  },
  content: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
    lineHeight: 19,
  },
});
