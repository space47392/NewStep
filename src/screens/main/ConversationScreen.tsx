import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Keyboard, Platform, ActivityIndicator, AppState, StyleSheet, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { warmAlert } from '../../components/WarmAlert';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
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
  fetchConversationOriginPostId,
} from '../../lib/chat';
import { fetchPostById } from '../../lib/posts';
import { resolveSchoolName } from '../../lib/schools';
import Avatar from '../../components/Avatar';
import { fetchProfileById } from '../../lib/profile';
import InterestIcon from '../../components/InterestIcon';
import ErrorState from '../../components/ErrorState';
import { MessageSkeleton } from '../../components/Skeleton';
import NSIcon from '../../components/NSIcon';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import FadeInView from '../../components/FadeInView';
import PressableScale from '../../components/PressableScale';
import { getChatDraft, saveChatDraft } from '../../lib/chatDrafts';
import * as ImagePicker from 'expo-image-picker';
import { askPermission } from '../../components/askPermission';
import { removeChatPhoto, uploadChatAudio, uploadChatPhoto } from '../../lib/chatPhotos';
import { formatVoiceTime } from '../../components/VoiceBubble';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, Message, Post, ReportTargetType } from '../../types';
import { errorMessage } from '../../lib/errors';
import { useStableCallback } from '../../lib/useStableCallback';
import { useVoiceRecorder } from '../../lib/useVoiceRecorder';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import MessageRow, { TypingRow } from '../../components/chat/MessageRow';

const PAGE_SIZE = 50;
// How close to the bottom (in px) counts as "near the bottom" for auto-scroll
// purposes — a little slack so a few px of overscroll/momentum doesn't flip
// this off right as someone reaches the newest message.
const NEAR_BOTTOM_THRESHOLD = 120;
// Voice messages stop and send on their own at two minutes.
const VOICE_MAX_MS = 120000;

