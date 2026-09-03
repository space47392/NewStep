import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSavedPosts } from '../../lib/postSaves';
import { fetchBlockedUserIds } from '../../lib/blocks';
import PostPreviewCard from '../../components/PostPreviewCard';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, Post } from '../../types';

const PAGE_SIZE = 20;

// Reachable only from the user's own Profile — saved posts are private
// regardless (post_saves' RLS scopes every read to auth.uid()), this screen
// just never gives anyone a reason to try viewing someone else's.
export default function SavedPostsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadFirstPage = useCallback(async () => {
    if (!user) return;
    try {
      const [data, blockedIds] = await Promise.all([
        fetchSavedPosts(user.id, PAGE_SIZE, 0),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);
      // UX filtering only, not a security boundary — see blocks.ts.
      const visible = data.filter((p) => !blockedIds.has(p.author_id));
      setPosts(visible);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // leave whatever was already loaded
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const handleLoadMore = async () => {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchSavedPosts(user.id, PAGE_SIZE, posts.length);
      setPosts((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.title}>Saved Posts</Text>}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            title="No saved posts yet"
            subtitle="Tap the bookmark icon on any post to save it here."
          />
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
