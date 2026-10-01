import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, radius } from '../constants/theme';
import { Post } from '../types';

type Props = {
  post: Post;
};

// True once an Event has actually ended — shared by EventDetails' own "Past"
// badge and by FeedScreen/PostDetailScreen, which use it to decide whether
// the interactive InterestButton still makes sense to show (Step 32).
// Mirrors posts.ts's fetchUpcomingEventsBySchool[ById]() "not past" filter:
// an event with event_end_time set is only past once THAT has gone by (a
// 2pm-5pm event is still very much current at 3pm, even though its
// event_date/start is already behind now()) — only falls back to event_date
// itself when there's no event_end_time at all. Not exported for non-Event
// posts or unparseable dates — callers should treat those as "not past"
// (i.e. don't special-case them).
export function isEventPast(post: Post): boolean {
  if (post.category !== 'Event' || !post.event_date) return false;
  if (post.event_end_time) {
    const end = new Date(post.event_end_time);
    return !isNaN(end.getTime()) && end.getTime() < Date.now();
  }
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
  const monthLabel = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const endDate = post.event_end_time ? new Date(post.event_end_time) : null;
  const timeRangeLabel = formatTimeRange(date, endDate && !isNaN(endDate.getTime()) ? endDate : null);

  // Styled as a ticket stub — the Event category's own signature, so an
  // event reads as "something to go to" at a glance rather than one more
  // text post.
  return (
    <View
      style={styles.ticket}
      accessible
      accessibilityLabel={`${dateLabel}, ${timeRangeLabel}${isPast ? ', past event' : ''}`}
    >
      <View style={[styles.stub, isPast && styles.stubPast]}>
        <Text style={[styles.stubMonth, isPast && styles.stubTextPast]}>{monthLabel}</Text>
        <Text style={[styles.stubDay, isPast && styles.stubTextPast]}>{date.getDate()}</Text>
      </View>

      {/* Dots rather than a dashed border — single-side dashed borders
          render unreliably on Android. */}
      <View style={styles.perforation}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.perforationDot} />
        ))}
      </View>

      <View style={[styles.details, isPast && styles.detailsPast]}>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={13} color={isPast ? colors.textLight : colors.primary} />
          <Text style={[styles.timeText, isPast && styles.mutedText]}>{timeRangeLabel}</Text>
        </View>
        {post.event_location ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={13} color={colors.textMid} />
            <Text style={styles.locationText} numberOfLines={1}>
              {post.event_location}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Ionicons name="star-outline" size={12} color={colors.textLight} />
          <Text style={styles.interestedText}>{post.interested_count} interested</Text>
        </View>
      </View>

      {isPast && (
        <View style={styles.pastStamp}>
          <Text style={styles.pastStampText}>PAST</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  stub: {
    width: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  stubPast: {
    backgroundColor: colors.border,
  },
  stubMonth: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: '#fff',
  },
  stubDay: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xl,
    lineHeight: 26,
    color: '#fff',
  },
  stubTextPast: {
    color: colors.textLight,
  },
  perforation: {
    justifyContent: 'space-evenly',
    marginHorizontal: spacing.sm,
  },
  perforationDot: {
    width: 3,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  details: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  // Leaves room for the PAST stamp so a long time range never runs under it.
  detailsPast: {
    paddingRight: spacing.xl + spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  mutedText: {
    color: colors.textMid,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  // A passive count, not a call to action (the real action is
  // InterestButton, rendered separately by the caller).
  interestedText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  pastStamp: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.textLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    transform: [{ rotate: '-8deg' }],
  },
  pastStampText: {
    fontFamily: fontFamily.extrabold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textLight,
  },
});
