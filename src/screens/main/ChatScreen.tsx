import { useCallback, useRef, useState } from 'react';
import { Text, FlatList, RefreshControl, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchConversations } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import { ConversationRowSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import { Conversation, MainStackParamList } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';

export default function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after conversations have ever loaded shows
  // a toast instead and keeps the existing list (Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchConversations(user.id);
      setConversations(data);
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (hasEverLoadedRef.current) {
        showToast("Couldn't refresh your chats");
      } else {
        setLoadFailed(true);
      }
    }
  }, [user, showToast]);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadConversations();
    setRetrying(false);
  };

  // Refetch every time this tab gains focus, so unread badges/previews update
  // after returning from a conversation (not just on first mount).
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadConversations();
        setLoading(false);
      })();
    }, [loadConversations])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, styles.list]}>
        <Text style={styles.title}>Messages 💬</Text>
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={<Text style={styles.title}>Messages 💬</Text>}
      ListEmptyComponent={
        loadFailed ? (
          <ErrorState onRetry={handleRetry} retrying={retrying} />
        ) : (
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            subtitle="Volunteer to help someone, or get help, to start one!"
          />
        )
      }
      renderItem={({ item, index }) => (
        <FadeInView delay={Math.min(index, 6) * 40}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Conversation', { conversationId: item.id, otherUser: item.otherUser })}
          >
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                navigation.navigate('UserProfile', { userId: item.otherUser.id });
              }}
            >
              <Avatar uri={item.otherUser.avatar_url} size={50} />
            </TouchableOpacity>
            <View style={styles.rowText}>
              <TouchableOpacity
                style={styles.nameTouchable}
                onPress={(e) => {
                  e.stopPropagation();
                  navigation.navigate('UserProfile', { userId: item.otherUser.id });
                }}
              >
                <Text style={styles.name}>{item.otherUser.full_name ?? 'Unknown'}</Text>
              </TouchableOpacity>
              <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>
                {item.last_message ?? 'Say hello!'}
              </Text>
            </View>
            <View style={styles.rowRight}>
              {item.last_message_at ? (
                <Text style={styles.timestamp}>{formatRelativeTime(item.last_message_at)}</Text>
              ) : null}
              {item.unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </FadeInView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameTouchable: {
    alignSelf: 'flex-start',
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  lastMessage: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  lastMessageUnread: {
    fontFamily: fontFamily.semibold,
    color: colors.textDark,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  unreadBadgeText: {
    fontFamily: fontFamily.bold,
    color: '#fff',
    fontSize: fontSize.xs,
  },
});
