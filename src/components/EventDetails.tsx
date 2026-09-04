import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, radius } from '../constants/theme';
import { Post } from '../types';

type Props = {
  post: Post;
};

// Renders a category === 'Event' post's date/time/location inline —
// anywhere a Post already shows up (FeedScreen's card, PostDetailScreen,
// PostPreviewCard). Renders nothing for every other category or if the
// event has no date set. Purely presentational, no fetch of its own.
export default function EventDetails({ post }: Props) {
  if (post.category !== 'Event' || !post.event_date) return null;

  const date = new Date(post.event_date);
  if (isNaN(date.getTime())) return null;

  const isPast = date.getTime() < Date.now();
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endDate = post.event_end_time ? new Date(post.event_end_time) : null;
  const endLabel = endDate && !isNaN(endDate.getTime())
    ? endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Ionicons name="calendar-outline" size={13} color={colors.primary} />
        <Text style={styles.text}>
          {dateLabel} · {timeLabel}
          {endLabel ? ` – ${endLabel}` : ''}
        </Text>
        {isPast && (
          <View style={styles.pastBadge}>
            <Text style={styles.pastBadgeText}>Past</Text>
          </View>
        )}
      </View>
      {post.event_location ? (
        <View style={styles.row}>
          <Ionicons name="location-outline" size={13} color={colors.textMid} />
          <Text style={styles.locationText}>{post.event_location}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  locationText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  pastBadge: {
    backgroundColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginLeft: 2,
  },
  pastBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    color: colors.textMid,
  },
});
