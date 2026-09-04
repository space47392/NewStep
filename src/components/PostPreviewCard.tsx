import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { formatRelativeTime } from '../lib/time';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';
import { CATEGORY_STYLES } from '../constants/categoryStyles';
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
  const category = CATEGORY_STYLES[post.category];

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.header}>
        <Avatar uri={post.profiles?.avatar_url} size={32} />
        <View style={styles.headerText}>
          <Text style={styles.author}>{post.profiles?.full_name ?? 'Unknown'}</Text>
          <Text style={styles.timestamp}>{formatRelativeTime(post.created_at)}</Text>
        </View>
        {showCategory && (
          <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
            <Ionicons name={category.icon} size={11} color={category.text} />
            <Text style={[styles.categoryText, { color: category.text }]}>{post.category}</Text>
          </View>
        )}
      </View>
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
    borderRadius: radius.md,
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
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  categoryText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
  content: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
    lineHeight: 19,
  },
});
