import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchPosts,
  deletePost,
  volunteerToHelp,
  fetchFollowingFeed,
  fetchOpenHelpCountBySchool,
  fetchOpenHelpCountBySchoolId,
} from '../../lib/posts';
import { fetchLikedPostIds } from '../../lib/likes';
import { fetchSavedPostIds, savePost, unsavePost } from '../../lib/postSaves';
import { fetchInterestedPostIds } from '../../lib/eventInterests';
import { sharePost } from '../../lib/share';
import { fetchActiveStories, uploadStory } from '../../lib/stories';
import { getSeenStoryIds, pruneSeenStoryIds } from '../../lib/storyPrefs';
import { fetchProfileById } from '../../lib/profile';
import { fetchSchoolStudentCount, fetchSchoolStudentCountById } from '../../lib/schools';
import { fetchFollowingIds } from '../../lib/follows';
import { isWelcomeBannerDismissed, dismissWelcomeBanner } from '../../lib/newStudentPrefs';
import { fetchUnreadNotificationCount } from '../../lib/notifications';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { PostCardSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import PrimaryButton from '../../components/PrimaryButton';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import HelpStatusBadge from '../../components/HelpStatusBadge';
import EventDetails from '../../components/EventDetails';
import LikeButton from '../../components/LikeButton';
import SaveButton from '../../components/SaveButton';
import InterestButton from '../../components/InterestButton';
import PhotoCarousel from '../../components/PhotoCarousel';
import { Post, Story, MainStackParamList, ReportTargetType } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';

// Shared by both feeds' pagination — same page size, same .range() shape.
const PAGE_SIZE = 20;

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
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [interestedPostIds, setInterestedPostIds] = useState<Set<string>>(new Set());
  const [stories, setStories] = useState<Story[]>([]);
  const [seenStoryIds, setSeenStoryIds] = useState<Set<string>>(new Set());
  const [uploadingStory, setUploadingStory] = useState(false);
  const [mySchoolName, setMySchoolName] = useState<string | null>(null);
  const [mySchoolId, setMySchoolId] = useState<string | null>(null);
  const [mySchoolStudentCount, setMySchoolStudentCount] = useState(0);
  const [openHelpCount, setOpenHelpCount] = useState(0);
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [welcomeBannerDismissed, setWelcomeBannerDismissed] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [volunteeringPostId, setVolunteeringPostId] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<'forYou' | 'following'>('forYou');
  const [forYouHasMore, setForYouHasMore] = useState(true);
  const [loadingMoreForYou, setLoadingMoreForYou] = useState(false);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingLoaded, setFollowingLoaded] = useState(false);
  const [followingHasMore, setFollowingHasMore] = useState(true);
  // Reused by both feeds' "load more" so re-opening the next page never
  // re-fetches the follow list / block list it already has from the initial
  // load — those don't change between pagination clicks within one session.
  const [blockedIdsCache, setBlockedIdsCache] = useState<Set<string>>(new Set());
  const [followingIdsCache, setFollowingIdsCache] = useState<string[]>([]);
  const hasLoadedOnce = useRef(false);

  // Lets a post go straight from "open" to "accepted" right from the feed card
  // — same secure volunteer_to_help() RPC PostDetailScreen already uses (Step 1),
  // just reachable without navigating in first.
  const handleQuickVolunteer = async (post: Post) => {
    if (!user) return;
    setVolunteeringPostId(post.id);
    try {
      const updated = await volunteerToHelp(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('You volunteered to help!');
    } catch (err) {
      // Transient/retryable, not destructive — a toast is enough, no need to
      // interrupt with a blocking dialog (Step 30).
      const message = err instanceof Error ? err.message : 'Could not volunteer to help.';
      showToast(message);
    } finally {
      setVolunteeringPostId(null);
    }
  };

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
      const data = await fetchPosts(PAGE_SIZE, 0);
      // UX filtering only, not a security boundary — posts stay publicly
      // queryable at the RLS layer either way (see blocks.ts).
      const blockedIds = user ? await fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : new Set<string>();
      setBlockedIdsCache(blockedIds);
      const visible = data.filter((p) => !blockedIds.has(p.author_id));
      setPosts(visible);
      setForYouHasMore(data.length === PAGE_SIZE);
      setErrorMessage(null);
      if (user) {
        const [liked, saved, interested] = await Promise.all([
          fetchLikedPostIds(user.id, visible.map((p) => p.id)),
          fetchSavedPostIds(user.id, visible.map((p) => p.id)),
          fetchInterestedPostIds(user.id, visible.map((p) => p.id)),
        ]);
        setLikedPostIds(liked);
        setSavedPostIds(saved);
        setInterestedPostIds(interested);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load posts.');
    }
  }, [user]);

  // "For You" pagination — reuses the blocked-ids cache from the last full
  // load rather than re-fetching it on every tap of "Load more".
  const handleLoadMoreForYou = async () => {
    if (!user || loadingMoreForYou || !forYouHasMore) return;
    setLoadingMoreForYou(true);
    try {
      const data = await fetchPosts(PAGE_SIZE, posts.length);
      const visible = data.filter((p) => !blockedIdsCache.has(p.author_id));
      setPosts((prev) => [...prev, ...visible]);
      setForYouHasMore(data.length === PAGE_SIZE);
      if (visible.length > 0) {
        const [liked, saved, interested] = await Promise.all([
          fetchLikedPostIds(user.id, visible.map((p) => p.id)),
          fetchSavedPostIds(user.id, visible.map((p) => p.id)),
          fetchInterestedPostIds(user.id, visible.map((p) => p.id)),
        ]);
        setLikedPostIds((prev) => new Set([...prev, ...liked]));
        setSavedPostIds((prev) => new Set([...prev, ...saved]));
        setInterestedPostIds((prev) => new Set([...prev, ...interested]));
      }
    } catch {
      setForYouHasMore(false);
    } finally {
      setLoadingMoreForYou(false);
    }
  };

  // Loaded lazily — only once the Following tab is actually opened — rather
  // than always alongside the For You feed, since most sessions may never
  // switch to it. fetchFollowingIds() is itself capped (follows.ts), and this
  // paginates the same way NotificationsScreen/FollowListScreen already do.
  const loadFollowingFeed = useCallback(async () => {
    if (!user) return;
    setFollowingLoading(true);
    try {
      const [followingIds, blockedIds] = await Promise.all([
        fetchFollowingIds(user.id),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);
      setFollowingIdsCache(followingIds);
      setBlockedIdsCache(blockedIds);
      // UX filtering only, not a security boundary — see blocks.ts.
      const eligibleIds = followingIds.filter((id) => !blockedIds.has(id));
      const data = await fetchFollowingFeed(eligibleIds, PAGE_SIZE, 0);
      setFollowingPosts(data);
      setFollowingHasMore(data.length === PAGE_SIZE);
      // Bug fix: this feed's like/save state was never fetched before, so
      // LikeButton/SaveButton always rendered as "off" here regardless of the
      // real state — same batched-fetch pattern loadPosts() already uses.
      if (data.length > 0) {
        const [liked, saved, interested] = await Promise.all([
          fetchLikedPostIds(user.id, data.map((p) => p.id)),
          fetchSavedPostIds(user.id, data.map((p) => p.id)),
          fetchInterestedPostIds(user.id, data.map((p) => p.id)),
        ]);
        setLikedPostIds((prev) => new Set([...prev, ...liked]));
        setSavedPostIds((prev) => new Set([...prev, ...saved]));
        setInterestedPostIds((prev) => new Set([...prev, ...interested]));
      }
    } catch {
      setFollowingPosts([]);
    } finally {
      setFollowingLoading(false);
      setFollowingLoaded(true);
    }
  }, [user]);

  const handleLoadMoreFollowing = async () => {
    if (!user || followingLoading || !followingHasMore) return;
    setFollowingLoading(true);
    try {
      // Reuses the follow/block lists cached by the initial load — neither
      // is expected to change between pagination clicks in the same session.
      const eligibleIds = followingIdsCache.filter((id) => !blockedIdsCache.has(id));
      const more = await fetchFollowingFeed(eligibleIds, PAGE_SIZE, followingPosts.length);
      setFollowingPosts((prev) => [...prev, ...more]);
      setFollowingHasMore(more.length === PAGE_SIZE);
      if (more.length > 0) {
        const [liked, saved, interested] = await Promise.all([
          fetchLikedPostIds(user.id, more.map((p) => p.id)),
          fetchSavedPostIds(user.id, more.map((p) => p.id)),
          fetchInterestedPostIds(user.id, more.map((p) => p.id)),
        ]);
        setLikedPostIds((prev) => new Set([...prev, ...liked]));
        setSavedPostIds((prev) => new Set([...prev, ...saved]));
        setInterestedPostIds((prev) => new Set([...prev, ...interested]));
      }
    } catch {
      setFollowingHasMore(false);
    } finally {
      setFollowingLoading(false);
    }
  };

  const loadStories = useCallback(async () => {
    try {
      const data = await fetchActiveStories();
      // UX filtering only — see loadPosts' comment above.
      const blockedIds = user ? await fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : new Set<string>();
      const visible = data.filter((s) => !blockedIds.has(s.author_id));
      setStories(visible);
      // Refreshed on every focus, so returning from StoryViewerScreen (which
      // just marked a story seen) immediately updates the rail's rings.
      if (user) {
        await pruneSeenStoryIds(user.id, visible.map((s) => s.id));
        setSeenStoryIds(await getSeenStoryIds(user.id));
      }
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
      setMySchoolId(profile.school_id);
      setIsNewStudent(profile.is_new_student === true);
      setWelcomeBannerDismissed(dismissed);
      // Prefer the stable school_id once set; school_name stays the fallback
      // for every profile that hasn't picked from the directory yet.
      if (profile.school_id) {
        const [count, helpCount] = await Promise.all([
          fetchSchoolStudentCountById(profile.school_id),
          fetchOpenHelpCountBySchoolId(profile.school_id).catch(() => 0),
        ]);
        setMySchoolStudentCount(count);
        setOpenHelpCount(helpCount);
      } else if (profile.school_name) {
        const [count, helpCount] = await Promise.all([
          fetchSchoolStudentCount(profile.school_name),
          fetchOpenHelpCountBySchool(profile.school_name).catch(() => 0),
        ]);
        setMySchoolStudentCount(count);
        setOpenHelpCount(helpCount);
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

  // Loads the Following feed the first time that tab is opened, not eagerly
  // on every app launch.
  useEffect(() => {
    if (feedMode === 'following' && !followingLoaded) {
      loadFollowingFeed();
    }
  }, [feedMode, followingLoaded, loadFollowingFeed]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (feedMode === 'following') {
      await loadFollowingFeed();
    } else {
      await Promise.all([loadPosts(), loadStories(), loadSchoolBanner(), loadNotificationCount()]);
    }
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

  // Same toggle savePost/unsavePost calls SaveButton makes — kept here too so
  // the ⋯ menu (section 9's spec) offers Save/Share for another user's post,
  // in addition to the inline bookmark icon on the card itself.
  const handleToggleSaveFromMenu = async (post: Post) => {
    if (!user) return;
    const currentlySaved = savedPostIds.has(post.id);
    setSavedPostIds((prev) => {
      const next = new Set(prev);
      if (currentlySaved) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    try {
      if (currentlySaved) {
        await unsavePost({ postId: post.id, userId: user.id });
      } else {
        await savePost({ postId: post.id, userId: user.id });
        showToast('Saved');
      }
    } catch {
      setSavedPostIds((prev) => {
        const next = new Set(prev);
        if (currentlySaved) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
    }
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
            label: savedPostIds.has(menuPost.id) ? 'Unsave Post' : 'Save Post',
            icon: savedPostIds.has(menuPost.id) ? 'bookmark' : 'bookmark-outline',
            onPress: () => handleToggleSaveFromMenu(menuPost),
          },
          { label: 'Share Post', icon: 'share-outline', onPress: () => sharePost(menuPost) },
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

  const displayedPosts = feedMode === 'following' ? followingPosts : posts;

  return (
    <View style={styles.container}>
      <FlatList
        data={displayedPosts}
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
                    onPress={() => navigation.navigate('School', { schoolId: mySchoolId ?? undefined, schoolName: mySchoolName })}
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

            {/* One identity line instead of three separate widgets (title,
                story caption, school pill) — same data as before, just no
                longer fragmented across the header. Doubles as the entry
                point into School Community. */}
            <View style={styles.identityRow}>
              <TouchableOpacity
                style={styles.identityTextWrap}
                activeOpacity={mySchoolName ? 0.7 : 1}
                disabled={!mySchoolName}
                onPress={() =>
                  mySchoolName &&
                  navigation.navigate('School', { schoolId: mySchoolId ?? undefined, schoolName: mySchoolName })
                }
              >
                <Text style={styles.identityText} numberOfLines={1}>
                  {mySchoolName
                    ? `🏫 ${mySchoolName} · ${mySchoolStudentCount} ${mySchoolStudentCount === 1 ? 'student' : 'students'}${
                        openHelpCount > 0 ? ` · 🤝 ${openHelpCount} need help` : ''
                      }`
                    : 'NewStep · Add your school in Profile to see your community'}
                </Text>
                {mySchoolName ? <Ionicons name="chevron-forward" size={14} color={colors.primary} /> : null}
              </TouchableOpacity>
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

            {/* Wrapped as its own card so it reads as "the School Stories
                section" rather than a bare row of circles — pure presentation,
                same stories, same order, same seen/pause/expiry logic as before. */}
            <View style={styles.storyCard}>
              {mySchoolName && <Text style={styles.storyRailLabel}>Stories from {mySchoolName}</Text>}
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
                  const seen = seenStoryIds.has(item.id);
                  // Own story keeps its own color regardless of seen state; everyone
                  // else's ring fades to a muted gray once viewed — same "seen" cue
                  // as any commercial story rail, without touching what the ring
                  // looks like before that (still colored/unmissable for new posts).
                  const ringColor = mine ? colors.success : seen ? colors.border : colors.secondary;
                  return (
                    <TouchableOpacity
                      style={styles.storyItem}
                      onPress={() => navigation.navigate('StoryViewer', { stories: storyRail, initialIndex: index })}
                    >
                      <View style={[styles.storyAvatarWrap, { borderColor: ringColor }]}>
                        <Avatar uri={item.profiles?.avatar_url} size={60} />
                      </View>
                      <Text style={styles.storyName} numberOfLines={1}>
                        {mine ? 'Your Story' : item.profiles?.full_name ?? 'Unknown'}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            <View style={styles.feedModeRow}>
              <TouchableOpacity
                style={[styles.feedModeTab, feedMode === 'forYou' && styles.feedModeTabActive]}
                onPress={() => setFeedMode('forYou')}
              >
                <Text style={[styles.feedModeText, feedMode === 'forYou' && styles.feedModeTextActive]}>For You</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedModeTab, feedMode === 'following' && styles.feedModeTabActive]}
                onPress={() => setFeedMode('following')}
              >
                <Text style={[styles.feedModeText, feedMode === 'following' && styles.feedModeTextActive]}>
                  Following
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          feedMode === 'following' && followingLoading && !followingLoaded ? (
            <>
              <PostCardSkeleton />
              <PostCardSkeleton />
            </>
          ) : feedMode === 'following' ? (
            <View>
              <EmptyState
                icon="people-outline"
                title="No posts yet"
                subtitle="Follow classmates to see their posts here — or check what's happening at your school in the meantime."
              />
              <View style={styles.emptyActions}>
                <PrimaryButton
                  title="Find People to Follow"
                  icon="search-outline"
                  onPress={() => navigation.navigate('Tabs', { screen: 'Search' })}
                  style={styles.emptyActionButton}
                />
                {mySchoolName && (
                  <PrimaryButton
                    title="View School Community"
                    icon="school-outline"
                    variant="outline"
                    onPress={() => navigation.navigate('School', { schoolId: mySchoolId ?? undefined, schoolName: mySchoolName })}
                    style={styles.emptyActionButton}
                  />
                )}
              </View>
            </View>
          ) : (
            <View>
              <EmptyState
                icon="newspaper-outline"
                title="No posts yet"
                subtitle={errorMessage ?? "Be the first to share something — or explore what's already happening nearby."}
              />
              <View style={styles.emptyActions}>
                <PrimaryButton
                  title="Create a Post"
                  icon="add-circle-outline"
                  onPress={() => navigation.navigate('CreatePost')}
                  style={styles.emptyActionButton}
                />
                {mySchoolName ? (
                  <PrimaryButton
                    title="View School Community"
                    icon="school-outline"
                    variant="outline"
                    onPress={() => navigation.navigate('School', { schoolId: mySchoolId ?? undefined, schoolName: mySchoolName })}
                    style={styles.emptyActionButton}
                  />
                ) : (
                  <PrimaryButton
                    title="Find People to Follow"
                    icon="search-outline"
                    variant="outline"
                    onPress={() => navigation.navigate('Tabs', { screen: 'Search' })}
                    style={styles.emptyActionButton}
                  />
                )}
              </View>
            </View>
          )
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

                <View style={styles.badgeRow}>
                  <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
                    <Ionicons name={category.icon} size={12} color={category.text} />
                    <Text style={[styles.categoryText, { color: category.text }]}>{item.category}</Text>
                  </View>
                  {item.category === 'Need Help' && <HelpStatusBadge status={item.status} />}
                </View>

                <Text style={styles.content}>{item.content}</Text>
                <EventDetails post={item} />

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

                {item.category === 'Need Help' && item.status === 'open' && item.author_id !== user?.id && (
                  <TouchableOpacity
                    style={styles.canHelpButton}
                    activeOpacity={0.85}
                    disabled={volunteeringPostId === item.id}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleQuickVolunteer(item);
                    }}
                  >
                    {volunteeringPostId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="hand-left-outline" size={16} color={colors.primary} />
                        <Text style={styles.canHelpText}>I Can Help</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {item.category === 'Event' && (
                  <View style={styles.interestRow}>
                    <InterestButton postId={item.id} initialInterested={interestedPostIds.has(item.id)} />
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <LikeButton
                    postId={item.id}
                    initialLikeCount={item.like_count}
                    initialLikedByMe={likedPostIds.has(item.id)}
                  />
                  <View style={styles.footerRight}>
                    <SaveButton postId={item.id} initialSaved={savedPostIds.has(item.id)} />
                    <TouchableOpacity
                      style={styles.footerIconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={(e) => {
                        e.stopPropagation();
                        sharePost(item);
                      }}
                    >
                      <Ionicons name="share-outline" size={20} color={colors.textMid} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.commentsLink}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      onPress={(e) => {
                        e.stopPropagation();
                        navigation.navigate('PostDetail', { post: item, focusComment: true });
                      }}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                      <Text style={styles.viewComments}>
                        {commentCount > 0 ? `${commentCount} Comment${commentCount === 1 ? '' : 's'}` : 'Add a comment'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </FadeInView>
          );
        }}
        ListFooterComponent={
          feedMode === 'following' && followingHasMore && followingPosts.length > 0 ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMoreFollowing} disabled={followingLoading}>
              {followingLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : feedMode === 'forYou' && forYouHasMore && posts.length > 0 ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMoreForYou} disabled={loadingMoreForYou}>
              {loadingMoreForYou ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
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
  storyCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.subtle,
  },
  storyRailLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginBottom: spacing.sm,
  },
  storyRail: {
    paddingBottom: spacing.md,
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  identityTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  identityText: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
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
  emptyActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  emptyActionButton: {
    width: '100%',
  },
  feedModeRow: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.full,
    padding: 3,
    marginTop: spacing.md,
  },
  feedModeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  feedModeTabActive: {
    backgroundColor: colors.cardBg,
    ...shadow.subtle,
  },
  feedModeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  feedModeTextActive: {
    color: colors.primary,
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
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
  interestRow: {
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  footerIconButton: {
    padding: 2,
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
  canHelpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    minWidth: 110,
  },
  canHelpText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
