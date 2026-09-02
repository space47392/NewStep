import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchComments, addComment, subscribeToComments } from '../../lib/comments';
import { volunteerToHelp, markPostCompleted, fetchPostById, deletePost } from '../../lib/posts';
import { getOrCreateConversation } from '../../lib/chat';
import { fetchLikedPostIds } from '../../lib/likes';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { CommentSkeleton } from '../../components/Skeleton';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import LikeButton from '../../components/LikeButton';
import PhotoCarousel from '../../components/PhotoCarousel';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, Comment, ReportTargetType } from '../../types';

export default function PostDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'PostDetail'>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Local copy so the screen can reflect the new status/helper after volunteering,
  // since route.params.post is just a snapshot from when the feed card was tapped.
  const [post, setPost] = useState(route.params.post);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [volunteering, setVolunteering] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [likedByMe, setLikedByMe] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);

  // Refetch just the post (not comments) whenever this screen regains focus, so
  // returning from editing shows the new content immediately.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const freshPost = await fetchPostById(route.params.post.id);
          setPost(freshPost);
          if (user) {
            const liked = await fetchLikedPostIds(user.id, [freshPost.id]);
            setLikedByMe(liked.has(freshPost.id));
          }
        } catch {
          // ignored — comments effect below still loads independently
        }
      })();
    }, [route.params.post.id, user])
  );

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const data = await fetchComments(post.id);
        if (isMounted) setComments(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load comments.';
        Alert.alert('Error', message);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    const unsubscribe = subscribeToComments(post.id, (comment) => {
      setComments((prev) => [...prev, comment]);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [post.id]);

  const category = CATEGORY_STYLES[post.category];
  const canVolunteer = post.category === 'Need Help' && post.status === 'open' && post.author_id !== user?.id;
  const canComplete = post.status === 'accepted' && post.author_id === user?.id;
  // Deliberately NOT gated on category === 'Need Help': status/helper_id already
  // capture that this post has an active or completed help relationship, and an
  // author renaming the category afterwards shouldn't make an existing helper
  // vanish from the UI while the DB relationship (and points trigger) still stands.
  const showHelper = (post.status === 'accepted' || post.status === 'completed') && post.helper;

  const handleVolunteer = async () => {
    if (!user) return;
    setVolunteering(true);
    try {
      const updated = await volunteerToHelp(post.id);
      setPost(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not volunteer to help.';
      Alert.alert('Error', message);
    } finally {
      setVolunteering(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const updated = await markPostCompleted(post.id);
      setPost(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not mark as completed.';
      Alert.alert('Error', message);
    } finally {
      setCompleting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [freshPost, freshComments] = await Promise.all([fetchPostById(post.id), fetchComments(post.id)]);
      setPost(freshPost);
      setComments(freshComments);
      if (user) {
        const liked = await fetchLikedPostIds(user.id, [freshPost.id]);
        setLikedByMe(liked.has(freshPost.id));
      }
    } catch {
      // best-effort — leave whatever is currently shown on failure
    } finally {
      setRefreshing(false);
    }
  };

  const handleMessage = async () => {
    if (!user || !post.helper) return;
    // Either the author messaging their helper, or the helper messaging the author.
    const otherUser = user.id === post.author_id ? post.helper : post.profiles;
    if (!otherUser) return;

    setMessaging(true);
    try {
      const conversationId = await getOrCreateConversation(otherUser.id);
      navigation.navigate('Conversation', {
        conversationId,
        otherUser: { id: otherUser.id, full_name: otherUser.full_name, avatar_url: otherUser.avatar_url },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the conversation.';
      Alert.alert('Error', message);
    } finally {
      setMessaging(false);
    }
  };

  const isAuthor = user?.id === post.author_id;

  const handleEditPost = () => {
    navigation.navigate('CreatePost', { post });
  };

  const handleDeletePost = () => {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingPost(true);
          try {
            await deletePost(post.id, post.photo_urls);
            showToast('Post deleted');
            navigation.goBack();
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not delete post.';
            Alert.alert('Error', message);
            setDeletingPost(false);
          }
        },
      },
    ]);
  };

  const menuActions: ActionSheetAction[] = isAuthor
    ? [
        { label: 'Edit Post', icon: 'create-outline', onPress: handleEditPost },
        { label: 'Delete Post', icon: 'trash-outline', destructive: true, onPress: handleDeletePost },
      ]
    : [{ label: 'Report Post', icon: 'flag-outline', onPress: () => setReportTarget({ type: 'post', id: post.id }) }];

  const handleSend = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !user) return;

    setSending(true);
    try {
      await addComment({ postId: post.id, authorId: user.id, content: trimmed });
      setCommentText(''); // the new comment arrives via the real-time subscription above
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not post comment.';
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMid} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <FadeInView style={styles.postCard}>
            {deletingPost && (
              <View style={styles.deletingOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            <View style={styles.postHeader}>
              <TouchableOpacity
                style={styles.postHeaderUser}
                onPress={() => navigation.navigate('UserProfile', { userId: post.author_id })}
              >
                <Avatar uri={post.profiles?.avatar_url} size={44} />
                <View style={styles.postHeaderText}>
                  <Text style={styles.name}>{post.profiles?.full_name ?? 'Unknown'}</Text>
                  {post.profiles?.school_name ? (
                    <Text style={styles.school}>{post.profiles.school_name}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              <Text style={styles.timestamp}>{formatRelativeTime(post.created_at)}</Text>
            </View>

            <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
              <Ionicons name={category.icon} size={12} color={category.text} />
              <Text style={[styles.categoryText, { color: category.text }]}>{post.category}</Text>
            </View>

            <Text style={styles.postContent}>{post.content}</Text>

            {post.photo_urls.length > 0 && (
              <View style={styles.photoWrap}>
                <PhotoCarousel
                  photoUrls={post.photo_urls}
                  onPressPhoto={(photoIndex) =>
                    navigation.navigate('PhotoViewer', { photoUrls: post.photo_urls, initialIndex: photoIndex })
                  }
                />
              </View>
            )}

            <View style={styles.likeRow}>
              <LikeButton postId={post.id} initialLikeCount={post.like_count} initialLikedByMe={likedByMe} />
            </View>

            {canVolunteer && (
              <PrimaryButton
                title="Volunteer to Help"
                icon="hand-left-outline"
                onPress={handleVolunteer}
                loading={volunteering}
                style={styles.actionButton}
              />
            )}

            {showHelper && post.helper && (
              <View style={styles.helperCard}>
                <Text style={styles.helperLabel}>
                  {post.status === 'completed' ? '✓ Completed — Helped by' : '✓ Helper'}
                </Text>
                <TouchableOpacity
                  style={styles.helperRow}
                  onPress={() => navigation.navigate('UserProfile', { userId: post.helper!.id })}
                >
                  <Avatar uri={post.helper.avatar_url} size={36} />
                  <View style={styles.helperTextWrap}>
                    <Text style={styles.helperName}>{post.helper.full_name ?? 'Unknown'}</Text>
                    {post.helper.school_name ? (
                      <Text style={styles.helperSchool}>{post.helper.school_name}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {(user?.id === post.author_id || user?.id === post.helper.id) && (
                  <PrimaryButton
                    title="Message"
                    icon="chatbubble-outline"
                    variant="outline"
                    onPress={handleMessage}
                    loading={messaging}
                    style={styles.messageButton}
                  />
                )}
              </View>
            )}

            {canComplete && (
              <PrimaryButton
                title="Mark as Completed"
                icon="checkmark-circle-outline"
                variant="success"
                onPress={handleComplete}
                loading={completing}
                style={styles.actionButton}
              />
            )}

            <Text style={styles.commentsLabel}>
              {loading ? 'Comments' : `${comments.length} Comment${comments.length === 1 ? '' : 's'}`}
            </Text>
          </FadeInView>
        }
        ListEmptyComponent={
          loading ? (
            <View>
              <CommentSkeleton />
              <CommentSkeleton />
              <CommentSkeleton />
            </View>
          ) : (
            <EmptyState icon="chatbubbles-outline" title="No comments yet" subtitle="Start the conversation!" />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.commentRow}>
            <TouchableOpacity
              disabled={!item.profiles}
              onPress={() => item.profiles && navigation.navigate('UserProfile', { userId: item.profiles!.id })}
            >
              <Avatar uri={item.profiles?.avatar_url} size={32} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commentBubble}
              activeOpacity={0.85}
              disabled={item.profiles?.id === user?.id}
              onLongPress={() => setReportTarget({ type: 'comment', id: item.id })}
            >
              <Text style={styles.commentName}>{item.profiles?.full_name ?? 'Unknown'}</Text>
              <Text style={styles.commentContent}>{item.content}</Text>
              <Text style={styles.commentTimestamp}>{formatRelativeTime(item.created_at)}</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Write a comment..."
          placeholderTextColor={colors.textLight}
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (sending || !commentText.trim()) && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={sending || !commentText.trim()}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ActionSheet visible={menuVisible} onClose={() => setMenuVisible(false)} actions={menuActions} />
      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  menuButton: {
    padding: spacing.xs,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  postCard: {
    position: 'relative',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
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
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  postHeaderUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  postHeaderText: {
    flex: 1,
    marginLeft: spacing.sm,
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
  actionButton: {
    marginBottom: spacing.md,
  },
  helperCard: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  helperLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.success,
    marginBottom: spacing.xs,
  },
  messageButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 130,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperTextWrap: {
    marginLeft: spacing.sm,
  },
  helperName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  helperSchool: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
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
  postContent: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  photoWrap: {
    marginBottom: spacing.md,
  },
  likeRow: {
    marginBottom: spacing.md,
  },
  commentsLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  commentName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  commentContent: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: 2,
  },
  commentTimestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
