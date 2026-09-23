import { ReactNode } from 'react';
import { Text, TouchableOpacity, View, GestureResponderEvent, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { resolveSchoolName } from '../lib/schools';
import { formatRelativeTime } from '../lib/time';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

type PostAuthor = {
  full_name: string | null;
  avatar_url: string | null;
  school_name: string | null;
  school?: { name: string } | null;
};

type Props = {
  // Post.profiles is a nullable PostgREST embedded relation — null whenever
  // the author's profile row no longer joins (e.g. a deleted account). Feed
  // previously stayed tappable even then (it navigates by author_id, not
  // author.id); PostDetail already guarded this with disabled={!post.profiles}.
  // This component always applies PostDetail's existing guard, closing that
  // drift rather than adding a new policy.
  author: PostAuthor | null;
  createdAt: string;
  // The caller decides the destination (and, for Feed, whether to
  // e.stopPropagation() since its whole card is itself tappable) — this
  // component performs no navigation of its own.
  onPress: (e: GestureResponderEvent) => void;
  // Feed's cards use 42, PostDetail's use 44 — kept as the callers' exact
  // existing values rather than picked to match one and drift the other.
  avatarSize?: number;
  // Feed's post-menu button sits as a sibling in this same header row;
  // PostDetail has none.
  trailing?: ReactNode;
};

export default function PostAuthorHeader({ author, createdAt, onPress, avatarSize = 42, trailing }: Props) {
  const schoolName = author ? resolveSchoolName(author) : null;
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerUser} disabled={!author} onPress={onPress}>
        <Avatar uri={author?.avatar_url} size={avatarSize} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{author?.full_name ?? 'Unknown'}</Text>
          {schoolName ? <Text style={styles.school}>{schoolName}</Text> : null}
        </View>
      </TouchableOpacity>
      <Text style={styles.timestamp}>{formatRelativeTime(createdAt)}</Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  school: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
});
