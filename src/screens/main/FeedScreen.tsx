import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchPosts, deletePost } from '../../lib/posts';
import { fetchLikedPostIds } from '../../lib/likes';
import { fetchActiveStories, uploadStory } from '../../lib/stories';
import { fetchProfileById } from '../../lib/profile';
import { fetchSchoolStudentCount } from '../../lib/schools';
import { isWelcomeBannerDismissed, dismissWelcomeBanner } from '../../lib/newStudentPrefs';
import { fetchUnreadNotificationCount } from '../../lib/notifications';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { PostCardSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import LikeButton from '../../components/LikeButton';
import PhotoCarousel from '../../components/PhotoCarousel';
import { Post, Story, MainStackParamList, ReportTargetType } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';

export default function FeedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [stories, setStories] = useState<Story[]>([]);
  const [uploadingStory, setUploadingStory] = useState(false);
  const [mySchoolName, setMySchoolName] = useState<string | null>(null);
  const [mySchoolStudentCount, setMySchoolStudentCount] = useState(0);
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [welcomeBannerDismissed, setWelcomeBannerDismissed] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const hasLoadedOnce = useRef(false);

  const loadNotificationCount = useCallback(async () => {
    if (!user) return;
    try {
      const count = await fetchUnreadNotificationCount(user.id);
      setUnreadNotificationCount(count);
    } catch {
      // leave the badge at its last known count
    }
  }, [user]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPosts();
      // UX filtering only, not a security boundary — posts stay publicly
      // queryable at the RLS layer either way (see blocks.ts).
      const blockedIds = user ? await fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : new Set<string>();
      const visible = data.filter((p) => !blockedIds.has(p.author_id));
      setPosts(visible);
      setErrorMessage(null);
      if (user) {
        const liked = await fetchLikedPostIds(user.id, visible.map((p) => p.id));
        setLikedPostIds(liked);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load posts.');
    }
  }, [user]);

  const loadStories = useCallback(async () => {
    try {
      const data = await fetchActiveStories();
      // UX filtering only — see loadPosts' comment above.
      const blockedIds = user ? await fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : new Set<string>();
      setStories(data.filter((s) => !blockedIds.has(s.author_id)));
    } catch {
      // Non-critical — the rail just keeps whatever it last had (or stays empty).
    }
  }, [user]);

  // Powers both the "your school" pill and the New Student welcome banner below
  // — non-critical, so a failure here just leaves them hidden rather than
  // blocking the rest of the feed.
  const loadSchoolBanner = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, dismissed] = await Promise.all([
        fetchProfileById(user.id),
        isWelcomeBannerDismissed(user.id),
      ]);
      setMySchoolName(profile.school_name);
      setIsNewStudent(profile.is_new_student === true);
      setWelcomeBannerDismissed(dismissed);
      if (profile.school_name) {
        const count = await fetchSchoolStudentCount(profile.school_name);
        setMySchoolStudentCount(count);
      }
    } catch {
      // leave the banner hidden
    }
  }, [user]);

  const handleDismissWelcome = async () => {
    setWelcomeBannerDismissed(true);
    if (user) await dismissWelcomeBanner(user.id);
  };

  // Refetch every time this tab gains focus (e.g. returning from editing a post),
  // but only show the full-screen spinner the very first time — later refreshes
  // happen quietly behind the existing list so editing doesn't cause a jarring reload.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!hasLoadedOnce.current) setLoading(true);
        await Promise.all([loadPosts(), loadStories(), loadSchoolBanner(), loadNotificationCount()]);
        setLoading(false);
        hasLoadedOnce.current = true;
      })();
    }, [loadPosts, loadStories, loadSchoolBanner, loadNotificationCount])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPosts(), loadStories(), loadSchoolBanner(), loadNotificationCount()]);
    setRefreshing(false);
  };

  const handleAddStory = async () => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to post a story.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploadingStory(true);
    try {
      const asset = result.assets[0];
      await uploadStory({ userId: user.id, localUri: asset.uri, mimeType: asset.mimeType });
      await loadStories();
      showToast('Story posted');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not post story.';
      Alert.alert('Error', message);
    } finally {
      setUploadingStory(false);
    }
  };

  const myStory = stories.find((s) => s.author_id === user?.id);
  const otherStories = stories.filter((s) => s.author_id !== user?.id);
  const storyRail = myStory ? [myStory, ...otherStories] : otherStories;

  const handleEditPost = (post: Post) => {
    navigation.navigate('CreatePost', { post });
  };

  const handleDeletePost = (post: Post) => {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingPostId(post.id);
          try {
            await deletePost(post.id, post.photo_urls);
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
            showToast('Post deleted');
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not delete post.';
            Alert.alert('Error', message);
          } finally {
            setDeletingPostId(null);
          }
        },
      },
    ]);
  };

  const menuActions: ActionSheetAction[] = !menuPost
    ? []
    : menuPost.author_id === user?.id
      ? [
          { label: 'Edit Post', icon: 'create-outline', onPress: () => handleEditPost(menuPost) },
          { label: 'Delete Post', icon: 'trash-outline', destructive: true, onPress: () => handleDeletePost(menuPost) },
        ]
      : [
          {
            label: 'Report Post',
            icon: 'flag-outline',
            onPress: () => setReportTarget({ type: 'post', id: menuPost.id }),
          },
        ];

  if (loading) {
    return (
      <View style={[styles.container, styles.list]}>
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
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
          <View>
            {isNewStudent && mySchoolName && !welcomeBannerDismissed && (
              <FadeInView style={styles.welcomeCard}>
                <TouchableOpacity
                  style={styles.welcomeDismiss}
                  onPress={handleDismissWelcome}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={colors.textLight} />
                </TouchableOpacity>
                <Text style={styles.welcomeTitle}>👋 Welcome to {mySchoolName}!</Text>
                <Text style={styles.welcomeSubtitle}>
                  New here? Find your community and introduce yourself to other students.
                </Text>
                <View style={styles.welcomeActions}>
                  <TouchableOpacity
                    style={styles.welcomeButton}
                    onPress={() => navigation.navigate('School', { schoolName: mySchoolName })}
                  >
                    <Text style={styles.welcomeButtonText}>Discover your community</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.welcomeButtonSecondary}
                    onPress={() => navigation.navigate('CreatePost')}
                  >
                    <Text style={styles.welcomeButtonSecondaryText}>Introduce yourself</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              </FadeInView>
            )}

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={storyRail}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.storyRail}
              ListHeaderComponent={
                !myStory ? (
                  <TouchableOpacity style={styles.storyItem} onPress={handleAddStory} disabled={uploadingStory}>
                    <View style={styles.addStoryAvatarWrap}>
                      <Avatar uri={null} size={60} />
                      <View style={styles.addStoryBadge}>
                        {uploadingStory ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="add" size={14} color="#fff" />
                        )}
                      </View>
                    </View>
                    <Text style={styles.storyName}>Your Story</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item, index }) => {
                const mine = item.author_id === user?.id;
                return (
                  <TouchableOpacity
                    style={styles.storyItem}
                    onPress={() => navigation.navigate('StoryViewer', { stories: storyRail, initialIndex: index })}
                  >
                    <View style={[styles.storyAvatarWrap, { borderColor: mine ? colors.success : colors.secondary }]}>
                      <Avatar uri={item.profiles?.avatar_url} size={60} />
                    </View>
                    <Text style={styles.storyName} numberOfLines={1}>
                      {mine ? 'Your Story' : item.profiles?.full_name ?? 'Unknown'}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <Text style={styles.title}>Community Feed 👋</Text>
                <Text style={styles.subtitle}>See what's happening at your school</Text>
              </View>
              <TouchableOpacity
                style={styles.bellButton}
                onPress={() => navigation.navigate('Notifications')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="notifications-outline" size={24} color={colors.textDark} />
                {unreadNotificationCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {mySchoolName ? (
              <TouchableOpacity
                style={styles.schoolBanner}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('School', { schoolName: mySchoolName })}
              >
                <Text style={styles.schoolBannerText}>
                  🏫 {mySchoolName} · {mySchoolStudentCount} {mySchoolStudentCount === 1 ? 'student' : 'students'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.schoolBannerPrompt}>
                <Text style={styles.schoolBannerPromptText}>
                  Add your school in Profile to see your school community
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="newspaper-outline"
            title="No posts yet"
            subtitle={errorMessage ?? 'Be the first to share something with your school community!'}
          />
        }
        renderItem={({ item, index }) => {
          const category = CATEGORY_STYLES[item.category];
          const isDeleting = item.id === deletingPostId;
          const commentCount = item.comments?.[0]?.count ?? 0;
          return (
            <FadeInView delay={Math.min(index, 6) * 40}>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                disabled={isDeleting}
                onPress={() => navigation.navigate('PostDetail', { post: item })}
              >
                {isDeleting && (
                  <View style={styles.deletingOverlay}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    style={styles.cardHeaderUser}
                    onPress={(e) => {
                      e.stopPropagation();
                      navigation.navigate('UserProfile', { userId: item.author_id });
                    }}
                  >
                    <Avatar uri={item.profiles?.avatar_url} size={42} />
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.name}>{item.profiles?.full_name ?? 'Unknown'}</Text>
                      {item.profiles?.school_name ? (
                        <Text style={styles.school}>{item.profiles.school_name}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      setMenuPost(item);
                    }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMid} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
                  <Ionicons name={category.icon} size={12} color={category.text} />
                  <Text style={[styles.categoryText, { color: category.text }]}>{item.category}</Text>
                </View>

                <Text style={styles.content}>{item.content}</Text>

                {item.photo_urls.length > 0 && (
                  <View style={styles.photoWrap}>
                    <PhotoCarousel
                      photoUrls={item.photo_urls}
                      onPressPhoto={(photoIndex) =>
                        navigation.navigate('PhotoViewer', { photoUrls: item.photo_urls, initialIndex: photoIndex })
                      }
                    />
                  </View>
                )}

                {/* Not gated on category — see the matching comment in PostDetailScreen.tsx's
                    showHelper: an active/completed helper relationship should stay visible
                    even if the post's category is edited after the fact. */}
                {item.status !== 'open' && item.helper ? (
                  <View style={styles.helperNotice}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={styles.helperNoticeText}>
                      {item.helper.full_name ?? 'Someone'} {item.status === 'completed' ? 'helped' : 'is helping'}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <LikeButton
                    postId={item.id}
                    initialLikeCount={item.like_count}
                    initialLikedByMe={likedPostIds.has(item.id)}
                  />
                  <View style={styles.commentsLink}>
                    <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                    <Text style={styles.viewComments}>
                      {commentCount > 0 ? `${commentCount} Comment${commentCount === 1 ? '' : 's'}` : 'Add a comment'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </FadeInView>
          );
        }}
      />

      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => navigation.navigate('CreatePost')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <ActionSheet visible={menuPost !== null} onClose={() => setMenuPost(null)} actions={menuActions} />
      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  welcomeCard: {
    position: 'relative',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  welcomeDismiss: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    padding: spacing.xs,
    zIndex: 1,
  },
  welcomeTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    paddingRight: spacing.xl,
  },
  welcomeSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  welcomeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  welcomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  welcomeButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  welcomeButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  welcomeButtonSecondaryText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: '#fff',
  },
  storyRail: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  storyItem: {
    alignItems: 'center',
    width: 72,
  },
  storyAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addStoryAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addStoryBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  storyName: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textDark,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTextCol: {
    flex: 1,
  },
  bellButton: {
    position: 'relative',
    padding: spacing.xs,
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    fontFamily: fontFamily.bold,
    color: '#fff',
    fontSize: 9,
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
    marginTop: 2,
  },
  schoolBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  schoolBannerText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  schoolBannerPrompt: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  schoolBannerPromptText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.floating,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  categoryText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  deletingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardHeaderUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  menuButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  school: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  content: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    lineHeight: 21,
  },
  photoWrap: {
    marginTop: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  commentsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewComments: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  helperNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  helperNoticeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.success,
  },
});
