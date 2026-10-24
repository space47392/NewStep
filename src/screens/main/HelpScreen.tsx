import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
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
import { Ionicons } from '@expo/vector-icons';
import NSIcon from '../../components/NSIcon';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';
import PressableScale from '../../components/PressableScale';
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
  // Which list is showing: requests still looking for a helper, or ones
  // someone is already helping with.
  const [view, setView] = useState<'open' | 'progress'>('open');
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
        data={view === 'open' ? posts : inProgress}
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
            </View>
            <Text style={styles.subtitle}>Classmates who could use a hand — or ask for one yourself.</Text>
            {hasSchool ? (
              <>
                <View style={styles.segment}>
                  {([
                    ['open', 'Needs a helper', posts.length],
                    ['progress', 'Being helped', inProgress.length],
                  ] as const).map(([key, label, count]) => {
                    const on = view === key;
                    return (
                      <PressableScale
                        key={key}
                        style={[styles.segmentItem, on && styles.segmentItemOn]}
                        onPress={() => setView(key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
                        <View style={[styles.segmentCount, on && styles.segmentCountOn]}>
                          <Text style={[styles.segmentCountText, on && styles.segmentCountTextOn]}>{count}</Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
                <PressableScale
                  pressedScale={0.97}
                  style={styles.askRow}
                  onPress={() => navigation.navigate('CreatePost', { prefillCategory: 'Need Help' })}
                  accessibilityRole="button"
                >
                  <NSIcon name="ask" size={22} />
                  <Text style={styles.askText}>Stuck on something? Ask for help</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
                </PressableScale>
              </>
            ) : null}
          </View>
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
                title={
                  !hasSchool
                    ? 'Add your school to see help requests'
                    : view === 'open'
                      ? 'No one needs a hand right now'
                      : 'No one is being helped right now'
                }
                subtitle={
                  hasSchool
                    ? 'Stuck on something yourself? Take the first step and ask.'
                    : 'Pick your school to see who needs a hand nearby.'
                }
              />
              {hasSchool ? null : (
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
          <FadeInView key={`${view}-${item.id}`} delay={Math.min(index, 6) * 40}>
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
    marginBottom: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.hairline,
  },
  segmentItemOn: {
    backgroundColor: colors.textDark,
  },
  segmentText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  segmentTextOn: {
    color: colors.background,
  },
  segmentCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
  },
  segmentCountOn: {
    backgroundColor: colors.primary,
  },
  segmentCountText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  segmentCountTextOn: {
    color: colors.onPrimary,
  },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  askText: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primaryDark,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.largeTitle,
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
