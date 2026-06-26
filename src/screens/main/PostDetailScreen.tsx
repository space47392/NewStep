import { useEffect, useState } from 'react';
import {
  View,
  Text,
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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { fetchComments, addComment, subscribeToComments } from '../../lib/comments';
import { volunteerToHelp, markPostCompleted } from '../../lib/posts';
import { getOrCreateConversation } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
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

  const category = CATEGORY_STYLES[post.category];
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <FadeInView style={styles.postCard}>
            <View style={styles.postHeader}>
              <Avatar uri={post.profiles?.avatar_url} size={44} />
              <View style={styles.postHeaderText}>
                <Text style={styles.name}>{post.profiles?.full_name ?? 'Unknown'}</Text>
                {post.profiles?.school_name ? <Text style={styles.school}>{post.profiles.school_name}</Text> : null}
              </View>
              <Text style={styles.timestamp}>{formatRelativeTime(post.created_at)}</Text>
            </View>

            <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
              <Ionicons name={category.icon} size={12} color={category.text} />
              <Text style={[styles.categoryText, { color: category.text }]}>{post.category}</Text>
            </View>

            <Text style={styles.postContent}>{post.content}</Text>

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
                <View style={styles.helperRow}>
                  <Avatar uri={post.helper.avatar_url} size={36} />
                  <View style={styles.helperTextWrap}>
                    <Text style={styles.helperName}>{post.helper.full_name ?? 'Unknown'}</Text>
                    {post.helper.school_name ? (
                      <Text style={styles.helperSchool}>{post.helper.school_name}</Text>
                    ) : null}
                  </View>
                </View>
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
              {loading ? 'Loading comments...' : `${comments.length} Comment${comments.length === 1 ? '' : 's'}`}
            </Text>
          </FadeInView>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="chatbubbles-outline" title="No comments yet" subtitle="Start the conversation!" />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.commentRow}>
            <Avatar uri={item.profiles?.avatar_url} size={32} />
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
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  postCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
