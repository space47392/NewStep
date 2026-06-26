import { useEffect, useRef, useState } from 'react';
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
import { fetchMessages, sendMessage, subscribeToMessages, markMessagesAsRead } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import { colors, spacing, radius, fontSize } from '../../constants/theme';
import { MainStackParamList, Message } from '../../types';

export default function ConversationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Conversation'>>();
  const { conversationId, otherUser } = route.params;
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const data = await fetchMessages(conversationId);
        if (isMounted) setMessages(data);
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

    const unsubscribe = subscribeToMessages(conversationId, (message) => {
      setMessages((prev) => [...prev, message]);
      // If the other person's message arrives while this screen is open, mark it read immediately.
      if (user && message.sender_id !== user.id) {
        markMessagesAsRead(conversationId, user.id).catch(() => {});
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [conversationId, user]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;

    setSending(true);
    try {
      await sendMessage({ conversationId, senderId: user.id, content: trimmed });
      setText(''); // the sent message arrives back via the real-time subscription above
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send message.';
      Alert.alert('Error', message);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        {otherUser.avatar_url ? (
          <Image source={{ uri: otherUser.avatar_url }} style={styles.headerAvatar} />
        ) : (
          <View style={[styles.headerAvatar, styles.avatarPlaceholder]} />
        )}
        <Text style={styles.headerName}>{otherUser.full_name ?? 'Unknown'}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.emptyText}>Say hello!</Text>}
          renderItem={({ item }) => {
            const isMine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
                </View>
                <Text style={styles.messageTimestamp}>{formatRelativeTime(item.created_at)}</Text>
              </View>
            );
          }}
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.textLight}
          value={text}
          onChangeText={setText}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    marginLeft: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
  },
  headerName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textDark,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMid,
    fontSize: fontSize.md,
    marginTop: spacing.lg,
  },
  bubbleRow: {
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleTheirs: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleTextMine: {
    color: '#fff',
    fontSize: fontSize.md,
  },
  bubbleTextTheirs: {
    color: colors.textDark,
    fontSize: fontSize.md,
  },
  messageTimestamp: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
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
