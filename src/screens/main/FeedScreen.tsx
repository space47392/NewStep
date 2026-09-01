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
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { PostCardSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import LikeButton from '../../components/LikeButton';
import PhotoCarousel from '../../components/PhotoCarousel';
import { Post, Story, MainStackParamList } from '../../types';
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
  const hasLoadedOnce = useRef(false);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPosts();
      setPosts(data);
      setErrorMessage(null);
      if (user) {
        const liked = await fetchLikedPostIds(user.id, data.map((p) => p.id));
        setLikedPostIds(liked);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load posts.');
    }
  }, [user]);

  const loadStories = useCallback(async () => {
    try {
      const data = await fetchActiveStories();
      setStories(data);
    } catch {
      // Non-critical — the rail just keeps whatever it last had (or stays empty).
    }
  }, []);

  // Refetch every time this tab gains focus (e.g. returning from editing a post),
  // but only show the full-screen spinner the very first time — later refreshes
  // happen quietly behind the existing list so editing doesn't cause a jarring reload.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!hasLoadedOnce.current) setLoading(true);
        await Promise.all([loadPosts(), loadStories()]);
        setLoading(false);
        hasLoadedOnce.current = true;
      })();
    }, [loadPosts, loadStories])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPosts(), loadStories()]);
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

  const menuActions: ActionSheetAction[] = menuPost
    ? [
        { label: 'Edit Post', icon: 'create-outline', onPress: () => handleEditPost(menuPost) },
        { label: 'Delete Post', icon: 'trash-outline', destructive: true, onPress: () => handleDeletePost(menuPost) },
      ]
    : [];

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
              <Text style={styles.title}>Community Feed 👋</Text>
              <Text style={styles.subtitle}>See what's happening at your school</Text>
            </View>
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
          const isAuthor = user?.id === item.author_id;
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
                  {isAuthor && (
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        setMenuPost(item);
                      }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMid} />
                    </TouchableOpacity>
                  )}
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

                {item.category === 'Need Help' && item.status !== 'open' && item.helper ? (
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
    marginBottom: spacing.lg,
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
