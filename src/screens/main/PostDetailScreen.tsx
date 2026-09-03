import { useCallback, useEffect, useRef, useState } from 'react';
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
import { fetchSavedPostIds, savePost, unsavePost } from '../../lib/postSaves';
import { sharePost } from '../../lib/share';
import { fetchHelpStats } from '../../lib/points';
import { fetchProfileById } from '../../lib/profile';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { CommentSkeleton } from '../../components/Skeleton';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import HelpStatusBadge from '../../components/HelpStatusBadge';
import LikeButton from '../../components/LikeButton';
import SaveButton from '../../components/SaveButton';
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
  const [savedByMe, setSavedByMe] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [thanking, setThanking] = useState(false);
  const [contribution, setContribution] = useState<{ studentsHelped: number; points: number } | null>(null);
  const commentInputRef = useRef<TextInput>(null);

  // Refetch just the post (not comments) whenever this screen regains focus, so
  // returning from editing shows the new content immediately.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const freshPost = await fetchPostById(route.params.post.id);
          setPost(freshPost);
          if (user) {
            const [liked, saved] = await Promise.all([
              fetchLikedPostIds(user.id, [freshPost.id]),
              fetchSavedPostIds(user.id, [freshPost.id]),
            ]);
            setLikedByMe(liked.has(freshPost.id));
            setSavedByMe(saved.has(freshPost.id));
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

  // Lets FeedScreen's "X Comments" link open straight into a focused input,
  // instead of requiring a second tap once the screen has already loaded.
  // Delayed slightly so the KeyboardAvoidingView layout settles first.
  useEffect(() => {
    if (!route.params.focusComment) return;
    const timer = setTimeout(() => commentInputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [route.params.focusComment]);

  // Community contribution summary — reuses the existing help-stats/points
  // reads (Step 3) rather than any new counter; only fetched once a helper
  // actually exists and the request is done, not on every load.
  useEffect(() => {
    if (post.status !== 'completed' || !post.helper) {
      setContribution(null);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const [stats, helperProfile] = await Promise.all([
          fetchHelpStats(post.helper!.id),
          fetchProfileById(post.helper!.id),
        ]);
        if (isMounted) setContribution({ studentsHelped: stats.studentsHelped, points: helperProfile.points });
      } catch {
        if (isMounted) setContribution(null);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [post.status, post.helper?.id]);

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

  // Appreciation, kept deliberately lightweight: it's just a friendly comment
  // through the existing addComment() — no new table, no points, no rating.
  // Real-time delivery, notification, and RLS are all whatever comments
  // already have; nothing new to secure here.
  const handleThankHelper = async () => {
    if (!user || !post.helper) return;
    setThanking(true);
    try {
      await addComment({
        postId: post.id,
        authorId: user.id,
        content: `Thank you for your help, ${post.helper.full_name ?? 'friend'}! 🙏`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Thanks sent!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send thanks.';
      Alert.alert('Error', message);
    } finally {
      setThanking(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [freshPost, freshComments] = await Promise.all([fetchPostById(post.id), fetchComments(post.id)]);
      setPost(freshPost);
      setComments(freshComments);
      if (user) {
        const [liked, saved] = await Promise.all([
          fetchLikedPostIds(user.id, [freshPost.id]),
          fetchSavedPostIds(user.id, [freshPost.id]),
        ]);
        setLikedByMe(liked.has(freshPost.id));
        setSavedByMe(saved.has(freshPost.id));
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

  // Same toggle SaveButton itself calls — kept here too so the ⋯ menu offers
  // Save/Share on another user's post (section 9's spec), in addition to the
  // inline bookmark icon next to Like.
  const handleToggleSaveFromMenu = async () => {
    if (!user) return;
    const next = !savedByMe;
    setSavedByMe(next);
    try {
      if (next) {
        await savePost({ postId: post.id, userId: user.id });
        showToast('Saved');
      } else {
        await unsavePost({ postId: post.id, userId: user.id });
      }
    } catch {
      setSavedByMe(!next);
    }
  };

  const menuActions: ActionSheetAction[] = isAuthor
    ? [
        { label: 'Edit Post', icon: 'create-outline', onPress: handleEditPost },
        { label: 'Delete Post', icon: 'trash-outline', destructive: true, onPress: handleDeletePost },
      ]
    : [
        {
          label: savedByMe ? 'Unsave Post' : 'Save Post',
          icon: savedByMe ? 'bookmark' : 'bookmark-outline',
          onPress: handleToggleSaveFromMenu,
        },
        { label: 'Share Post', icon: 'share-outline', onPress: () => sharePost(post) },
        { label: 'Report Post', icon: 'flag-outline', onPress: () => setReportTarget({ type: 'post', id: post.id }) },
      ];

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

            <View style={styles.badgeRow}>
              <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
                <Ionicons name={category.icon} size={12} color={category.text} />
                <Text style={[styles.categoryText, { color: category.text }]}>{post.category}</Text>
              </View>
              {post.category === 'Need Help' && <HelpStatusBadge status={post.status} />}
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
              <View style={styles.likeRowRight}>
                <SaveButton postId={post.id} initialSaved={savedByMe} />
                <TouchableOpacity
                  style={styles.footerIconButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => sharePost(post)}
                >
                  <Ionicons name="share-outline" size={20} color={colors.textMid} />
                </TouchableOpacity>
              </View>
            </View>

            {canVolunteer && (
              <PrimaryButton
                title="I Can Help"
                icon="hand-left-outline"
                onPress={handleVolunteer}
                loading={volunteering}
                style={styles.actionButton}
              />
            )}

            {showHelper && post.helper && (
              <View style={styles.helperCard}>
                <Text style={styles.helperLabel}>
                  {post.status === 'completed' ? '✅ Helped by' : '🤝 Helping'}
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

                {post.status === 'completed' && contribution && (
                  <View style={styles.contributionRow}>
                    <Text style={styles.contributionText}>
                      🤝 Helped {contribution.studentsHelped} {contribution.studentsHelped === 1 ? 'student' : 'students'}
                    </Text>
                    <Text style={styles.contributionText}>
                      ⭐ {contribution.points} Community {contribution.points === 1 ? 'Point' : 'Points'}
                    </Text>
                  </View>
                )}

                <View style={styles.helperActions}>
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
                  {user?.id === post.author_id && post.status === 'completed' && (
                    <PrimaryButton
                      title={`Thank ${post.helper.full_name?.split(' ')[0] ?? 'them'}`}
                      icon="heart-outline"
                      variant="outline"
                      onPress={handleThankHelper}
                      loading={thanking}
                      style={styles.messageButton}
                    />
                  )}
                </View>
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
          ref={commentInputRef}
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
  contributionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  contributionText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  helperActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  likeRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  footerIconButton: {
    padding: 2,
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
