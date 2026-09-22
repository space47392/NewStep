import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import ErrorState from '../../components/ErrorState';
import { MessageSkeleton } from '../../components/Skeleton';
import TypingIndicator from '../../components/TypingIndicator';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, Message, ReportTargetType } from '../../types';

const PAGE_SIZE = 50;
// How close to the bottom (in px) counts as "near the bottom" for auto-scroll
// purposes — a little slack so a few px of overscroll/momentum doesn't flip
// this off right as someone reaches the newest message.
const NEAR_BOTTOM_THRESHOLD = 120;

// Two messages share a timestamp bucket when they land in the same calendar
// minute — matches formatRelativeTime()'s own "Just now" granularity for the
// common case, and stays a fixed, absolute comparison (not relative to
// render time) so a run of messages doesn't regroup on its own just because
// time passed; it only changes when messages are actually added or removed.
// Independent of sender — a same-minute run across two different senders is
// still one bucket (see the timestamp-visibility rule below).
function sameTimestampBucket(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);
}

export default function ConversationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Conversation'>>();
  const { conversationId, otherUser } = route.params;
  const { user } = useAuth();
  const { showToast } = useToast();
  // This screen is stack-pushed full-screen (not nested in the bottom tab
  // bar), so its own composer sits at the true bottom edge on Android's
  // edge-to-edge layout — react-native-safe-area-context reports the current
  // window inset reactively (including while the keyboard is open, when the
  // reserved system-gesture area is effectively covered), so using it
  // directly here needs no separate keyboard-visibility tracking.
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  // True only after a load attempt that never previously succeeded fails —
  // a later failure (after messages have ever loaded once) shows a toast
  // instead and leaves the existing messages as-is (Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
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
  // Set when a realtime message arrives while isLoadingOlderRef is true —
  // its own scrollToEnd() gets suppressed along with the older-page
  // prepend's, so this catches it up once the suppression window ends
  // instead of silently dropping that one auto-scroll. Never triggers a
  // scroll just because Load Earlier finished — only when a genuinely new
  // message actually arrived during it (Step 45).
  const pendingScrollToEndRef = useRef(false);
  // Tracks whether the user is currently scrolled near the newest message —
  // updated on every scroll event. Auto-scroll-to-end (on new content, or on
  // the keyboard opening) only fires while this is true, so a realtime
  // message arriving while someone is scrolled up reading history doesn't
  // yank them back down to the bottom. Starts true: opening a conversation
  // should show the newest messages first.
  const isNearBottomRef = useRef(true);
  // Set by the keyboardDidShow listener when a keyboard-open scroll is
  // warranted (near bottom) — the actual scroll doesn't happen there. It
  // happens once the FlatList's own onLayout fires with a settled height
  // (see handleListLayout below), since KeyboardAvoidingView's Android
  // 'height' resize is itself animated: scrolling right on keyboardDidShow
  // would race that animation and could land short of the real bottom.
  const pendingKeyboardScrollRef = useRef(false);
  const keyboardScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The very first onContentSizeChange after opening a conversation (or
  // returning to it) snaps to the bottom instantly instead of animating —
  // an animated scroll-from-top-to-bottom right as the screen appears reads
  // as an unwanted "jump," whereas the conversation should just already be
  // open at the right place. Every later content-size change (a genuinely
  // new message arriving) still scrolls smoothly as before.
  const hasScrolledOnLoadRef = useRef(false);

  // Only the very last bubble I sent ever shows a read receipt — matching how
  // iMessage/Instagram DMs do it, instead of stamping every message.
  const lastMineMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, user?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reusable so a failed initial load can be retried in place (ErrorState's
  // button) without re-running the subscription setup below a second time.
  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchMessages(conversationId, PAGE_SIZE);
      if (!isMountedRef.current) return;
      setMessages(data);
      setHasMoreOlder(data.length === PAGE_SIZE);
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (!isMountedRef.current) return;
      // Only a genuinely first-ever failure (no messages have ever
      // successfully loaded) shows the blocking ErrorState — a later
      // failure keeps the existing messages and just says so (Step 36).
      if (hasEverLoadedRef.current) {
        showToast("Couldn't load messages");
      } else {
        setLoadFailed(true);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [conversationId, showToast]);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadMessages();
    setRetrying(false);
  };

  // Depends on user?.id, not the whole `user` object — `user` gets a new
  // object reference on every Supabase access-token refresh even though the
  // signed-in account hasn't changed, which would otherwise tear down and
  // recreate this channel (and re-run loadMessages()/markMessagesAsRead())
  // roughly hourly on a long-lived conversation screen, opening a window for
  // a message to be duplicated between the old channel's INSERT event and
  // the fresh loadMessages() fetch (Step 41).
  useEffect(() => {
    loadMessages();

    if (user) {
      markMessagesAsRead(conversationId, user.id).catch(() => {});
    }

    const unsubscribe = subscribeToMessages(conversationId, ({ type, message }) => {
      if (type === 'insert') {
        // A message I just sent should always bring the bottom into view,
        // regardless of where I was scrolled — sending is an explicit
        // action that implies wanting to see it land (Step 63 polish).
        if (user && message.sender_id === user.id) {
          isNearBottomRef.current = true;
        }
        setMessages((prev) => [...prev, message]);
        // onContentSizeChange's own auto-scroll is suppressed while Load
        // Earlier is in flight — flag that one got missed so it can be
        // caught up once that suppression window ends (Step 45).
        if (isLoadingOlderRef.current) {
          pendingScrollToEndRef.current = true;
        }
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
      unsubscribe();
    };
  }, [conversationId, user?.id, loadMessages]);

  // Realtime doesn't replay events missed while disconnected (e.g. the app
  // backgrounded for a while and the OS suspended its network activity) — a
  // message sent during that gap would otherwise never appear until the user
  // leaves and reopens this conversation. Catches up on foreground by
  // fetching the newest page fresh and merging in only what isn't already
  // loaded, the same "merge without disturbing what's already there"
  // principle as Feed/Notifications' focus-merge — never replaces `messages`
  // outright, so any already-loaded "Load Older" pages are untouched.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      fetchMessages(conversationId, PAGE_SIZE)
        .then((latest) => {
          if (!isMountedRef.current) return;
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = latest.filter((m) => !existingIds.has(m.id));
            if (newOnes.length === 0) return prev;
            return [...prev, ...newOnes].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
          if (user?.id) markMessagesAsRead(conversationId, user.id).catch(() => {});
        })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [conversationId, user?.id]);

  // Ephemeral broadcast channel — no table, no history, just relayed to whoever
  // else is subscribed to this conversation's typing topic right now.
  useEffect(() => {
    const typing = subscribeToTyping(conversationId, (userId) => {
      // subscribeToTyping's own `self: false` config only excludes the exact
      // same client instance's own broadcast — it doesn't know about a
      // second session of the SAME account (e.g. the same conversation open
      // on another device). Without this check, that would show up here as
      // "the other person is typing" when it's actually this account typing
      // somewhere else (Step 45).
      if (userId === user?.id) return;
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
  }, [conversationId, user?.id]);

  // Decides WHETHER a keyboard-open scroll is warranted — only if the user
  // was already near the bottom, so the composer growing upward
  // (KeyboardAvoidingView) never silently scrolls someone away from older
  // messages they were reading. Doesn't scroll here itself: on Android,
  // 'keyboardDidShow' fires as the keyboard finishes appearing, but
  // KeyboardAvoidingView's own height-shrink animation is still running at
  // that point (it reacts to the same event), so scrolling immediately here
  // would race that resize and could settle short of the real bottom,
  // leaving the newest message partly behind the composer. The flag set
  // here is consumed by handleListLayout below, once the resize has
  // actually landed.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (isNearBottomRef.current) {
        pendingKeyboardScrollRef.current = true;
      }
    });
    return () => {
      sub.remove();
      if (keyboardScrollDebounceRef.current) clearTimeout(keyboardScrollDebounceRef.current);
    };
  }, []);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
  };

  // Fires on every layout pass of the FlatList itself — including each frame
  // of KeyboardAvoidingView's resize animation as it shrinks the space
  // available to the list. Debounced rather than acted on immediately: while
  // a pending keyboard-open scroll is armed, each call here means "the
  // height just changed again, so it isn't settled yet" and pushes the
  // actual scrollToEnd() a little further out; once layout calls stop
  // arriving (the resize animation has actually finished), the debounced
  // timer fires exactly once. This is what "after the layout has actually
  // resized" means in practice — no separate onAnimationEnd-style signal
  // exists for KeyboardAvoidingView to hook into instead.
  const handleListLayout = () => {
    if (!pendingKeyboardScrollRef.current) return;
    if (keyboardScrollDebounceRef.current) clearTimeout(keyboardScrollDebounceRef.current);
    keyboardScrollDebounceRef.current = setTimeout(() => {
      pendingKeyboardScrollRef.current = false;
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
  };

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
        // Catch up exactly one suppressed auto-scroll if a new message
        // genuinely arrived while this was loading — never fires just
        // because Load Earlier itself finished, so it doesn't yank the user
        // away from the older messages they just asked to see (Step 45).
        // Also gated on isNearBottomRef (Step 63): clicking Load Earlier
        // itself implies the user is reading history, so a realtime message
        // arriving during that fetch shouldn't force them back down either
        // — unless it was their own message (which already set the flag
        // true above) or they'd scrolled back near the bottom in the
        // meantime.
        if (pendingScrollToEndRef.current) {
          pendingScrollToEndRef.current = false;
          if (isNearBottomRef.current) {
            listRef.current?.scrollToEnd({ animated: true });
          }
        }
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
    // otherUser null means the other participant has deleted their account
    // (Step 56) — this is a preserved, historical conversation only; the
    // composer that would call this is already hidden in that state, but
    // this guard keeps the same rule true even if reached some other way.
    // The real, unbypassable boundary is the messages INSERT RLS policy
    // (requires BOTH conversation participants to still be non-null).
    if (!trimmed || !user || !otherUser) return;

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
        // Reply requires the composer, which is hidden entirely once
        // otherUser is null (Step 56) — omitted here rather than left as a
        // dead action that would silently do nothing when tapped.
        ...(otherUser
          ? ([{ label: 'Reply', icon: 'arrow-undo-outline', onPress: () => handleReplyMessage(menuMessage) }] as ActionSheetAction[])
          : []),
        { label: 'Copy', icon: 'copy-outline', onPress: () => handleCopyMessage(menuMessage) },
        ...(isMenuMessageMine
          ? ([
              // Edit also needs the composer (same as Reply above) — omitted
              // in the preserved-conversation state for the same reason.
              // Delete doesn't touch the composer at all (a direct RPC call
              // behind a confirm dialog), so it stays available either way.
              ...(otherUser
                ? ([{ label: 'Edit', icon: 'create-outline', onPress: () => handleEditMessage(menuMessage) }] as ActionSheetAction[])
                : []),
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
    // 'height' on Android (was `undefined`, Step 63): shrinks this View's own
    // measured height using RN's Keyboard events, independent of whatever the
    // OS's window-resize mode happens to do — the header/list/composer are
    // all inside this same component, so the whole screen compresses as one
    // unit rather than depending on Android's adjustResize propagating
    // correctly through react-native-screens (a known source of "composer
    // hidden behind the keyboard" bugs in Expo + React Navigation apps).
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerUser}
          disabled={!otherUser}
          onPress={() => otherUser && navigation.navigate('UserProfile', { userId: otherUser.id })}
        >
          <Avatar uri={otherUser?.avatar_url ?? null} size={36} />
          <Text style={styles.headerName}>{otherUser ? (otherUser.full_name ?? 'Unknown') : 'Deleted User'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.list}>
          <MessageSkeleton />
          <MessageSkeleton mine />
          <MessageSkeleton />
          <MessageSkeleton mine />
        </View>
      ) : loadFailed ? (
        <View style={styles.list}>
          <ErrorState onRetry={handleRetry} retrying={retrying} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onLayout={handleListLayout}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => {
            if (isLoadingOlderRef.current) return;
            // Only auto-scroll while already near the bottom (Step 63) — a
            // message arriving while someone is scrolled up reading older
            // history shouldn't yank them back down. Sending your own
            // message already forces isNearBottomRef true above, so it
            // still always scrolls into view.
            if (!isNearBottomRef.current) return;
            if (!hasScrolledOnLoadRef.current) {
              hasScrolledOnLoadRef.current = true;
              listRef.current?.scrollToEnd({ animated: false });
              return;
            }
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
            // First bubble of a new run (sender changed, or a new day) gets a
            // little extra breathing room above it, on top of every row's own
            // small marginBottom — consecutive messages from the same sender
            // read as one visual group (tight spacing.xs gap), while a
            // sender change reads as a clear break (spacing.xs + spacing.xs =
            // the original spacing.sm gap, unchanged). Skipped when a day
            // separator is already about to provide that same break, so the
            // two don't stack.
            const isFirstInGroup =
              !prevItem || prevItem.sender_id !== item.sender_id || !isSameDay(prevItem.created_at, item.created_at);
            // Shows the timestamp only on the last message of a consecutive
            // same-minute run — independent of the sender grouping above, so
            // a same-minute run across two different senders still only
            // shows one timestamp, at the end of that run.
            const showTimestamp = !nextItem || !sameTimestampBucket(item.created_at, nextItem.created_at);

            return (
              <View>
                {showDaySeparator && (
                  <View style={styles.daySeparator}>
                    <Text style={styles.daySeparatorText}>{formatDayLabel(item.created_at)}</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.bubbleRow,
                    isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                    isFirstInGroup && !showDaySeparator && styles.bubbleRowGroupStart,
                  ]}
                >
                  {!isMine && (
                    <View style={styles.avatarSlot}>
                      {/* A 1:1 conversation only ever has two possible senders — "not
                          mine" always means otherUser, whether or not THIS specific
                          message's own sender_id happens to be null (Step 56); Avatar
                          already renders its placeholder icon for a null uri. */}
                      {showAvatar ? <Avatar uri={otherUser?.avatar_url ?? null} size={24} /> : null}
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
                      {showTimestamp ? (
                        <Text style={styles.messageTimestamp}>{formatRelativeTime(item.created_at)}</Text>
                      ) : null}
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
                  <Avatar uri={otherUser?.avatar_url ?? null} size={24} />
                </View>
                <View style={[styles.bubble, styles.bubbleTheirs]}>
                  <TypingIndicator />
                </View>
              </View>
            ) : null
          }
        />
      )}

      {otherUser ? (
        <>
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
                  Replying to {replyTarget.sender_id === user?.id ? 'yourself' : (otherUser.full_name ?? 'them')}
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

          <View style={[styles.inputRow, { paddingBottom: spacing.md + insets.bottom }]}>
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
        </>
      ) : (
        // otherUser is null — this participant has deleted their account
        // (Step 56). The conversation and its history stay fully readable
        // above, but there is no one left to send a new message to: no
        // composer, no editing, no replying, no starting a new conversation
        // from here. The real boundary is the messages INSERT RLS policy
        // (requires both participants to still be non-null) — this is just
        // the matching, honest UI state on top of it.
        <View style={[styles.unavailableBanner, { paddingBottom: spacing.md + insets.bottom }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textLight} />
          <Text style={styles.unavailableText}>This user is no longer available.</Text>
        </View>
      )}

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
    marginBottom: spacing.xs,
  },
  // Extra top margin for the first bubble in a new run — combined with every
  // row's own spacing.xs marginBottom, a sender change reads with the same
  // total gap (spacing.xs + spacing.xs) the whole list used to have
  // uniformly; consecutive same-sender bubbles now sit closer together
  // (spacing.xs alone) instead.
  bubbleRowGroupStart: {
    marginTop: spacing.xs,
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
    // Android defaults a multiline TextInput's text to vertically centered,
    // which looks fine for one line but drifts oddly as it grows toward
    // maxHeight — iOS already starts multiline text from the top by default,
    // this just makes Android match it. No-op on iOS.
    textAlignVertical: 'top',
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
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  unavailableText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
});
