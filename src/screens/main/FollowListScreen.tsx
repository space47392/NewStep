import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchFollowers, fetchFollowing } from '../../lib/follows';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, PersonSearchResult } from '../../types';

const PAGE_SIZE = 30;

// One screen for both directions — followers and following are the exact
// same card shape and interaction, just a different underlying query. No
// reason to duplicate a screen for what's really one list pattern.
export default function FollowListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'FollowList'>>();
  const { userId, mode } = route.params;
  const { user } = useAuth();

  const [people, setPeople] = useState<PersonSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = mode === 'followers' ? fetchFollowers : fetchFollowing;

  const loadFirstPage = useCallback(async () => {
    try {
      const [data, blockedIds] = await Promise.all([
        fetchPage(userId, PAGE_SIZE, 0),
        user ? fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
      ]);
      // UX filtering only, not a security boundary — see blocks.ts.
      const visible = data.filter((p) => !blockedIds.has(p.id));
      setPeople(visible);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // leave whatever was already loaded
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode, user]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchPage(userId, PAGE_SIZE, people.length);
      setPeople((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
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
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.title}>{mode === 'followers' ? 'Followers' : 'Following'}</Text>}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            subtitle={
              mode === 'followers'
                ? 'When someone follows this account, they will show up here.'
                : 'Find classmates to follow from Search.'
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('UserProfile', { userId: item.id })}>
            <Avatar uri={item.avatar_url} size={48} />
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.full_name ?? 'Unknown'}</Text>
              {item.username ? <Text style={styles.meta}>@{item.username}</Text> : null}
              {item.school_name ? (
                <Text style={styles.meta}>
                  {item.school_name}
                  {item.grade ? ` · Grade ${item.grade}` : ''}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          hasMore && people.length > 0 ? (
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
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
