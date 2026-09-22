import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_STYLES } from '../constants/categoryStyles';
import { spacing, radius, fontSize, fontFamily } from '../constants/theme';
import { PostCategory } from '../types';

type Props = {
  category: PostCategory;
  // 'sm' matches PostPreviewCard's original tighter pill (compact list
  // rows); 'md' matches Feed/PostDetailScreen's original slightly roomier
  // one. Previously each of these three screens hand-rolled its own near-
  // identical badge (same CATEGORY_STYLES lookup, slightly drifted padding/
  // gap/font-size) — consolidated here so all three stay in sync.
  size?: 'sm' | 'md';
};

export default function CategoryBadge({ category, size = 'md' }: Props) {
  const style = CATEGORY_STYLES[category];
  const compact = size === 'sm';

  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: style.bg }]}>
      <Ionicons name={style.icon} size={compact ? 11 : 12} color={style.text} />
      <Text style={[styles.text, compact && styles.textCompact, { color: style.text }]}>{category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeCompact: {
    gap: 3,
    paddingVertical: 3,
  },
  text: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
  },
  textCompact: {
    fontSize: 10,
  },
});
