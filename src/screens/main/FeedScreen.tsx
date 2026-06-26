import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchPosts } from '../../lib/posts';
import { Post, MainStackParamList } from '../../types';
import { colors, spacing, radius, fontSize } from '../../constants/theme';

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export default function FeedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPosts();
      setPosts(data);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load posts.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadPosts();
      setLoading(false);
    })();
  }, [loadPosts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
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
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={<Text style={styles.title}>Community Feed</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {errorMessage ?? 'No posts yet. Be the first to share something!'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {item.profiles?.avatar_url ? (
                <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.cardHeaderText}>
                <Text style={styles.name}>{item.profiles?.full_name ?? 'Unknown'}</Text>
                {item.profiles?.school_name ? (
                  <Text style={styles.school}>{item.profiles.school_name}</Text>
                ) : null}
              </View>
              <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
            </View>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
            <Text style={styles.content}>{item.content}</Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreatePost')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
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
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
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
  cardHeaderText: {
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
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  content: {
    fontSize: fontSize.md,
    color: colors.textDark,
    lineHeight: 20,
  },
});
