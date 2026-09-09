import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchFollowers, fetchFollowing, fetchFollowingIds, followUser, unfollowUser } from '../../lib/follows';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import PrimaryButton from '../../components/PrimaryButton';
import { ConversationRowSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, PersonSearchResult } from '../../types';

const PAGE_SIZE = 30;

// One screen for both directions — followers and following are the exact
// same card shape and interaction, just a different underlying query. No
// reason to duplicate a screen for what's really one list pattern.
export default function FollowListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'FollowList'>>();
  const { userId, mode } = route.params;
  const { user } = useAuth();

  const [people, setPeople] = useState<PersonSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after the list has ever loaded shows a
  // toast-free preserved list instead (there's no toast context needed here
  // since nothing visible changes — same call as NotificationsScreen, Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);
  // Tracks how many raw rows have actually been consumed so far — deliberately
  // NOT people.length, since blocked users are filtered out client-side after
  // the fetch and would otherwise shrink the offset below what's already been
  // fetched, duplicating people on the next "Load more" (Step 37).
  const rawOffsetRef = useRef(0);
  const blockedIdsRef = useRef<Set<string>>(new Set());

  // The ids the CURRENT viewer (not the profile being looked at) follows —
  // powers each row's own Follow/Following button, independent of whose
  // followers/following list is being viewed.
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(new Set());

  const fetchPage = mode === 'followers' ? fetchFollowers : fetchFollowing;

  const loadFirstPage = useCallback(async () => {
    try {
      const [data, blockedIds, myFollowingIds] = await Promise.all([
        fetchPage(userId, PAGE_SIZE, 0),
        user ? fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
        user ? fetchFollowingIds(user.id).catch(() => [] as string[]) : Promise.resolve([] as string[]),
      ]);
      blockedIdsRef.current = blockedIds;
      // UX filtering only, not a security boundary — see blocks.ts.
      const visible = data.filter((p) => !blockedIds.has(p.id));
      setPeople(visible);
      setFollowingIds(new Set(myFollowingIds));
      rawOffsetRef.current = data.length;
      setHasMore(data.length === PAGE_SIZE);
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      // Only a genuinely first-ever failure (nothing has ever successfully
      // loaded) shows the blocking ErrorState — a failed background refresh
      // just leaves the existing list as-is (Step 36/37).
      if (!hasEverLoadedRef.current) {
        setLoadFailed(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode, user]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadFirstPage();
        setLoading(false);
      })();
    }, [loadFirstPage])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadFirstPage();
    setRetrying(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchPage(userId, PAGE_SIZE, rawOffsetRef.current);
      setPeople((prev) => [...prev, ...more.filter((p) => !blockedIdsRef.current.has(p.id))]);
      rawOffsetRef.current += more.length;
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // Following → confirm first, same wording/pattern as UserProfileScreen's
  // handleFollowPress. Not following → follow immediately. Optimistic on
  // success only — nothing changes on screen until the request actually
  // succeeds, so there's nothing to roll back on failure beyond clearing the
  // in-flight guard.
  const handleToggleFollow = (person: PersonSearchResult) => {
    if (!user || person.id === user.id || pendingFollowIds.has(person.id)) return;
    const currentlyFollowing = followingIds.has(person.id);

    if (currentlyFollowing) {
      Alert.alert(`Unfollow ${person.full_name ?? 'this user'}?`, "You won't see their posts in your Following feed.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            setPendingFollowIds((prev) => new Set(prev).add(person.id));
            try {
              await unfollowUser({ followerId: user.id, followingId: person.id });
              setFollowingIds((prev) => {
                const next = new Set(prev);
                next.delete(person.id);
                return next;
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Could not unfollow.';
              Alert.alert('Error', message);
            } finally {
              setPendingFollowIds((prev) => {
                const next = new Set(prev);
                next.delete(person.id);
                return next;
              });
            }
          },
        },
      ]);
      return;
    }

    (async () => {
      setPendingFollowIds((prev) => new Set(prev).add(person.id));
      try {
        await followUser({ followerId: user.id, followingId: person.id });
        setFollowingIds((prev) => new Set(prev).add(person.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not follow this user.';
        Alert.alert('Error', message);
      } finally {
        setPendingFollowIds((prev) => {
          const next = new Set(prev);
          next.delete(person.id);
          return next;
        });
      }
    })();
  };

  const goToSearch = () => navigation.navigate('Tabs', { screen: 'Search' });

  if (loading) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.list}>
          <Text style={styles.title}>{mode === 'followers' ? 'Followers' : 'Following'}</Text>
          <ConversationRowSkeleton />
          <ConversationRowSkeleton />
          <ConversationRowSkeleton />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={<Text style={styles.title}>{mode === 'followers' ? 'Followers' : 'Following'}</Text>}
        ListEmptyComponent={
          loadFailed ? (
            <ErrorState onRetry={handleRetry} retrying={retrying} />
          ) : (
            <View>
              <EmptyState
                icon="people-outline"
                title={mode === 'followers' ? 'No followers yet' : "You're not following anyone yet"}
                subtitle={
                  mode === 'followers'
                    ? 'When someone follows this account, they will show up here.'
                    : 'Find classmates to follow from Search.'
                }
              />
              {/* Followers: no forced CTA — there's no useful action to offer
                  on someone else's follower count. Following: Search already
                  is this app's discovery surface (school members, contributors,
                  people-you-may-know all live there), so it's a clean existing
                  route rather than a new one built just for this empty state. */}
              {mode === 'following' && (
                <PrimaryButton
                  title="Discover Students"
                  icon="search-outline"
                  variant="outline"
                  onPress={goToSearch}
                  style={styles.emptyActionButton}
                />
              )}
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isSelf = user?.id === item.id;
          const pending = pendingFollowIds.has(item.id);
          const following = followingIds.has(item.id);
          return (
            <FadeInView delay={Math.min(index, 6) * 30}>
              <View style={styles.row}>
                {/* Separate touchable from the Follow button below (not
                    nested) — two sibling touch targets, same structure
                    SearchScreen's "People You May Know" card already uses,
                    so tapping Follow can never also trigger the profile
                    navigation underneath it. */}
                <TouchableOpacity
                  style={styles.rowMain}
                  onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${item.full_name ?? 'this user'}'s profile`}
                >
                  <Avatar uri={item.avatar_url} size={48} />
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{item.full_name ?? 'Unknown'}</Text>
                    {item.username ? <Text style={styles.username}>@{item.username}</Text> : null}
                    {item.school_name ? (
                      <Text style={styles.meta}>
                        {item.school_name}
                        {item.grade ? ` · Grade ${item.grade}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {!isSelf && user ? (
                  <PrimaryButton
                    title={following ? 'Following' : 'Follow'}
                    icon={following ? 'checkmark' : 'person-add-outline'}
                    variant={following ? 'outline' : undefined}
                    onPress={() => handleToggleFollow(item)}
                    loading={pending}
                    style={styles.followButton}
                  />
                ) : null}
              </View>
            </FadeInView>
          );
        }}
        ListFooterComponent={
          hasMore && people.length > 0 ? (
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
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  username: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 1,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  // Same PrimaryButton every other Follow action in the app uses (see
  // UserProfileScreen/SearchScreen) — just narrow enough to sit inline in a
  // row instead of stretching full-width.
  followButton: {
    width: 104,
  },
  emptyActionButton: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.xl,
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
