import { useCallback, useState } from 'react';
import { View, Text, Image, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { fetchConversations } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import { Conversation, MainStackParamList } from '../../types';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

export default function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchConversations(user.id);
      setConversations(data);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load chats.');
    }
  }, [user]);

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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={<Text style={styles.title}>Messages</Text>}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {errorMessage ?? 'No conversations yet. Volunteer to help someone, or get help, to start one!'}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('Conversation', { conversationId: item.id, otherUser: item.otherUser })}
        >
          {item.otherUser.avatar_url ? (
            <Image source={{ uri: item.otherUser.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={styles.rowText}>
            <Text style={styles.name}>{item.otherUser.full_name ?? 'Unknown'}</Text>
            <Text style={styles.lastMessage} numberOfLines={1}>
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
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMid,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textDark,
  },
  lastMessage: {
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  timestamp: {
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
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
