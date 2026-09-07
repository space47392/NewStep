import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, radius } from '../constants/theme';
import { Post } from '../types';

type Props = {
  post: Post;
};

// True once an Event's start time has passed — shared by EventDetails' own
// "Past" badge and by FeedScreen/PostDetailScreen, which use it to decide
// whether the interactive InterestButton still makes sense to show (Step 32).
// Not exported for non-Event posts or unparseable dates — callers should
// treat those as "not past" (i.e. don't special-case them).
export function isEventPast(post: Post): boolean {
  if (post.category !== 'Event' || !post.event_date) return false;
  const date = new Date(post.event_date);
  return !isNaN(date.getTime()) && date.getTime() < Date.now();
}

// "6:25 PM" -> "PM" / "AM" — the locale string's last 2 characters, regardless
// of which space character precedes them (regular vs. narrow no-break space,
// which some JS engines use for Intl-formatted times).
function meridiemOf(timeLabel: string): string {
  return timeLabel.slice(-2);
}

// Compact time-range formatting: "6:25–8:25 PM" when both ends share a
// meridiem (the common case), "11:30 AM – 1:30 PM" when they don't, or just
// "6:25 PM" with no end time — never "Start: ... / End: ...", never a raw
// ISO timestamp.
function formatTimeRange(start: Date, end: Date | null): string {
  const startLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (!end) return startLabel;

  const endLabel = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (meridiemOf(startLabel) === meridiemOf(endLabel)) {
    return `${startLabel.slice(0, -3)}–${endLabel}`;
  }
  return `${startLabel} – ${endLabel}`;
}

// Renders a category === 'Event' post's date/time/location/interested-count
// inline — anywhere a Post already shows up (FeedScreen's card,
// PostDetailScreen, PostPreviewCard). Renders nothing for every other
// category or if the event has no date set. Purely presentational, no fetch
// of its own. One shared implementation for every screen (Step 32) — Feed
// stays compact and PostDetail reads as slightly roomier purely from its own
// surrounding layout (larger content font, more margin around this block),
// not from a second version of this component.
export default function EventDetails({ post }: Props) {
  if (post.category !== 'Event' || !post.event_date) return null;

  const date = new Date(post.event_date);
  if (isNaN(date.getTime())) return null;

  const isPast = isEventPast(post);
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDate = post.event_end_time ? new Date(post.event_end_time) : null;
  const timeRangeLabel = formatTimeRange(date, endDate && !isNaN(endDate.getTime()) ? endDate : null);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Ionicons name="calendar-outline" size={13} color={colors.primary} />
        <Text style={styles.dateText}>
          {dateLabel} · {timeRangeLabel}
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
      <View style={styles.row}>
        <Ionicons name="star-outline" size={12} color={colors.textLight} />
        <Text style={styles.interestedText}>{post.interested_count} interested</Text>
      </View>
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
    gap: 4,
  },
  // Most prominent line — date/time is the first thing worth scanning after
  // the post content itself.
  dateText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  // Secondary — present only when set, no reserved space otherwise.
  locationText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  // Lightest of the three — a passive count, not a call to action (the real
  // action is InterestButton, rendered separately by the caller).
  interestedText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
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
