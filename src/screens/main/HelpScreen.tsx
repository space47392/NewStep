import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchProfileById } from '../../lib/profile';
import { fetchPostsBySchool, fetchPostsBySchoolId } from '../../lib/posts';
import { fetchBlockedUserIds } from '../../lib/blocks';
import PostPreviewCard from '../../components/PostPreviewCard';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import PrimaryButton from '../../components/PrimaryButton';
import { PostCardSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import NSIcon from '../../components/NSIcon';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, Post } from '../../types';

const HELP_LIMIT = 20;
const IN_PROGRESS_LIMIT = 10;

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
  const { showToast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  // Requests someone has already offered to help with — shown below the open
  // ones so the screen tells the whole story, not just what's still waiting.
  const [inProgress, setInProgress] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSchool, setHasSchool] = useState(true);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after posts have ever loaded shows a toast
  // instead and keeps the existing list (Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);
  // Guards against a rapid double-tap pushing PostDetail twice — reset on
  // focus below, same minimal pattern as FeedScreen (Step 34).
  const openingPostRef = useRef(false);
  const handleOpenPost = (post: Post) => {
    if (openingPostRef.current) return;
    openingPostRef.current = true;
    navigation.navigate('PostDetail', { post });
  };

  const loadHelpPosts = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await fetchProfileById(user.id);
      if (!profile.school_id && !profile.school_name) {
        setHasSchool(false);
        setPosts([]);
        setInProgress([]);
        setLoadFailed(false);
        hasEverLoadedRef.current = true;
        return;
      }
      setHasSchool(true);

      const [data, accepted, blockedIds] = await Promise.all([
        profile.school_id
          ? fetchPostsBySchoolId(profile.school_id, 'Need Help', HELP_LIMIT, 'open')
          : fetchPostsBySchool(profile.school_name!, 'Need Help', HELP_LIMIT, 'open'),
        // Secondary section — a failure here never blocks the open list above.
        (profile.school_id
          ? fetchPostsBySchoolId(profile.school_id, 'Need Help', IN_PROGRESS_LIMIT, 'accepted')
          : fetchPostsBySchool(profile.school_name!, 'Need Help', IN_PROGRESS_LIMIT, 'accepted')
        ).catch(() => [] as Post[]),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);

      // UX filtering only, not a security boundary — see blocks.ts.
      setPosts(data.filter((p) => !blockedIds.has(p.author_id)));
      setInProgress(accepted.filter((p) => !blockedIds.has(p.author_id)));
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (hasEverLoadedRef.current) {
        showToast("Couldn't refresh help requests");
      } else {
        setLoadFailed(true);
      }
    }
  }, [user, showToast]);

  // Refetch on every focus (not just once) — returning here after
  // volunteering elsewhere, or after a request gets accepted, should drop it
  // from this open-only list immediately.
  useFocusEffect(
    useCallback(() => {
      openingPostRef.current = false;
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

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadHelpPosts();
    setRetrying(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
          <View style={styles.titleRow}>
            <NSIcon name="help" size={34} />
            <Text style={styles.title}>Need Help</Text>
          </View>
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
            <View style={styles.titleRow}>
              <NSIcon name="help" size={34} />
              <Text style={styles.title}>Need Help</Text>
              {/* A live count gives this screen an immediate, at-a-glance
                  sense of current opportunity instead of only a static
                  subtitle — "action/opportunity-first" (Visual Polish pass). */}
              {posts.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{posts.length} open</Text>
                </View>
              )}
            </View>
            <Text style={styles.subtitle}>Open requests from your school community</Text>
            {posts.length > 0 && (
              <View style={styles.sectionRow}>
                <NSIcon name="ask" size={20} />
                <Text style={[styles.sectionLabel, styles.sectionLabelInline]}>Waiting for a helper</Text>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          inProgress.length > 0 ? (
            <View style={styles.inProgressSection}>
              <View style={styles.sectionRow}>
                <NSIcon name="help" size={20} />
                <Text style={[styles.sectionLabel, styles.sectionLabelInline]}>In progress</Text>
              </View>
              {inProgress.map((item) => (
                <PostPreviewCard key={item.id} post={item} showCategory={false} onPress={() => handleOpenPost(item)} />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loadFailed ? (
            <ErrorState onRetry={handleRetry} retrying={retrying} />
          ) : (
            <View>
              <EmptyState
                icon="hand-left-outline"
                nsIcon={hasSchool ? 'help' : 'school'}
                tint={colors.secondaryLight}
                title={hasSchool ? 'No one needs a hand right now' : 'Add your school to see help requests'}
                subtitle={
                  hasSchool
                    ? 'Stuck on something yourself? Take the first step and ask.'
                    : 'Pick your school to see who needs a hand nearby.'
                }
              />
              {hasSchool ? (
                <PrimaryButton
                  title="Ask for help"
                  icon="hand-left-outline"
                  variant="outline"
                  onPress={() => navigation.navigate('CreatePost', { prefillCategory: 'Need Help' })}
                  style={styles.emptyActionButton}
                />
              ) : (
                <PrimaryButton
                  title="Choose School"
                  icon="school-outline"
                  onPress={() => navigation.navigate('ChooseSchool')}
                  style={styles.emptyActionButton}
                />
              )}
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <FadeInView delay={Math.min(index, 6) * 30}>
            <PostPreviewCard post={item} showCategory={false} onPress={() => handleOpenPost(item)} />
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
    paddingTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  // Secondary/help-red, matching the same category color Notifications
  // already uses for this exact type (getNotificationCategoryColor).
  countBadge: {
    backgroundColor: colors.secondaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  countBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.secondaryDark,
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
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabelInline: {
    marginTop: 0,
    marginBottom: 0,
  },
  inProgressSection: {
    marginTop: spacing.sm,
  },
  emptyActionButton: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.xl,
  },
});
