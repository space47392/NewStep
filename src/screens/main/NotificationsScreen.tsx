import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchNotifications,
  markNotificationsRead,
  formatGroupedNotificationMessage,
  getNotificationIcon,
  getNotificationCategoryColor,
  resolveNotificationTarget,
  groupNotifications,
  NotificationGroup,
} from '../../lib/notifications';
import { fetchPostById } from '../../lib/posts';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { AppNotification, MainStackParamList } from '../../types';

const PAGE_SIZE = 20;

// Defensive backstop for "Load more" appends — same principle as Feed's
// dedupeAppend() (Step 48), reimplemented locally here rather than shared,
// since this list's rows are AppNotification, not Post. Filters out any
// addition whose id is already in the list before appending.
function dedupeAppendNotifications(prev: AppNotification[], additions: AppNotification[]): AppNotification[] {
  const existingIds = new Set(prev.map((n) => n.id));
  return [...prev, ...additions.filter((n) => !existingIds.has(n.id))];
}

// Splits the list into "Today / This week / Earlier" so a long list reads
// like a timeline instead of one undifferentiated column.
function timeBucket(iso: string): string {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startOfToday.getTime()) return 'Today';
  if (t >= startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000) return 'This week';
  return 'Earlier';
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after notifications have ever loaded just
  // leaves the list as-is (already the existing behavior below), it doesn't
  // need a toast since nothing visible changes (Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);
  // Cursor-based pagination (Step 58) — the oldest RAW notification's
  // created_at loaded so far, or null once there's nothing more. Derived
  // from the raw `notifications` array, never from `grouped` — grouping is
  // purely a display transform (fewer rendered rows than raw rows), so
  // using its length/last entry as a cursor would desync pagination from
  // what's actually been fetched.
  const cursorRef = useRef<string | null>(null);
  // Bumped only on a full replace (first load / pull-to-refresh / retry),
  // never on "Load more" — a Load More in flight when a replace starts is
  // stale by the time it resolves and must not be appended on top of the
  // fresh replacement (same *LoadTokenRef pattern as Feed/FollowList/
  // SavedPosts, Step 48/49).
  const loadTokenRef = useRef(0);
  // Synchronous re-entrancy guard for handlePress — same purpose as Feed's
  // openingPostRef (Step 34): openingId (state) can't rule out a second tap
  // landing before React re-renders with the row disabled; a ref can.
  const openingGroupIdRef = useRef<string | null>(null);
  // If the user backs out of this screen while handlePressInner's PostDetail
  // fetch is still in flight, navigation itself isn't tied to this
  // component's lifecycle — calling navigation.navigate() after that would
  // still actually navigate, surprising the user with a screen they thought
  // they'd already left behind. Checked right before that one call, which is
  // the only branch with a meaningful await between the tap and the navigate.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Purely a display transform — groupNotifications() never mutates or drops
  // the underlying rows, so pagination/mark-as-read below still operate on
  // real notification ids.
  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);

  const loadFirstPage = useCallback(async (mode: 'replace' | 'merge' = 'replace') => {
    if (!user) return;
    const tokenAtStart = ++loadTokenRef.current;
    // Computed before the fetch, from refs only (no stale-closure risk) —
    // the very first page ever loaded always behaves like 'replace' even
    // when called with 'merge', since there's nothing yet to preserve.
    const isFirstEverPage = cursorRef.current === null && !hasEverLoadedRef.current;
    try {
      const data = await fetchNotifications(user.id, PAGE_SIZE);
      // A newer replace (another refresh/retry) already started after this
      // one — let its result stick instead of this now-stale response.
      if (loadTokenRef.current !== tokenAtStart) return;

      if (mode === 'merge' && !isFirstEverPage) {
        // Revalidates page 1 in place (picks up read/unread and actor
        // changes, prepends anything genuinely new) without touching the
        // cursor/hasMore — refocusing this screen (e.g. returning from a
        // notification's destination) must not silently discard any extra
        // pages already loaded via "Load more" the way a full replace would.
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newOnes = data.filter((n) => !existingIds.has(n.id));
          const merged = prev.map((n) => data.find((d) => d.id === n.id) ?? n);
          return [...newOnes, ...merged];
        });
      } else {
        setNotifications(data);
        cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null;
        setHasMore(data.length === PAGE_SIZE);
      }
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (loadTokenRef.current !== tokenAtStart) return;
      // Only a genuinely first-ever failure (nothing has ever successfully
      // loaded) shows the blocking ErrorState — a failed background refresh
      // just leaves the existing list as-is (Step 36).
      if (!hasEverLoadedRef.current) {
        setLoadFailed(true);
      }
    } finally {
      if (loadTokenRef.current === tokenAtStart) setLoading(false);
    }
  }, [user]);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadFirstPage();
    setRetrying(false);
  };

  // Pull-to-refresh — reuses loadFirstPage() exactly as-is (same fetch, same
  // pagination reset, same success/failure handling), so a fresh pull always
  // reflects the current server state (unread/read included) without a
  // second fetch implementation. Guarded the same way handleRetry already is
  // above, so a fast repeated pull can't dispatch overlapping requests. Does
  // NOT mark anything read — same as opening the screen itself (Step 44).
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  // Refetches on every focus (e.g. returning from a notification's
  // destination) — but does NOT mark anything read just from opening the
  // screen; only tapping an individual notification does that.
  useFocusEffect(
    useCallback(() => {
      loadFirstPage('merge');
    }, [loadFirstPage])
  );

  const handleLoadMore = async () => {
    if (!user || loadingMore || !hasMore || !cursorRef.current) return;
    const tokenAtStart = loadTokenRef.current;
    setLoadingMore(true);
    try {
      const more = await fetchNotifications(user.id, PAGE_SIZE, cursorRef.current);
      // A refresh/retry fully replaced the list while this was in flight —
      // that response describes a list that no longer exists, so it must
      // never be appended on top of the fresh one (Step 48's Scenario A
      // guard, reused here).
      if (loadTokenRef.current !== tokenAtStart) return;

      setNotifications((prev) => dedupeAppendNotifications(prev, more));
      cursorRef.current = more.length > 0 ? more[more.length - 1].created_at : cursorRef.current;
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      if (loadTokenRef.current === tokenAtStart) {
        setHasMore(false);
      }
    } finally {
      // Always cleared, even for a discarded stale response — this is just
      // this button's own spinner, not part of the list data a stale
      // response could corrupt.
      setLoadingMore(false);
    }
  };

  // Only what's loaded is marked — the list is the student's view of
  // "all", and older pages they haven't scrolled to stay as they are.
  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    markNotificationsRead(unreadIds).catch(() => showToast("Couldn't mark everything as read"));
  };

  const handlePress = async (group: NotificationGroup) => {
    if (openingGroupIdRef.current === group.id) return;
    openingGroupIdRef.current = group.id;
    try {
      await handlePressInner(group);
    } finally {
      openingGroupIdRef.current = null;
    }
  };

  const handlePressInner = async (group: NotificationGroup) => {
    if (!group.read_at) {
      markNotificationsRead(group.memberIds).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (group.memberIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n))
      );
    }

    const target = resolveNotificationTarget({
      type: group.type,
      post_id: group.post_id,
      conversation_id: group.conversation_id,
      actor_id: group.actor?.id ?? null,
    });
    // No usable destination — e.g. a follow/story_wave notification whose
    // actor deleted their account and (Step 58) this group had no other
    // live actor to fall back to. Never invents a destination; just says so
    // instead of a silent, unexplained no-op tap (Step 60, P2 #2). Message
    // notifications (Step 56E) and grouped-actor fallback (Step 58) already
    // resolve to a real target whenever one exists, so this only fires when
    // there genuinely is nowhere to go.
    if (!target) {
      showToast('This is no longer available');
      return;
    }

    setOpeningId(group.id);
    try {
      if (target.screen === 'PostDetail') {
        const post = await fetchPostById(target.postId);
        if (!isMountedRef.current) return;
        navigation.navigate('PostDetail', { post });
      } else if (target.screen === 'Conversation') {
        // group.actor may be null — the other participant has since deleted
        // their account (Step 56E). The conversation itself is preserved
        // (resolveNotificationTarget() only requires conversation_id now,
        // not actor_id), so this still opens it rather than showing "no
        // longer available": ConversationScreen already renders a null
        // otherUser as "Deleted User" with historical messages intact and
        // no profile navigation (Step 56C).
        navigation.navigate('Conversation', { conversationId: target.conversationId, otherUser: group.actor });
      } else if (target.screen === 'UserProfile') {
        navigation.navigate('UserProfile', { userId: target.userId });
      } else {
        // points_earned / achievement_earned
        navigation.navigate('Tabs', { screen: 'Profile' });
      }
    } catch {
      // e.g. the post was deleted, or the conversation/user is gone since —
      // stay on this screen but say so, rather than a silent no-op tap
      // (Step 34). Never surface the raw error, just a friendly, context-
      // appropriate message.
      const message =
        target.screen === 'PostDetail'
          ? 'This post is no longer available'
          : target.screen === 'Conversation'
            ? 'This conversation is no longer available'
            : target.screen === 'UserProfile'
              ? 'This profile is no longer available'
              : 'This is no longer available';
      showToast(message);
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <FlatList
        data={grouped}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.titleRow}>
            <Text style={styles.title}>Notifications</Text>
            {notifications.some((n) => !n.read_at) && (
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={handleMarkAllRead}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-done" size={16} color={colors.primary} />
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          loadFailed ? (
            <ErrorState onRetry={handleRetry} retrying={retrying} />
          ) : (
            <EmptyState
              icon="notifications-outline"
              emoji="✨"
              title="You're all caught up"
              subtitle="No new activity yet."
            />
          )
        }
        renderItem={({ item, index }) => {
          const unread = !item.read_at;
          const bucket = timeBucket(item.created_at);
          const showBucket = index === 0 || timeBucket(grouped[index - 1].created_at) !== bucket;
          return (
            <FadeInView delay={Math.min(index, 6) * 30}>
              {showBucket && <Text style={styles.bucketLabel}>{bucket}</Text>}
              <TouchableOpacity
                style={[
                  styles.row,
                  unread && styles.rowUnread,
                ]}
                activeOpacity={0.85}
                disabled={openingId === item.id}
                onPress={() => handlePress(item)}
              >
                {unread && <View style={styles.unreadDot} />}
                {item.actor ? (
                  <View style={styles.avatarWrap}>
                    <Avatar uri={item.actor.avatar_url} size={44} />
                    <View style={[styles.typeBadge, { backgroundColor: getNotificationCategoryColor(item.type) }]}>
                      <Text style={styles.typeBadgeText}>{getNotificationIcon(item.type)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.iconAvatar, { backgroundColor: colors.warningLight }]}>
                    <Text style={styles.iconAvatarText}>{getNotificationIcon(item.type)}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={[styles.message, unread && styles.messageUnread]}>
                    {formatGroupedNotificationMessage(item)}
                  </Text>
                  <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
                </View>
                {openingId === item.id && <ActivityIndicator size="small" color={colors.primary} />}
              </TouchableOpacity>
            </FadeInView>
          );
        }}
        ListFooterComponent={
          hasMore && notifications.length > 0 ? (
            <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bucketLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  list: {
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  markAllText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small tinted circle on the avatar's corner saying what kind of
  // notification this is (help / message / social / achievement).
  typeBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeText: {
    fontSize: 11,
  },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowUnread: {
    backgroundColor: colors.primaryLight,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  iconAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconAvatarText: {
    fontSize: 20,
  },
  rowText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  messageUnread: {
    fontFamily: fontFamily.semibold,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
