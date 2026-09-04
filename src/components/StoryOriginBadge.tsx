import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// Shown on a Help post created via a School Story's "I Can Help" action
// (post.source_story_id is set) — pure presentation, no fetch, no join back
// to the story itself, and no author name (that context is ephemeral, shown
// only in CreatePostScreen's compose banner, never persisted — see
// posts_story_origin.sql). If the original story is later deleted,
// source_story_id becomes NULL (ON DELETE SET NULL) and this badge simply
// stops rendering; the post itself is completely unaffected either way.
export default function StoryOriginBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>🏫 From a School Story</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
});
