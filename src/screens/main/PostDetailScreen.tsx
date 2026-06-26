import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { fetchComments, addComment, subscribeToComments } from '../../lib/comments';
import { volunteerToHelp, markPostCompleted } from '../../lib/posts';
import { getOrCreateConversation } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import { MainStackParamList, Comment } from '../../types';

export default function PostDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'PostDetail'>>();
  const { user } = useAuth();

  // Local copy so the screen can reflect the new status/helper after volunteering,
  // since route.params.post is just a snapshot from when the feed card was tapped.
  const [post, setPost] = useState(route.params.post);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [volunteering, setVolunteering] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [messaging, setMessaging] = useState(false);

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

  const canVolunteer = post.category === 'Need Help' && post.status === 'open' && post.author_id !== user?.id;
  const canComplete = post.status === 'accepted' && post.author_id === user?.id;
  const showHelper =
    post.category === 'Need Help' && (post.status === 'accepted' || post.status === 'completed') && post.helper;

  const handleVolunteer = async () => {
    if (!user) return;
    setVolunteering(true);
    try {
      const updated = await volunteerToHelp({ postId: post.id, helperId: user.id });
      setPost(updated);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not mark as completed.';
      Alert.alert('Error', message);
    } finally {
      setCompleting(false);
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

  const handleSend = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !user) return;

    setSending(true);
    try {
      await addComment({ postId: post.id, authorId: user.id, content: trimmed });
      setCommentText(''); // the new comment arrives via the real-time subscription above
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not post comment.';
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.postCard}>
            <View style={styles.postHeader}>
              {post.profiles?.avatar_url ? (
                <Image source={{ uri: post.profiles.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.postHeaderText}>
                <Text style={styles.name}>{post.profiles?.full_name ?? 'Unknown'}</Text>
                {post.profiles?.school_name ? (
                  <Text style={styles.school}>{post.profiles.school_name}</Text>
                ) : null}
              </View>
              <Text style={styles.timestamp}>{formatRelativeTime(post.created_at)}</Text>
            </View>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{post.category}</Text>
            </View>
            <Text style={styles.postContent}>{post.content}</Text>

            {canVolunteer && (
              <TouchableOpacity
                style={[styles.volunteerButton, volunteering && styles.buttonDisabled]}
                onPress={handleVolunteer}
                disabled={volunteering}
              >
                {volunteering ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.volunteerButtonText}>Volunteer to Help</Text>
                )}
              </TouchableOpacity>
            )}

            {showHelper && post.helper && (
              <View style={styles.helperCard}>
                <Text style={styles.helperLabel}>
                  {post.status === 'completed' ? '✓ Completed — Helped by' : '✓ Helper'}
                </Text>
                <View style={styles.helperRow}>
                  {post.helper.avatar_url ? (
                    <Image source={{ uri: post.helper.avatar_url }} style={styles.helperAvatar} />
                  ) : (
                    <View style={[styles.helperAvatar, styles.avatarPlaceholder]} />
                  )}
                  <View>
                    <Text style={styles.helperName}>{post.helper.full_name ?? 'Unknown'}</Text>
                    {post.helper.school_name ? (
                      <Text style={styles.helperSchool}>{post.helper.school_name}</Text>
                    ) : null}
                  </View>
                </View>
                {(user?.id === post.author_id || user?.id === post.helper.id) && (
                  <TouchableOpacity
                    style={[styles.messageButton, messaging && styles.buttonDisabled]}
                    onPress={handleMessage}
                    disabled={messaging}
                  >
                    {messaging ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.messageButtonText}>Message</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {canComplete && (
              <TouchableOpacity
                style={[styles.completeButton, completing && styles.buttonDisabled]}
                onPress={handleComplete}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.volunteerButtonText}>Mark as Completed</Text>
                )}
              </TouchableOpacity>
            )}

            <Text style={styles.commentsLabel}>
              {loading ? 'Loading comments...' : `${comments.length} Comment${comments.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No comments yet. Start the conversation!</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.commentRow}>
            {item.profiles?.avatar_url ? (
              <Image source={{ uri: item.profiles.avatar_url }} style={styles.commentAvatar} />
            ) : (
              <View style={[styles.commentAvatar, styles.avatarPlaceholder]} />
            )}
            <View style={styles.commentBubble}>
              <Text style={styles.commentName}>{item.profiles?.full_name ?? 'Unknown'}</Text>
              <Text style={styles.commentContent}>{item.content}</Text>
              <Text style={styles.commentTimestamp}>{formatRelativeTime(item.created_at)}</Text>
            </View>
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
          style={[styles.sendButton, sending && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  postCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
  },
  postHeaderText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textDark,
  },
  school: {
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  completeButton: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  volunteerButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  volunteerButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  helperCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  helperLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.success,
    marginBottom: spacing.xs,
  },
  messageButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  messageButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  helperName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textDark,
  },
  helperSchool: {
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
  },
  categoryText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  postContent: {
    fontSize: fontSize.md,
    color: colors.textDark,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  commentsLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMid,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMid,
    fontSize: fontSize.md,
    marginTop: spacing.lg,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  commentName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textDark,
  },
  commentContent: {
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: 2,
  },
  commentTimestamp: {
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
    fontSize: fontSize.md,
    color: colors.textDark,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
