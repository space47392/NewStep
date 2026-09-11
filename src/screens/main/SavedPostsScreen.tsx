import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchSavedPosts } from '../../lib/postSaves';
import { fetchBlockedUserIds } from '../../lib/blocks';
import PostPreviewCard from '../../components/PostPreviewCard';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import PrimaryButton from '../../components/PrimaryButton';
import { PostCardSkeleton } from '../../components/Skeleton';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, Post } from '../../types';

const PAGE_SIZE = 20;

// Defensive backstop for "Load more" appends — same principle as Feed's
// dedupeAppend() (Step 48), reimplemented locally here rather than shared.
// Filters out any addition whose id is already in the list before appending.
function dedupeAppendPosts(prev: Post[], additions: Post[]): Post[] {
  const existingIds = new Set(prev.map((p) => p.id));
  return [...prev, ...additions.filter((p) => !existingIds.has(p.id))];
}

// Reachable only from the user's own Profile — saved posts are private
// regardless (post_saves' RLS scopes every read to auth.uid()), this screen
// just never gives anyone a reason to try viewing someone else's.
export default function SavedPostsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after posts have ever loaded shows a toast
  // instead and keeps the existing list untouched (Step 36/37).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);
  // Cursor-based pagination (Step 49, P1 #5) — the post_saves.created_at
  // (when the save happened, not when the post was made — see
  // fetchSavedPosts()) of the last raw row fetched so far, or null once
  // there's nothing more. Replaces the old numeric offset, which drifted
  // (duplicating/skipping posts on "Load more") whenever a new post was
  // saved while this list was being paged — the same class of bug Step 48
  // fixed for the Feed.
  const cursorRef = useRef<string | null>(null);
  // Fetched once per load (not once per "Load more" page) and reused for
  // pagination below — refetching it on every page would be a needless
  // repeated query for data that doesn't change mid-session (Step 37).
  const blockedIdsRef = useRef<Set<string>>(new Set());
  // Bumped only on a full replace (first load / pull-to-refresh / retry),
  // never on "Load more" — mirrors FollowListScreen/Step 48's *LoadTokenRef.
  const loadTokenRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    if (!user) return;
    const tokenAtStart = ++loadTokenRef.current;
    try {
      const [{ posts: data, rawCount, nextCursor }, blockedIds] = await Promise.all([
        fetchSavedPosts(user.id, PAGE_SIZE),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);
      // A newer replace (another refresh/retry) already started after this
      // one — let its result stick instead of this now-stale response.
      if (loadTokenRef.current !== tokenAtStart) return;

      blockedIdsRef.current = blockedIds;
      // UX filtering only, not a security boundary — see blocks.ts.
      const visible = data.filter((p) => !blockedIds.has(p.author_id));
      setPosts(visible);
      cursorRef.current = nextCursor;
      setHasMore(rawCount === PAGE_SIZE);
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (loadTokenRef.current !== tokenAtStart) return;
      // Only a genuinely first-ever failure (no saved posts have ever
      // successfully loaded) shows the blocking ErrorState — a failed
      // background refresh keeps the existing list and just says so (Step 36).
      if (hasEverLoadedRef.current) {
        showToast("Couldn't refresh your saved posts");
      } else {
        setLoadFailed(true);
      }
    }
  }, [user, showToast]);

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
    if (!user || loadingMore || !hasMore || !cursorRef.current) return;
    const tokenAtStart = loadTokenRef.current;
    setLoadingMore(true);
    try {
      const { posts: more, rawCount, nextCursor } = await fetchSavedPosts(user.id, PAGE_SIZE, cursorRef.current);
      // A refresh/retry fully replaced the list while this was in flight —
      // that response describes a list that no longer exists, so it must
      // never be appended on top of the fresh one (Step 49, P1 #5, mirroring
      // Step 48's Scenario A guard).
      if (loadTokenRef.current !== tokenAtStart) return;

      setPosts((prev) => dedupeAppendPosts(prev, more.filter((p) => !blockedIdsRef.current.has(p.author_id))));
      cursorRef.current = nextCursor;
      setHasMore(rawCount === PAGE_SIZE);
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

  const goToFeed = () => navigation.navigate('Tabs', { screen: 'Feed' });

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
          <Text style={styles.title}>🔖 Saved Posts</Text>
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
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
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={<Text style={styles.title}>🔖 Saved Posts</Text>}
        ListEmptyComponent={
          loadFailed ? (
            <ErrorState onRetry={handleRetry} retrying={retrying} />
          ) : (
            <View>
              <EmptyState
                icon="bookmark-outline"
                title="🔖 No saved posts yet"
                subtitle="Save posts to find them here later."
              />
              <PrimaryButton
                title="Explore Posts"
                icon="compass-outline"
                variant="outline"
                onPress={goToFeed}
                style={styles.emptyActionButton}
              />
            </View>
          )
        }
        renderItem={({ item }) => (
          <PostPreviewCard post={item} onPress={() => navigation.navigate('PostDetail', { post: item })} />
        )}
        ListFooterComponent={
          hasMore && posts.length > 0 ? (
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
