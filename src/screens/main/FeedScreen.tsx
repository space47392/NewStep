import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchPosts } from '../../lib/posts';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { Post, MainStackParamList } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';

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
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.title}>Community Feed 👋</Text>
            <Text style={styles.subtitle}>See what's happening at your school</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="newspaper-outline"
            title="No posts yet"
            subtitle={errorMessage ?? 'Be the first to share something with your school community!'}
          />
        }
        renderItem={({ item, index }) => {
          const category = CATEGORY_STYLES[item.category];
          return (
            <FadeInView delay={Math.min(index, 6) * 40}>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PostDetail', { post: item })}
              >
                <View style={styles.cardHeader}>
                  <Avatar uri={item.profiles?.avatar_url} size={42} />
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.name}>{item.profiles?.full_name ?? 'Unknown'}</Text>
                    {item.profiles?.school_name ? (
                      <Text style={styles.school}>{item.profiles.school_name}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
                </View>

                <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
                  <Ionicons name={category.icon} size={12} color={category.text} />
                  <Text style={[styles.categoryText, { color: category.text }]}>{item.category}</Text>
                </View>

                <Text style={styles.content}>{item.content}</Text>

                {item.category === 'Need Help' && item.status !== 'open' && item.helper ? (
                  <View style={styles.helperNotice}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={styles.helperNoticeText}>
                      {item.helper.full_name ?? 'Someone'} {item.status === 'completed' ? 'helped' : 'is helping'}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                  <Text style={styles.viewComments}>View Comments</Text>
                </View>
              </TouchableOpacity>
            </FadeInView>
          );
        }}
      />

      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => navigation.navigate('CreatePost')}>
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
  list: {
    padding: spacing.lg,
  },
  headerRow: {
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.floating,
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
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardHeaderText: {
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
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  content: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
    lineHeight: 21,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  viewComments: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  helperNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  helperNoticeText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.success,
  },
});