export default function ConversationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Conversation'>>();
  const { conversationId, otherUser } = route.params;
  const { user } = useAuth();
  // Effects key off the id: `user` is a new object on every token refresh.
  const userId = user?.id;
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
  // Shared interests for the empty-chat "say hello" prompt — a conversation
  // starter built only from what both profiles actually list.
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  // "@username · School" under the name in the header, so you always know
  // exactly who you're talking to.
  const [otherSubtitle, setOtherSubtitle] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  // The help request this chat started from (conversation_origin.sql), shown
  // in the intro card — "You met through a help request".
  const [originPost, setOriginPost] = useState<Post | null>(null);
  // Floating "jump to newest" button: shown while scrolled up, and counts
  // the other person's messages that arrived meanwhile.
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  // Restore whatever was left unsent here last time (unless this chat was
  // opened with its own prefilled text), and keep saving it as it changes.
  const draftLoadedRef = useRef(false);
  const prefillText = route.params.prefillText;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    if (prefillText) {
      draftLoadedRef.current = true;
      return;
    }
    getChatDraft(userId, conversationId).then((draft) => {
      if (cancelled) return;
      if (draft) setText((current) => current || draft);
      draftLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [userId, conversationId, prefillText]);
  useEffect(() => {
    if (!user?.id || !draftLoadedRef.current || editingMessage) return;
    const timer = setTimeout(() => saveChatDraft(user.id, conversationId, text), 400);
    return () => clearTimeout(timer);
  }, [text, user?.id, conversationId, editingMessage]);

  useEffect(() => {
    let cancelled = false;
    fetchConversationOriginPostId(conversationId)
      .then((postId) => (postId ? fetchPostById(postId) : null))
      .then((post) => {
        if (!cancelled) setOriginPost(post);
      })
      .catch(() => {
        // Optional nicety — the card just doesn't show.
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<FlatList>(null);
  // Mine, sent but not yet saved (shown faded).
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Theirs, relayed live but not yet confirmed by the saved row; dropped if
  // the real row never arrives (so nothing unsaved can linger).
  const liveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
  const inputRef = useRef<TextInput>(null);
  const [localPhotos, setLocalPhotos] = useState<Record<string, string>>({});
  // Voice messages: the recorder (sends on its own at two minutes) and local files still sending.
  const voice = useVoiceRecorder({ maxMs: VOICE_MAX_MS, onMaxReached: () => sendRecording() });
  const [localAudio, setLocalAudio] = useState<Record<string, string>>({});
  const sendingVoiceRef = useRef(false);
  // Reply / Edit put the cursor straight in the message box. Slight delay so
  // the action sheet has finished closing and doesn't steal focus back.
  const focusComposer = () => setTimeout(() => inputRef.current?.focus(), 250);
  // For a moment after the first load, content above the messages (the intro
  // card, its shared-interest chips, the "met through" card) can still arrive
  // and change the height. Until then, keep snapping to the newest message
  // regardless of scroll position, so the chat never opens half-scrolled.
  const loadSettleUntilRef = useRef(0);

  // The intro card's details (profile, shared interests, help-request origin)
  // arrive after the messages, growing the list from the top. Re-pin to the
  // newest message once they land — but only right after opening, never
  // while someone is reading back through history.
  useEffect(() => {
    if (!hasScrolledOnLoadRef.current || Date.now() > loadSettleUntilRef.current) return;
    const timers = [60, 300].map((ms) =>
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [otherSubtitle, sharedInterests, originPost, myAvatarUrl]);

  // Only the very last bubble I sent ever shows a read receipt — matching how
  // iMessage/Instagram DMs do it, instead of stamping every message.
  const lastMineMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, user?.id]);

  useEffect(() => {
    if (!user || !otherUser) return;
    let cancelled = false;
    Promise.all([fetchProfileById(user.id), fetchProfileById(otherUser.id)])
      .then(([mine, theirs]) => {
        if (cancelled) return;
        setMyAvatarUrl(mine.avatar_url);
        const mineSet = new Set(mine.interests.map((i) => i.toLowerCase()));
        setSharedInterests(theirs.interests.filter((i) => mineSet.has(i.toLowerCase())));
        const parts = [theirs.username ? `@${theirs.username}` : null, resolveSchoolName(theirs)].filter(Boolean);
        setOtherSubtitle(parts.length > 0 ? parts.join(' · ') : null);
      })
      .catch(() => {
        // Optional nicety — the prompt still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [user, otherUser]);

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

    if (userId) {
      markMessagesAsRead(conversationId, userId).catch(() => {});
    }

    const unsubscribe = subscribeToMessages(conversationId, ({ type, message }) => {
      if (type === 'insert') {
        // A message I just sent should always bring the bottom into view,
        // regardless of where I was scrolled — sending is an explicit
        // action that implies wanting to see it land (Step 63 polish).
        if (userId && message.sender_id === userId) {
          isNearBottomRef.current = true;
        }
        // Already on screen (my optimistic copy, or their live preview):
        // swap in the saved row in place — same id, so no re-mount.
        const timer = liveTimersRef.current[message.id];
        if (timer) {
          clearTimeout(timer);
          delete liveTimersRef.current[message.id];
        }
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === message.id);
          if (i >= 0) return [...prev.slice(0, i), message, ...prev.slice(i + 1)];
          return [...prev, message];
        });
        // onContentSizeChange's own auto-scroll is suppressed while Load
        // Earlier is in flight — flag that one got missed so it can be
        // caught up once that suppression window ends (Step 45).
        if (isLoadingOlderRef.current) {
          pendingScrollToEndRef.current = true;
        }
        // If the other person's message arrives while this screen is open, mark it read immediately.
        if (userId && message.sender_id !== userId) {
          if (!isNearBottomRef.current) setUnseenCount((n) => n + 1);
          markMessagesAsRead(conversationId, userId).catch(() => {});
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
  }, [conversationId, userId, loadMessages]);

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
    }, (live) => {
      // Only a preview from the other participant in THIS conversation.
      if (!live || typeof live.id !== 'string' || typeof live.content !== 'string') return;
      if (live.conversation_id !== conversationId || live.sender_id === user?.id) return;
      if (live.content.length > 4000) return;
      setOtherTyping(false);
      setMessages((prev) => (prev.some((m) => m.id === live.id) ? prev : [...prev, { ...live, read_at: null, edited_at: null, deleted_at: null }]));
      liveTimersRef.current[live.id] = setTimeout(() => {
        // The real row never came — drop the preview.
        setMessages((prev) => prev.filter((m) => m.id !== live.id));
        delete liveTimersRef.current[live.id];
      }, 15000);
    });
    typingRef.current = typing;

    return () => {
      Object.values(liveTimersRef.current).forEach(clearTimeout);
      liveTimersRef.current = {};
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
    // A bit more slack than the auto-scroll threshold, so the button doesn't
    // flicker in and out right at the bottom.
    const farUp = distanceFromBottom > layoutMeasurement.height * 0.75;
    setShowJumpButton(farUp);
    if (isNearBottomRef.current) setUnseenCount(0);
  };

  const handleJumpToBottom = () => {
    isNearBottomRef.current = true;
    setUnseenCount(0);
    setShowJumpButton(false);
    listRef.current?.scrollToEnd({ animated: true });
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
        await handleCancelEdit();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      } else {
        // Optimistic: the bubble appears instantly (slightly faded until the
        // server confirms), and the field is free for the next message.
        const tempId = Crypto.randomUUID();
        const replyId = replyTarget?.id ?? null;
        const placeholder = {
          id: tempId,
          conversation_id: conversationId,
          sender_id: user.id,
          content: trimmed,
          created_at: new Date().toISOString(),
          read_at: null,
          edited_at: null,
          deleted_at: null,
          reply_to_message_id: replyId,
        } as Message;
        isNearBottomRef.current = true;
        setPendingIds((p) => new Set(p).add(tempId));
        setMessages((prev) => [...prev, placeholder]);
        // Straight to the other person, before the database round trip.
        typingRef.current?.sendLive(placeholder);
        // Follow it down, once it has laid out.
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 350);
        setText('');
        setReplyTarget(null);
        saveChatDraft(user.id, conversationId, '');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSending(false);
        try {
          await sendMessage({ id: tempId, conversationId, senderId: user.id, content: trimmed, replyToMessageId: replyId ?? undefined });
          setPendingIds((p) => {
            const n = new Set(p);
            n.delete(tempId);
            return n;
          });
        } catch (err) {
          setPendingIds((p) => {
            const n = new Set(p);
            n.delete(tempId);
            return n;
          });
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setText((t) => t || trimmed);
          showToast(errorMessage(err, "Couldn't send — try again"));
        }
        return;
      }
    } catch (err) {
      const message = errorMessage(err, 'Could not send message.');
      warmAlert('Error', message);
    } finally {
      setSending(false);
    }
  };

  const handlePhoto = async () => {
    if (!user || !otherUser || sending) return;
    if (!(await askPermission(ImagePicker.requestMediaLibraryPermissionsAsync, 'photos', 'to send one'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const caption = text.trim();
    const tempId = Crypto.randomUUID();
    const replyId = replyTarget?.id ?? null;
    const placeholder = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: caption,
      created_at: new Date().toISOString(),
      read_at: null,
      edited_at: null,
      deleted_at: null,
      reply_to_message_id: replyId,
      photo_path: null,
    } as Message;
    isNearBottomRef.current = true;
    setLocalPhotos((p) => ({ ...p, [tempId]: asset.uri }));
    setPendingIds((p) => new Set(p).add(tempId));
    setMessages((prev) => [...prev, placeholder]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 400);
    setText('');
    setReplyTarget(null);
    saveChatDraft(user.id, conversationId, '');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let path: string | null = null;
    try {
      path = await uploadChatPhoto({ conversationId, senderId: user.id, localUri: asset.uri, mimeType: asset.mimeType ?? undefined });
      await sendMessage({ id: tempId, conversationId, senderId: user.id, content: caption, replyToMessageId: replyId ?? undefined, photoPath: path });
      setMessages((prev) => prev.map((m) => (m.id === tempId && !m.photo_path ? { ...m, photo_path: path } : m)));
    } catch {
      removeChatPhoto(path);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (caption) setText((t) => t || caption);
      showToast("Couldn't send the photo — try again");
    } finally {
      setPendingIds((p) => {
        const n = new Set(p);
        n.delete(tempId);
        return n;
      });
      // Keep the local preview a moment so the bubble doesn't flash while
      // the signed URL loads.
      setTimeout(() => setLocalPhotos((p) => {
        const n = { ...p };
        delete n[tempId];
        return n;
      }), 4000);
    }
  };

  const startRecording = async () => {
    if (!user || !otherUser || sending || voice.recording) return;
    if (!(await askPermission(requestRecordingPermissionsAsync, 'microphone', 'to record a voice message'))) return;
    Keyboard.dismiss();
    if (await voice.start()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else showToast("Couldn't start recording — try again");
  };

  const cancelRecording = async () => {
    await voice.cancel();
    Haptics.selectionAsync();
  };

  const sendRecording = async () => {
    if (!user || !otherUser || sendingVoiceRef.current) return;
    sendingVoiceRef.current = true;
    const clip = await voice.finish();
    if (!clip) {
      sendingVoiceRef.current = false;
      showToast('Hold on a little longer to record');
      return;
    }
    const { uri, ms } = clip;
    const tempId = Crypto.randomUUID();
    const replyId = replyTarget?.id ?? null;
    const placeholder = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: '',
      created_at: new Date().toISOString(),
      read_at: null,
      edited_at: null,
      deleted_at: null,
      reply_to_message_id: replyId,
      audio_path: null,
      audio_ms: ms,
    } as Message;
    isNearBottomRef.current = true;
    setLocalAudio((a) => ({ ...a, [tempId]: uri }));
    setPendingIds((p) => new Set(p).add(tempId));
    setMessages((prev) => [...prev, placeholder]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    setReplyTarget(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let path: string | null = null;
    try {
      path = await uploadChatAudio({ conversationId, senderId: user.id, localUri: uri });
      await sendMessage({ id: tempId, conversationId, senderId: user.id, content: '', replyToMessageId: replyId ?? undefined, audioPath: path, audioMs: ms });
      setMessages((prev) => prev.map((m) => (m.id === tempId && !m.audio_path ? { ...m, audio_path: path } : m)));
    } catch {
      removeChatPhoto(path);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast("Couldn't send the voice message — try again");
    } finally {
      sendingVoiceRef.current = false;
      setPendingIds((p) => {
        const n = new Set(p);
        n.delete(tempId);
        return n;
      });
    }
  };

  const handleWave = async () => {
    if (!user || !otherUser || sending) return;
    setSending(true);
    try {
      await sendMessage({ conversationId, senderId: user.id, content: '👋', replyToMessageId: replyTarget?.id });
      setReplyTarget(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      const message = errorMessage(err, 'Could not send.');
      warmAlert('Error', message);
    } finally {
      setSending(false);
    }
  };

  const handleLongPressMessage = (message: Message) => {
    if (message.deleted_at) return; // nothing to do on an already-deleted tombstone
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    focusComposer();
  };

  // Leaving edit mode puts back the unsent draft the edit had borrowed the
  // composer from (drafts aren't saved while editing).
  const handleCancelEdit = async () => {
    const draft = user ? await getChatDraft(user.id, conversationId) : '';
    setEditingMessage(null);
    setText(draft);
  };

  const handleReplyMessage = (message: Message) => {
    setEditingMessage(null); // mutually exclusive with editing — only one banner at a time
    setReplyTarget(message);
    focusComposer();
  };

  const handleCancelReply = () => setReplyTarget(null);

  const handleDeleteMessage = (message: Message) => {
    warmAlert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(message.id);
            removeChatPhoto(message.photo_path);
            removeChatPhoto(message.audio_path);
            if (editingMessage?.id === message.id) handleCancelEdit();
          } catch (err) {
            const errMessage = errorMessage(err, 'Could not delete message.');
            warmAlert('Error', errMessage);
          }
        },
      },
    ]);
  };

  // For reply quotes: one lookup per row instead of scanning every message.
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const otherFirstName = otherUser?.full_name?.trim().split(/\s+/)[0] ?? 'Them';
  // Stable identities, so MessageRow (memoised) skips re-rendering while typing.
  const onRowLongPress = useStableCallback(handleLongPressMessage);
  const onRowReply = useStableCallback(handleReplyMessage);
  const onRowJumpTo = useStableCallback(handleJumpToMessage);
  const onRowOpenPhoto = useStableCallback((url: string) => navigation.navigate('PhotoViewer', { photoUrls: [url], initialIndex: 0 }));

  const isMenuMessageMine = menuMessage?.sender_id === user?.id;
  const menuActions: ActionSheetAction[] = menuMessage
    ? [
        // Reply requires the composer, which is hidden entirely once
        // otherUser is null (Step 56) — omitted here rather than left as a
        // dead action that would silently do nothing when tapped.
        ...(otherUser
          ? ([{ label: 'Reply', icon: 'arrow-undo-outline', onPress: () => handleReplyMessage(menuMessage) }] as ActionSheetAction[])
          : []),
        ...(menuMessage.content.trim()
          ? ([{ label: 'Copy', icon: 'copy-outline', onPress: () => handleCopyMessage(menuMessage) }] as ActionSheetAction[])
          : []),
        ...(isMenuMessageMine
          ? ([
              // Edit also needs the composer (same as Reply above) — omitted
              // in the preserved-conversation state for the same reason.
              // Delete doesn't touch the composer at all (a direct RPC call
              // behind a confirm dialog), so it stays available either way.
              ...(otherUser && menuMessage.content.trim()
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
          <Ionicons name="arrow-back" size={20} color={colors.textDark} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerUser}
          disabled={!otherUser}
          onPress={() => otherUser && navigation.navigate('UserProfile', { userId: otherUser.id })}
        >
          <Avatar uri={otherUser?.avatar_url ?? null} size={36} />
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser ? (otherUser.full_name ?? 'Unknown') : 'Deleted User'}
            </Text>
            {otherTyping ? (
              <Text style={[styles.headerSubtitle, styles.headerTyping]} numberOfLines={1}>
                typing…
              </Text>
            ) : otherSubtitle ? (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {otherSubtitle}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.listArea}>
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
            if (Date.now() < loadSettleUntilRef.current) {
              isNearBottomRef.current = true;
              listRef.current?.scrollToEnd({ animated: false });
              return;
            }
            // Only auto-scroll while already near the bottom (Step 63) — a
            // message arriving while someone is scrolled up reading older
            // history shouldn't yank them back down. Sending your own
            // message already forces isNearBottomRef true above, so it
            // still always scrolls into view.
            if (!isNearBottomRef.current) return;
            if (!hasScrolledOnLoadRef.current) {
              hasScrolledOnLoadRef.current = true;
              loadSettleUntilRef.current = Date.now() + 2500;
              // maintainVisibleContentPosition can shift the list when the
              // header card appears without a content-size event we can rely
              // on, so also re-pin on a few short timers while settling.
              [150, 500, 1000, 1800].forEach((ms) =>
                setTimeout(() => {
                  if (Date.now() < loadSettleUntilRef.current) {
                    listRef.current?.scrollToEnd({ animated: false });
                  }
                }, ms)
              );
              listRef.current?.scrollToEnd({ animated: false });
              return;
            }
            listRef.current?.scrollToEnd({ animated: true });
          }}
          ListHeaderComponent={
            !hasMoreOlder && messages.length > 0 && otherUser ? (
              // The very start of the conversation: who this is and what you
              // have in common — a little "how you two connect" card.
              <View style={styles.introCard}>
                <View style={styles.introAvatars}>
                  <View style={[styles.introAvatar, { transform: [{ rotate: '-6deg' }] }]}>
                    <Avatar uri={myAvatarUrl} size={44} />
                  </View>
                  <View style={styles.introWave}>
                    <NSIcon name="wave" size={30} />
                  </View>
                  <View style={[styles.introAvatar, { transform: [{ rotate: '6deg' }] }]}>
                    <Avatar uri={otherUser.avatar_url ?? null} size={44} />
                  </View>
                </View>
                <Text style={styles.introTitle}>
                  The start of your chat with {otherUser.full_name?.trim().split(/\s+/)[0] ?? 'them'}
                </Text>
                {otherSubtitle ? <Text style={styles.introSub}>{otherSubtitle}</Text> : null}
                {originPost ? (
                  <TouchableOpacity
                    style={styles.originCard}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('PostDetail', { post: originPost })}
                    accessibilityRole="button"
                    accessibilityLabel={`You met through a help request: ${originPost.content}`}
                  >
                    <Text style={styles.originEmoji}>🤝</Text>
                    <View style={styles.originText}>
                      <Text style={styles.originLabel}>You met through a help request</Text>
                      <Text style={styles.originContent} numberOfLines={2}>
                        "{originPost.content}"
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.secondaryDark} />
                  </TouchableOpacity>
                ) : null}
                {sharedInterests.length > 0 && (
                  <View style={styles.helloChips}>
                    <Text style={styles.introSub}>You both like</Text>
                    {sharedInterests.slice(0, 3).map((i) => (
                      <View key={i} style={styles.helloChip}>
                        <InterestIcon interest={i} size={16} />
                        <Text style={styles.helloChipText}>{i}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : hasMoreOlder && messages.length > 0 ? (
              <TouchableOpacity style={styles.loadOlderButton} onPress={handleLoadOlder} disabled={loadingOlder}>
                {loadingOlder ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.loadOlderText}>Load earlier messages</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.hello}>
              <View style={styles.helloCircle}>
                <View style={styles.helloSticker}>
                  <NSIcon name="wave" size={54} />
                </View>
              </View>
              <Text style={styles.helloTitle}>
                Say hello{otherUser?.full_name ? ` to ${otherUser.full_name.trim().split(/\s+/)[0]}` : ''}!
              </Text>
              {sharedInterests.length > 0 ? (
                <>
                  <Text style={styles.helloSubtitle}>You both like</Text>
                  <View style={styles.helloChips}>
                    {sharedInterests.slice(0, 3).map((i) => (
                      <View key={i} style={styles.helloChip}>
                        <InterestIcon interest={i} size={16} />
                        <Text style={styles.helloChipText}>{i}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.helloSubtitle}>Every friendship starts with a wave.</Text>
              )}
              {otherUser && !text.trim() && (
                <TouchableOpacity
                  style={styles.helloStarter}
                  onPress={() => setText('Hey! 👋')}
                  accessibilityRole="button"
                  accessibilityLabel="Start with Hey"
                >
                  <Text style={styles.helloStarterText}>👋 Hey!</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <MessageRow
              message={item}
              prev={messages[index - 1]}
              next={messages[index + 1]}
              myUserId={userId}
              otherName={otherFirstName}
              otherAvatarUrl={otherUser?.avatar_url ?? null}
              repliedTo={item.reply_to_message_id ? messagesById.get(item.reply_to_message_id) : undefined}
              localPhotoUri={localPhotos[item.id]}
              localAudioUri={localAudio[item.id]}
              pending={pendingIds.has(item.id)}
              showSeen={item.sender_id === userId && item.id === lastMineMessageId && !!item.read_at && !item.deleted_at}
              canReply={!!otherUser}
              onLongPress={onRowLongPress}
              onReply={onRowReply}
              onJumpTo={onRowJumpTo}
              onOpenPhoto={onRowOpenPhoto}
            />
          )}
          ListFooterComponent={otherTyping ? <TypingRow avatarUrl={otherUser?.avatar_url ?? null} /> : null}
        />
      )}

      {showJumpButton && !loading && !loadFailed ? (
        <TouchableOpacity
          style={[styles.jumpButton, unseenCount > 0 && styles.jumpButtonNew]}
          onPress={handleJumpToBottom}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={unseenCount > 0 ? `${unseenCount} new messages. Jump to newest` : 'Jump to newest message'}
        >
          {unseenCount > 0 ? (
            <Text style={styles.jumpButtonText}>
              {unseenCount === 1 ? '1 new message' : `${unseenCount} new messages`}
            </Text>
          ) : null}
          <Ionicons name="arrow-down" size={18} color={unseenCount > 0 ? colors.onPrimary : colors.primary} />
        </TouchableOpacity>
      ) : null}
      </View>

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
                <Text style={styles.replyBannerTitle} numberOfLines={1}>
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
            {voice.recording ? (
              <>
                <TouchableOpacity style={styles.recCancel} onPress={cancelRecording} accessibilityRole="button" accessibilityLabel="Cancel recording">
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
                <View style={styles.recPill}>
                  <View style={[styles.recDot, { opacity: Math.floor(voice.durationMs / 500) % 2 ? 0.35 : 1 }]} />
                  <Text style={styles.recTime}>{formatVoiceTime(voice.durationMs)}</Text>
                  <Text style={styles.recHint} numberOfLines={1}>
                    Recording… tap send when done
                  </Text>
                </View>
                <PressableScale pressedScale={0.85} style={styles.sendButton} onPress={sendRecording} accessibilityRole="button" accessibilityLabel="Send voice message">
                  <Ionicons name="send" size={18} color={colors.onPrimary} />
                </PressableScale>
              </>
            ) : (
            <>
            {!editingMessage ? (
              <PressableScale
                pressedScale={0.85}
                style={styles.photoButton}
                onPress={handlePhoto}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Send a photo"
              >
                <Ionicons name="image-outline" size={22} color={colors.textMid} />
              </PressableScale>
            ) : null}
            {!editingMessage && !text.trim() ? (
              <PressableScale
                pressedScale={0.85}
                style={styles.photoButton}
                onPress={startRecording}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Record a voice message"
              >
                <Ionicons name="mic-outline" size={22} color={colors.textMid} />
              </PressableScale>
            ) : null}
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={editingMessage ? 'Edit message...' : 'Say something nice...'}
              placeholderTextColor={colors.textLight}
              value={text}
              onChangeText={handleChangeText}
              multiline
              maxLength={2000}
            />
            {/* Nothing typed: the button becomes a one-tap 👋 wave instead
                of a disabled send arrow. */}
            {!text.trim() && !editingMessage ? (
              <PressableScale
                key="wave"
                pressedScale={0.85}
                style={[styles.sendButton, styles.waveButton, sending && styles.buttonDisabled]}
                onPress={handleWave}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Send a wave"
              >
                {sending ? <ActivityIndicator color={colors.textDark} /> : <NSIcon name="wave" size={28} />}
              </PressableScale>
            ) : (
            <PressableScale
              key="send"
              pressedScale={0.85}
              style={[styles.sendButton, (sending || !text.trim()) && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={sending || !text.trim()}
            >
              <FadeInView>
              {sending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={18} color={colors.onPrimary} />
              )}
              </FadeInView>
            </PressableScale>
            )}
            </>
            )}
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
    paddingBottom: spacing.sm + 2,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  backButton: {
    marginRight: spacing.xs,
  },
  headerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flexShrink: 1,
  },
  headerName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  headerSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 1,
  },
  headerTyping: {
    fontFamily: fontFamily.semibold,
    color: colors.accentDark,
  },
  // Sits just above the composer, on the right.
  listArea: {
    flex: 1,
  },
  jumpButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.md,
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  jumpButtonNew: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  jumpButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.onPrimary,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // Breathing room so the newest bubble never sits under the composer.
    paddingBottom: spacing.xl,
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
    color: colors.primaryDark,
  },
  originCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.secondaryLight,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  originEmoji: {
    fontSize: 22,
  },
  originText: {
    flex: 1,
  },
  originLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.secondaryDark,
  },
  originContent: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
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
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  // No flex here: inside the column above, flex: 1 squeezed this line to
  // zero height and "Replying to …" never showed.
  replyBannerTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
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
  waveButton: {
    backgroundColor: colors.warning,
  },
  waveButtonText: {
    fontSize: 20,
  },
  recCancel: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recPill: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  recTime: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  recHint: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  photoButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  introCard: {
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  introAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  introAvatar: {
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.primaryLight,
  },
  introWave: {
    fontSize: 22,
    marginHorizontal: spacing.sm,
  },
  introTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textDark,
    textAlign: 'center',
  },
  introSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    textAlign: 'center',
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
  hello: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  helloCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  helloSticker: {
    transform: [{ rotate: '-10deg' }],
  },
  helloEmoji: {
    fontSize: 42,
    transform: [{ rotate: '-12deg' }],
  },
  helloTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    textAlign: 'center',
  },
  helloSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  helloChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  helloChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  helloChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textDark,
  },
  helloStarter: {
    marginTop: spacing.lg,
    backgroundColor: colors.warning,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  helloStarterText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
});
