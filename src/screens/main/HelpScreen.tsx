import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById } from '../../lib/profile';
import { fetchPostsBySchool, fetchPostsBySchoolId } from '../../lib/posts';
import { fetchBlockedUserIds } from '../../lib/blocks';
import PostPreviewCard from '../../components/PostPreviewCard';
import EmptyState from '../../components/EmptyState';
import { PostCardSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, Post } from '../../types';

const HELP_LIMIT = 20;

// Step 30: replaces the "Coming soon" placeholder with a real list — the
// underlying Need Help / volunteer / completed flow already exists in full
// (posts.ts, secure_help_lifecycle.sql); this just gives it the dedicated
// home the tab always implied. "I Can Help" itself isn't duplicated here —
// PostPreviewCard is a pure read-only preview by design (same as everywhere
// else it's used), so tapping through to the real PostDetailScreen is where
// that action already lives.
export default function HelpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSchool, setHasSchool] = useState(true);

  const loadHelpPosts = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await fetchProfileById(user.id);
      if (!profile.school_id && !profile.school_name) {
        setHasSchool(false);
        setPosts([]);
        return;
      }
      setHasSchool(true);

      const [data, blockedIds] = await Promise.all([
        profile.school_id
          ? fetchPostsBySchoolId(profile.school_id, 'Need Help', HELP_LIMIT, 'open')
          : fetchPostsBySchool(profile.school_name!, 'Need Help', HELP_LIMIT, 'open'),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);

      // UX filtering only, not a security boundary — see blocks.ts.
      setPosts(data.filter((p) => !blockedIds.has(p.author_id)));
    } catch {
      setPosts([]);
    }
  }, [user]);

  // Refetch on every focus (not just once) — returning here after
  // volunteering elsewhere, or after a request gets accepted, should drop it
  // from this open-only list immediately.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadHelpPosts();
        setLoading(false);
      })();
    }, [loadHelpPosts])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHelpPosts();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>🤝 Need Help</Text>
          <Text style={styles.subtitle}>Open requests from your school community</Text>
        </View>
        <View style={styles.list}>
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>🤝 Need Help</Text>
            <Text style={styles.subtitle}>Open requests from your school community</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="hand-left-outline"
            title={hasSchool ? 'No open help requests right now' : 'Add your school to see help requests'}
            subtitle={
              hasSchool
                ? 'When someone at your school posts with the Need Help category, it shows up here.'
                : 'Set your school from your profile to see requests from your community.'
            }
          />
        }
        renderItem={({ item, index }) => (
          <FadeInView delay={Math.min(index, 6) * 30}>
            <PostPreviewCard
              post={item}
              showCategory={false}
              onPress={() => navigation.navigate('PostDetail', { post: item })}
            />
          </FadeInView>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
