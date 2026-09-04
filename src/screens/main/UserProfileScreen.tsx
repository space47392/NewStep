import { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchProfileById } from '../../lib/profile';
import { fetchPostsByAuthor } from '../../lib/posts';
import { fetchHelpStats } from '../../lib/points';
import { fetchAchievementProgress } from '../../lib/achievements';
import { getOrCreateConversation } from '../../lib/chat';
import { fetchBlockedUserIds, blockUser, unblockUser } from '../../lib/blocks';
import { fetchFollowCounts, isFollowing, followUser, unfollowUser } from '../../lib/follows';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import PrimaryButton from '../../components/PrimaryButton';
import FadeInView from '../../components/FadeInView';
import ActionSheet, { ActionSheetAction } from '../../components/ActionSheet';
import ReportSheet from '../../components/ReportSheet';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, Profile, Post, AchievementProgress, ReportTargetType } from '../../types';

export default function UserProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'UserProfile'>>();
  const { userId } = route.params;
  const { user } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [studentsHelped, setStudentsHelped] = useState(0);
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isOwnProfile = user?.id === userId;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [profileData, postsData, helpStats, achievementProgress, counts] = await Promise.all([
            fetchProfileById(userId),
            fetchPostsByAuthor(userId),
            fetchHelpStats(userId),
            fetchAchievementProgress(userId),
            fetchFollowCounts(userId),
          ]);
          setProfile(profileData);
          setPosts(postsData);
          setStudentsHelped(helpStats.studentsHelped);
          setAchievements(achievementProgress);
          setFollowCounts(counts);

          if (user && user.id !== userId) {
            // UX-only check — see blocks.ts. The real enforcement (can't
            // message, no notifications) happens server-side regardless.
            const blockedIds = await fetchBlockedUserIds(user.id).catch(() => new Set<string>());
            setIsBlocked(blockedIds.has(userId));
            setIsFollowingUser(await isFollowing(user.id, userId).catch(() => false));
          }
        } catch {
          setProfile(null);
        } finally {
          setLoading(false);
        }
      })();
    }, [userId, user])
  );

  const handleToggleBlock = () => {
    if (!user) return;
    if (isBlocked) {
      Alert.alert('Unblock this user?', 'They will be able to message you and appear in your feed again.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await unblockUser({ blockerId: user.id, blockedId: userId });
              setIsBlocked(false);
              showToast('User unblocked');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Could not unblock this user.';
              Alert.alert('Error', message);
            }
          },
        },
      ]);
    } else {
      Alert.alert(
        'Block this user?',
        "They won't be able to message you, and you won't see their posts. This won't delete anything that already exists.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              try {
                await blockUser({ blockerId: user.id, blockedId: userId });
                setIsBlocked(true);
                showToast('User blocked');
              } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not block this user.';
                Alert.alert('Error', message);
              }
            },
          },
        ]
      );
    }
  };

  // Following → tapping asks first ("confirm/unfollow" per spec). Not
  // following → tapping just follows immediately, matching how most social
  // apps only add friction to the destructive direction.
  const handleFollowPress = () => {
    if (!user) return;

    if (isFollowingUser) {
      Alert.alert(`Unfollow ${profile?.full_name ?? 'this user'}?`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            setFollowLoading(true);
            try {
              await unfollowUser({ followerId: user.id, followingId: userId });
              setIsFollowingUser(false);
              setFollowCounts((prev) => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Could not unfollow.';
              Alert.alert('Error', message);
            } finally {
              setFollowLoading(false);
            }
          },
        },
      ]);
      return;
    }

    (async () => {
      setFollowLoading(true);
      try {
        await followUser({ followerId: user.id, followingId: userId });
        setIsFollowingUser(true);
        setFollowCounts((prev) => ({ ...prev, followers: prev.followers + 1 }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (err) {
        // Also the path a "they blocked you" attempt takes — the RPC-level
        // guard's message is deliberately generic, so this doesn't reveal why.
        const message = err instanceof Error ? err.message : 'Could not follow this user.';
        Alert.alert('Error', message);
      } finally {
        setFollowLoading(false);
      }
    })();
  };

  const profileMenuActions: ActionSheetAction[] = [
    { label: 'Report Profile', icon: 'flag-outline', onPress: () => setReportTarget({ type: 'profile', id: userId }) },
    isBlocked
      ? { label: 'Unblock User', icon: 'checkmark-circle-outline', onPress: handleToggleBlock }
      : { label: 'Block User', icon: 'ban-outline', destructive: true, onPress: handleToggleBlock },
  ];

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
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <EmptyState icon="person-outline" title="Profile not found" subtitle="This account may have been removed." />
      </View>
    );
  }

  return (
    <>
    <FlatList
      style={styles.container}
      data={posts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <FadeInView>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            {!isOwnProfile && (
              <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMid} />
              </TouchableOpacity>
            )}
          </View>

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

          <View style={styles.followRow}>
            <TouchableOpacity onPress={() => navigation.navigate('FollowList', { userId, mode: 'followers' })}>
              <Text style={styles.followText}>
                <Text style={styles.followCount}>{followCounts.followers}</Text> Followers
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('FollowList', { userId, mode: 'following' })}>
              <Text style={styles.followText}>
                <Text style={styles.followCount}>{followCounts.following}</Text> Following
              </Text>
            </TouchableOpacity>
          </View>

          {profile.school_name ? (
            <TouchableOpacity
              style={styles.metaRow}
              onPress={() =>
                navigation.navigate('School', { schoolId: profile.school_id ?? undefined, schoolName: profile.school_name! })
              }
            >
              <Ionicons name="school-outline" size={14} color={colors.textMid} />
              <Text style={styles.metaText}>
                {profile.school_name}
                {profile.grade ? ` · Grade ${profile.grade}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
            </TouchableOpacity>
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

          {!isOwnProfile && !isBlocked && (
            <View style={styles.profileActions}>
              <PrimaryButton
                title={isFollowingUser ? 'Following' : 'Follow'}
                icon={isFollowingUser ? 'checkmark' : 'person-add-outline'}
                variant={isFollowingUser ? 'outline' : undefined}
                onPress={handleFollowPress}
                loading={followLoading}
                style={styles.messageButton}
              />
              <PrimaryButton
                title="Message"
                icon="chatbubble-outline"
                variant="outline"
                onPress={handleMessage}
                loading={messaging}
                style={styles.messageButton}
              />
            </View>
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
    <ActionSheet visible={menuVisible} onClose={() => setMenuVisible(false)} actions={profileMenuActions} />
    <ReportSheet target={reportTarget} reporterId={user?.id} onClose={() => setReportTarget(null)} />
    </>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  menuButton: {
    padding: spacing.xs,
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
  followRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  followText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  followCount: {
    fontFamily: fontFamily.bold,
    color: colors.textDark,
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
  profileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  messageButton: {
    flex: 1,
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
