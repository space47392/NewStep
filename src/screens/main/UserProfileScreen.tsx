import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById } from '../../lib/profile';
import { fetchPostsByAuthor } from '../../lib/posts';
import { fetchHelpStats } from '../../lib/points';
import { fetchAchievementProgress } from '../../lib/achievements';
import { getOrCreateConversation } from '../../lib/chat';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, Profile, Post, AchievementProgress } from '../../types';

export default function UserProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'UserProfile'>>();
  const { userId } = route.params;
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [studentsHelped, setStudentsHelped] = useState(0);
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  const isOwnProfile = user?.id === userId;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [profileData, postsData, helpStats, achievementProgress] = await Promise.all([
            fetchProfileById(userId),
            fetchPostsByAuthor(userId),
            fetchHelpStats(userId),
            fetchAchievementProgress(userId),
          ]);
          setProfile(profileData);
          setPosts(postsData);
          setStudentsHelped(helpStats.studentsHelped);
          setAchievements(achievementProgress);
        } catch {
          setProfile(null);
        } finally {
          setLoading(false);
        }
      })();
    }, [userId])
  );

  const earnedAchievements = achievements.filter((a) => a.earned);

  const handleMessage = async () => {
    if (!profile) return;
    setMessaging(true);
    try {
      const conversationId = await getOrCreateConversation(userId);
      navigation.navigate('Conversation', {
        conversationId,
        otherUser: { id: userId, full_name: profile.full_name, avatar_url: profile.avatar_url },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the conversation.';
      Alert.alert('Error', message);
    } finally {
      setMessaging(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <EmptyState icon="person-outline" title="Profile not found" subtitle="This account may have been removed." />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={posts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <FadeInView>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.headerRow}>
            <Avatar uri={profile.avatar_url} size={84} />
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statNumber}>{posts.length}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
              <View style={styles.statBlock}>
                <Ionicons name="trophy" size={16} color={colors.primary} style={styles.statIcon} />
                <Text style={styles.statNumber}>{profile.points}</Text>
                <Text style={styles.statLabel}>Points</Text>
              </View>
              <View style={styles.statBlock}>
                <Ionicons name="people" size={16} color={colors.success} style={styles.statIcon} />
                <Text style={styles.statNumber}>{studentsHelped}</Text>
                <Text style={styles.statLabel}>Helped</Text>
              </View>
            </View>
          </View>

          <Text style={styles.name}>{profile.full_name ?? 'Unknown'}</Text>
          {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}

          {profile.school_name ? (
            <View style={styles.metaRow}>
              <Ionicons name="school-outline" size={14} color={colors.textMid} />
              <Text style={styles.metaText}>
                {profile.school_name}
                {profile.grade ? ` · Grade ${profile.grade}` : ''}
              </Text>
            </View>
          ) : null}

          {profile.interests.length > 0 && (
            <View style={styles.chipRow}>
              {profile.interests.map((interest) => (
                <View key={interest} style={styles.chip}>
                  <Text style={styles.chipText}>{interest}</Text>
                </View>
              ))}
            </View>
          )}

          {earnedAchievements.length > 0 && (
            <View style={styles.achievementsSection}>
              <Text style={styles.achievementsHeading}>🏆 Achievements</Text>
              <View style={styles.achievementsRow}>
                {earnedAchievements.map((achievement) => (
                  <View key={achievement.id} style={styles.achievementBadge}>
                    <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                    <Text style={styles.achievementName}>{achievement.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!isOwnProfile && (
            <PrimaryButton
              title="Message"
              icon="chatbubble-outline"
              onPress={handleMessage}
              loading={messaging}
              style={styles.messageButton}
            />
          )}

          <Text style={styles.postsHeading}>Posts</Text>
        </FadeInView>
      }
      ListEmptyComponent={<EmptyState icon="newspaper-outline" title="No posts yet" />}
      renderItem={({ item, index }) => {
        const category = CATEGORY_STYLES[item.category];
        return (
          <FadeInView delay={Math.min(index, 6) * 40}>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PostDetail', { post: item })}
            >
              <View style={styles.cardTop}>
                <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
                  <Ionicons name={category.icon} size={12} color={category.text} />
                  <Text style={[styles.categoryText, { color: category.text }]}>{item.category}</Text>
                </View>
                <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
              </View>
              <Text style={styles.content}>{item.content}</Text>
            </TouchableOpacity>
          </FadeInView>
        );
      }}
    />
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.lg,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginLeft: spacing.lg,
  },
  statBlock: {
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 2,
  },
  statNumber: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
  },
  username: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  achievementsSection: {
    marginTop: spacing.md,
  },
  achievementsHeading: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  achievementsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  achievementIcon: {
    fontSize: 16,
  },
  achievementName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textDark,
  },
  messageButton: {
    marginTop: spacing.lg,
  },
  postsHeading: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  categoryText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
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
});
