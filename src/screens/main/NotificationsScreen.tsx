import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchNotifications,
  markNotificationRead,
  formatNotificationMessage,
  getNotificationIcon,
} from '../../lib/notifications';
import { fetchPostById } from '../../lib/posts';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { AppNotification, MainStackParamList } from '../../types';

const PAGE_SIZE = 20;

// Post-related types all resolve to the same destination — fetching the full
// Post is unavoidable since PostDetailScreen's route needs the whole object,
// not just an id, matching how every other screen already navigates there.
const POST_TYPES = new Set(['like', 'comment', 'volunteer', 'help_completed', 'thanks_received']);

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchNotifications(user.id, PAGE_SIZE, 0);
      setNotifications(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // leave whatever was already loaded
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Refetches on every focus (e.g. returning from a notification's
  // destination) — but does NOT mark anything read just from opening the
  // screen; only tapping an individual notification does that.
  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const handleLoadMore = async () => {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchNotifications(user.id, PAGE_SIZE, notifications.length);
      setNotifications((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePress = async (notification: AppNotification) => {
    if (!notification.read_at) {
      markNotificationRead(notification.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    }

    setOpeningId(notification.id);
    try {
      if (POST_TYPES.has(notification.type)) {
        if (!notification.post_id) return;
        const post = await fetchPostById(notification.post_id);
        navigation.navigate('PostDetail', { post });
      } else if (notification.type === 'message') {
        if (!notification.conversation_id || !notification.actor) return;
        navigation.navigate('Conversation', {
          conversationId: notification.conversation_id,
          otherUser: notification.actor,
        });
      } else if (notification.type === 'follow' || notification.type === 'story_wave') {
        if (!notification.actor) return;
        navigation.navigate('UserProfile', { userId: notification.actor.id });
      } else {
        // points_earned / achievement_earned
        navigation.navigate('Tabs', { screen: 'Profile' });
      }
    } catch {
      // e.g. the post was deleted since — just stay on this screen
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.title}>Notifications</Text>}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="No notifications yet"
            subtitle="Likes, comments, and messages from other students will show up here."
          />
        }
        renderItem={({ item, index }) => {
          const unread = !item.read_at;
          return (
            <FadeInView delay={Math.min(index, 6) * 30}>
              <TouchableOpacity
                style={[styles.row, unread && styles.rowUnread]}
                activeOpacity={0.85}
                disabled={openingId === item.id}
                onPress={() => handlePress(item)}
              >
                {unread && <View style={styles.unreadDot} />}
                {item.actor ? (
                  <Avatar uri={item.actor.avatar_url} size={44} />
                ) : (
                  <View style={styles.iconAvatar}>
                    <Text style={styles.iconAvatarText}>{getNotificationIcon(item.type)}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={[styles.message, unread && styles.messageUnread]}>
                    {getNotificationIcon(item.type)} {formatNotificationMessage(item)}
                  </Text>
                  <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
                </View>
                {openingId === item.id && <ActivityIndicator size="small" color={colors.primary} />}
              </TouchableOpacity>
            </FadeInView>
          );
        }}
        ListFooterComponent={
          hasMore && notifications.length > 0 ? (
            <TouchableOpacity style={styles.loadMore} onPress={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
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
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
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
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowUnread: {
    backgroundColor: colors.primaryLight,
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  iconAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconAvatarText: {
    fontSize: 20,
  },
  rowText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  messageUnread: {
    fontFamily: fontFamily.semibold,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loadMoreText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
