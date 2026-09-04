import { useEffect, useMemo, useRef, useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  subscribeToMessages,
  subscribeToTyping,
  markMessagesAsRead,
} from '../../lib/chat';
import { formatRelativeTime, formatDayLabel, isSameDay } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { MessageSkeleton } from '../../components/Skeleton';
import TypingIndicator from '../../components/TypingIndicator';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, Message, ReportTargetType } from '../../types';

const PAGE_SIZE = 50;

export default function ConversationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Conversation'>>();
  const { conversationId, otherUser } = route.params;
  const { user } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  // Never auto-sent — just starts the composer with a draft already typed
  // (e.g. StoryViewer's "Say Hi"); the user still has to review and hit Send.
  const [text, setText] = useState(route.params.prefillText ?? '');
  const [sending, setSending] = useState(false);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<FlatList>(null);
  const typingRef = useRef<ReturnType<typeof subscribeToTyping> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppresses the auto-scroll-to-bottom while an older page is being
  // prepended — without this, loading history would immediately yank the
  // view back down to the newest message instead of staying put.
  const isLoadingOlderRef = useRef(false);

  // Only the very last bubble I sent ever shows a read receipt — matching how
  // iMessage/Instagram DMs do it, instead of stamping every message.
  const lastMineMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, user?.id]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const data = await fetchMessages(conversationId, PAGE_SIZE);
        if (isMounted) {
          setMessages(data);
          setHasMoreOlder(data.length === PAGE_SIZE);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load messages.';
        Alert.alert('Error', message);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    if (user) {
      markMessagesAsRead(conversationId, user.id).catch(() => {});
    }

    const unsubscribe = subscribeToMessages(conversationId, ({ type, message }) => {
      if (type === 'insert') {
        setMessages((prev) => [...prev, message]);
        // If the other person's message arrives while this screen is open, mark it read immediately.
        if (user && message.sender_id !== user.id) {
          markMessagesAsRead(conversationId, user.id).catch(() => {});
          // The message itself replaces the "typing..." bubble, so clear it right away
          // instead of waiting for the timeout below.
          setOtherTyping(false);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        }
      } else {
        // Covers edits, deletes, and read-receipt updates alike — just merge by id.
        setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [conversationId, user]);

  // Ephemeral broadcast channel — no table, no history, just relayed to whoever
  // else is subscribed to this conversation's typing topic right now.
  useEffect(() => {
    const typing = subscribeToTyping(conversationId, () => {
      setOtherTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      // Auto-clears if no further keystrokes arrive — the other side never sends
      // an explicit "stopped typing" event.
      typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
    });
    typingRef.current = typing;

    return () => {
      typing.unsubscribe();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId]);

  const handleLoadOlder = async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    setLoadingOlder(true);
    isLoadingOlderRef.current = true;
    try {
      const older = await fetchMessages(conversationId, PAGE_SIZE, messages[0].created_at);
      setMessages((prev) => [...older, ...prev]);
      setHasMoreOlder(older.length === PAGE_SIZE);
    } catch {
      // leave hasMoreOlder as-is — the button just stays available to retry
    } finally {
      setLoadingOlder(false);
      // Let the list finish re-rendering with the prepended items before
      // auto-scroll is allowed to react to content-size changes again.
      setTimeout(() => {
        isLoadingOlderRef.current = false;
      }, 0);
    }
  };

  // Scrolls to a message already loaded in this conversation (e.g. tapping a
  // quoted reply) — best-effort, since FlatList can't always resolve the
  // index of an item it hasn't measured yet.
  const handleJumpToMessage = (messageId: string) => {
    const index = messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    try {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    } catch {
      // ignored — not worth a fallback for a nice-to-have jump
    }
  };

  const handleChangeText = (value: string) => {
    setText(value);
    if (user && value.trim()) {
      typingRef.current?.sendTyping(user.id);
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;

    setSending(true);
    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, trimmed);
        setEditingMessage(null);
      } else {
        await sendMessage({
          conversationId,
          senderId: user.id,
          content: trimmed,
          replyToMessageId: replyTarget?.id,
        });
        setReplyTarget(null);
      }
      setText(''); // the sent/edited message arrives back via the real-time subscription above
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send message.';
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  };

  const handleLongPressMessage = (message: Message) => {
    if (message.deleted_at) return; // nothing to do on an already-deleted tombstone
    setMenuMessage(message);
  };

  const handleCopyMessage = async (message: Message) => {
    await Clipboard.setStringAsync(message.content);
    showToast('Copied to clipboard');
  };

  const handleEditMessage = (message: Message) => {
    setReplyTarget(null); // mutually exclusive with editing — only one banner at a time
    setEditingMessage(message);
    setText(message.content);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setText('');
  };

  const handleReplyMessage = (message: Message) => {
    setEditingMessage(null); // mutually exclusive with editing — only one banner at a time
    setReplyTarget(message);
  };

  const handleCancelReply = () => setReplyTarget(null);

  const handleDeleteMessage = (message: Message) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(message.id);
            if (editingMessage?.id === message.id) handleCancelEdit();
          } catch (err) {
            const errMessage = err instanceof Error ? err.message : 'Could not delete message.';
            Alert.alert('Error', errMessage);
          }
        },
      },
    ]);
  };

  const isMenuMessageMine = menuMessage?.sender_id === user?.id;
  const menuActions: ActionSheetAction[] = menuMessage
    ? [
        { label: 'Reply', icon: 'arrow-undo-outline', onPress: () => handleReplyMessage(menuMessage) },
        { label: 'Copy', icon: 'copy-outline', onPress: () => handleCopyMessage(menuMessage) },
        ...(isMenuMessageMine
          ? ([
              { label: 'Edit', icon: 'create-outline', onPress: () => handleEditMessage(menuMessage) },
              {
                label: 'Delete',
                icon: 'trash-outline',
                destructive: true,
                onPress: () => handleDeleteMessage(menuMessage),
              },
            ] as ActionSheetAction[])
          : ([
              {
                label: 'Report Message',
                icon: 'flag-outline',
                onPress: () => setReportTarget({ type: 'message', id: menuMessage.id }),
              },
            ] as ActionSheetAction[])),
      ]
    : [];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => navigation.navigate('UserProfile', { userId: otherUser.id })}
        >
          <Avatar uri={otherUser.avatar_url} size={36} />
          <Text style={styles.headerName}>{otherUser.full_name ?? 'Unknown'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.list}>
          <MessageSkeleton />
          <MessageSkeleton mine />
          <MessageSkeleton />
          <MessageSkeleton mine />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={() => {
            if (isLoadingOlderRef.current) return;
            listRef.current?.scrollToEnd({ animated: true });
          }}
          ListHeaderComponent={
            hasMoreOlder && messages.length > 0 ? (
              <TouchableOpacity style={styles.loadOlderButton} onPress={handleLoadOlder} disabled={loadingOlder}>
                {loadingOlder ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.loadOlderText}>Load earlier messages</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={<EmptyState icon="happy-outline" title="Say hello!" subtitle="Start the conversation." />}
          renderItem={({ item, index }) => {
            const isMine = item.sender_id === user?.id;
            const isDeleted = !!item.deleted_at;
            const prevItem = messages[index - 1];
            const nextItem = messages[index + 1];
            const showDaySeparator = !prevItem || !isSameDay(prevItem.created_at, item.created_at);
            // The last bubble in a consecutive run from the same sender (within the same day)
            // carries the small avatar, Messenger-style — earlier ones in the run leave the
            // space blank so the bubble column stays aligned.
            const isLastInGroup =
              !nextItem || nextItem.sender_id !== item.sender_id || !isSameDay(nextItem.created_at, item.created_at);
            const showAvatar = !isMine && isLastInGroup;

            return (
              <View>
                {showDaySeparator && (
                  <View style={styles.daySeparator}>
                    <Text style={styles.daySeparatorText}>{formatDayLabel(item.created_at)}</Text>
                  </View>
                )}
                <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  {!isMine && (
                    <View style={styles.avatarSlot}>
                      {showAvatar ? <Avatar uri={otherUser.avatar_url} size={24} /> : null}
                    </View>
                  )}
                  <View style={[styles.bubbleCol, isMine ? styles.bubbleColMine : styles.bubbleColTheirs]}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isDeleted}
                      onLongPress={() => handleLongPressMessage(item)}
                      style={[
                        styles.bubble,
                        isMine ? styles.bubbleMine : styles.bubbleTheirs,
                        isDeleted && styles.bubbleDeleted,
                      ]}
                    >
                      {isDeleted ? (
                        <Text style={styles.deletedText}>
                          {isMine ? 'You deleted this message' : 'This message was deleted'}
                        </Text>
                      ) : (
                        <>
                          {item.reply_to_message_id &&
                            (() => {
                              const repliedTo = messages.find((m) => m.id === item.reply_to_message_id);
                              // Not currently loaded (e.g. an older page that hasn't been
                              // fetched yet) — omit rather than show a broken reference.
                              if (!repliedTo) return null;
                              return (
                                <TouchableOpacity
                                  style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs]}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleJumpToMessage(repliedTo.id);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.replyQuoteText,
                                      isMine ? styles.replyQuoteTextMine : styles.replyQuoteTextTheirs,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {repliedTo.deleted_at ? 'Original message deleted' : repliedTo.content}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })()}
                          <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <View style={styles.messageFooter}>
                      <Text style={styles.messageTimestamp}>{formatRelativeTime(item.created_at)}</Text>
                      {item.edited_at && !isDeleted ? <Text style={styles.editedLabel}>(edited)</Text> : null}
                    </View>
                    {isMine && item.id === lastMineMessageId && item.read_at && !isDeleted ? (
                      <Text style={styles.readReceipt}>Read</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            otherTyping ? (
              <View style={[styles.bubbleRow, styles.bubbleRowTheirs]}>
                <View style={styles.avatarSlot}>
                  <Avatar uri={otherUser.avatar_url} size={24} />
                </View>
                <View style={[styles.bubble, styles.bubbleTheirs]}>
                  <TypingIndicator />
                </View>
              </View>
            ) : null
          }
        />
      )}

      {editingMessage && (
        <View style={styles.editingBanner}>
          <Ionicons name="create-outline" size={14} color={colors.textMid} />
          <Text style={styles.editingBannerText}>Editing message</Text>
          <TouchableOpacity onPress={handleCancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color={colors.textMid} />
          </TouchableOpacity>
        </View>
      )}

      {replyTarget && !editingMessage && (
        <View style={styles.editingBanner}>
          <Ionicons name="arrow-undo-outline" size={14} color={colors.textMid} />
          <View style={styles.replyBannerText}>
            <Text style={styles.editingBannerText} numberOfLines={1}>
              Replying to {replyTarget.sender_id === user?.id ? 'yourself' : otherUser.full_name ?? 'them'}
            </Text>
            <Text style={styles.replyBannerPreview} numberOfLines={1}>
              {replyTarget.deleted_at ? 'Message deleted' : replyTarget.content}
            </Text>
          </View>
          <TouchableOpacity onPress={handleCancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color={colors.textMid} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.textLight}
          value={text}
          onChangeText={handleChangeText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (sending || !text.trim()) && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={sending || !text.trim()}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ActionSheet visible={menuMessage !== null} onClose={() => setMenuMessage(null)} actions={menuActions} />
      <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    marginRight: spacing.xs,
  },
  headerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  loadOlderButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  loadOlderText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  replyQuote: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    marginBottom: 4,
  },
  replyQuoteMine: {
    borderLeftColor: 'rgba(255,255,255,0.6)',
  },
  replyQuoteTheirs: {
    borderLeftColor: colors.primary,
  },
  replyQuoteText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
  },
  replyQuoteTextMine: {
    color: 'rgba(255,255,255,0.85)',
  },
  replyQuoteTextTheirs: {
    color: colors.textMid,
  },
  daySeparator: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  daySeparatorText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textLight,
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    width: 24,
    height: 24,
    marginRight: spacing.xs,
  },
  bubbleCol: {
    maxWidth: '76%',
  },
  bubbleColMine: {
    alignItems: 'flex-end',
  },
  bubbleColTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.subtle,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleTheirs: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleDeleted: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleTextMine: {
    fontFamily: fontFamily.regular,
    color: '#fff',
    fontSize: fontSize.md,
  },
  bubbleTextTheirs: {
    fontFamily: fontFamily.regular,
    color: colors.textDark,
    fontSize: fontSize.md,
  },
  deletedText: {
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    color: colors.textLight,
    fontSize: fontSize.sm,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  messageTimestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  editedLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    fontStyle: 'italic',
  },
  readReceipt: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 1,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
  },
  editingBannerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  replyBannerText: {
    flex: 1,
  },
  replyBannerPreview: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 1,
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
