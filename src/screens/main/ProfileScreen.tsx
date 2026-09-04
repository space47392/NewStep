import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchHelpStats, fetchPointsHistory, formatPointReason } from '../../lib/points';
import { fetchAchievementProgress } from '../../lib/achievements';
import { fetchFollowCounts } from '../../lib/follows';
import { fetchSchoolById } from '../../lib/schools';
import { fetchPostsByAuthor } from '../../lib/posts';
import { deleteMyAccount } from '../../lib/account';
import { formatRelativeTime } from '../../lib/time';
import PostPreviewCard from '../../components/PostPreviewCard';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, Profile, PointsHistoryEntry, AchievementProgress, School, Post } from '../../types';

// A read-only view of your own profile — the same shape UserProfileScreen
// already uses for everyone else, so "you" don't look like a different
// product from "another student". Editing lives entirely in
// EditProfileScreen now; this screen only ever reads.
export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user, signOut } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [fullName, setFullName] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [thanksReceived, setThanksReceived] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [studentsHelped, setStudentsHelped] = useState(0);
  const [pointHistory, setPointHistory] = useState<PointsHistoryEntry[]>([]);
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  // Refetches every time this tab regains focus — not just once — so
  // returning from EditProfileScreen (or posting something new) shows up
  // immediately without needing a manual refresh.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle<Profile>();

          if (error) throw error;
          if (data) {
            setFullName(data.full_name);
            setGrade(data.grade);
            setInterests(data.interests ?? []);
            setAvatarUrl(data.avatar_url);
            setPoints(data.points);
            setThanksReceived(data.thanks_received_count);
            setUsername(data.username);
            setSelectedSchool(data.school_id ? await fetchSchoolById(data.school_id).catch(() => null) : null);
          }

          // Best-effort — a hiccup here shouldn't block the identity fields
          // above from showing.
          try {
            const [helpStats, history, achievementProgress, counts, postList] = await Promise.all([
              fetchHelpStats(user.id),
              fetchPointsHistory(user.id),
              fetchAchievementProgress(user.id),
              fetchFollowCounts(user.id),
              fetchPostsByAuthor(user.id),
            ]);
            setStudentsHelped(helpStats.studentsHelped);
            setPointHistory(history);
            setAchievements(achievementProgress);
            setFollowCounts(counts);
            setPosts(postList);
          } catch {
            // leave stats/history/achievements/followCounts/posts at their defaults
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not load profile.';
          Alert.alert('Could not load profile', message);
        } finally {
          setLoadingProfile(false);
        }
      })();
    }, [user])
  );

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await signOut();
        },
      },
    ]);
  };

  // scope: 'global' revokes every refresh token for this account, not just
  // this device's — useful if you think another device is still signed in
  // somewhere you don't want it to be.
  const handleLogoutAllDevices = () => {
    Alert.alert(
      'Log out of all devices?',
      "This will sign you out everywhere, including this device. You'll need to sign in again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out Everywhere',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await supabase.auth.signOut({ scope: 'global' });
          },
        },
      ]
    );
  };

  // Two-step confirmation on purpose — this is the one irreversible action on
  // this whole screen, so it gets more friction than a normal destructive
  // Alert, not less.
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, posts, comments, stories, and messages. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your account and all of its data will be permanently deleted right now. There is no way to undo this.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await deleteMyAccount();
                      // The account (and its session server-side) is already
                      // gone at this point — this just clears the local
                      // cached session so AppNavigator's gate redirects to
                      // the Auth stack, same as a normal sign-out.
                      await supabase.auth.signOut().catch(() => {});
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'Could not delete your account.';
                      Alert.alert('Error', message);
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  if (loadingProfile) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FadeInView style={styles.headerArea}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={48} color={colors.primary} />
          </View>
        )}

        <Text style={styles.name}>{fullName ?? 'Unknown'}</Text>
        {username ? <Text style={styles.username}>@{username}</Text> : null}

        <View style={styles.statsRow}>
          <Text style={styles.statText}>
            <Text style={styles.statNumber}>{posts.length}</Text> Posts
          </Text>
          {user && (
            <>
              <TouchableOpacity onPress={() => navigation.navigate('FollowList', { userId: user.id, mode: 'followers' })}>
                <Text style={styles.statText}>
                  <Text style={styles.statNumber}>{followCounts.followers}</Text> Followers
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('FollowList', { userId: user.id, mode: 'following' })}>
                <Text style={styles.statText}>
                  <Text style={styles.statNumber}>{followCounts.following}</Text> Following
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {selectedSchool ? (
          <TouchableOpacity
            style={styles.metaRow}
            onPress={() => navigation.navigate('School', { schoolId: selectedSchool.id, schoolName: selectedSchool.name })}
          >
            <Ionicons name="school-outline" size={14} color={colors.textMid} />
            <Text style={styles.metaText}>
              {selectedSchool.name}
              {selectedSchool.city ? ` · ${selectedSchool.city}${selectedSchool.state ? `, ${selectedSchool.state}` : ''}` : ''}
              {grade ? ` · Grade ${grade}` : ''}
            </Text>
          </TouchableOpacity>
        ) : grade ? (
          <Text style={styles.metaTextPlain}>Grade {grade}</Text>
        ) : null}

        {interests.length > 0 && (
          <View style={styles.chipRow}>
            {interests.map((interest) => (
              <View key={interest} style={styles.chip}>
                <Text style={styles.chipText}>{interest}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        <View style={styles.communityCard}>
          <Text style={styles.communityTitle}>Community</Text>
          <View style={styles.communityStatsRow}>
            <View style={styles.communityStat}>
              <Ionicons name="star" size={20} color={colors.primary} />
              <Text style={styles.communityStatNumber}>{points}</Text>
              <Text style={styles.communityStatLabel}>{points === 1 ? 'Point' : 'Points'}</Text>
            </View>
            <View style={styles.communityStatDivider} />
            <View style={styles.communityStat}>
              <Ionicons name="people" size={20} color={colors.success} />
              <Text style={styles.communityStatNumber}>{studentsHelped}</Text>
              <Text style={styles.communityStatLabel}>
                Helped {studentsHelped === 1 ? 'Student' : 'Students'}
              </Text>
            </View>
            <View style={styles.communityStatDivider} />
            <View style={styles.communityStat}>
              <Ionicons name="heart" size={20} color={colors.secondary} />
              <Text style={styles.communityStatNumber}>{thanksReceived}</Text>
              <Text style={styles.communityStatLabel}>Thanks Received</Text>
            </View>
          </View>

          {achievements.length > 0 && (
            <>
              <View style={styles.achievementsDivider} />
              <Text style={styles.achievementsTitle}>🏆 Achievements</Text>
              <View style={styles.achievementsGrid}>
                {achievements.map((achievement) => (
                  <View
                    key={achievement.id}
                    style={[styles.achievementBadge, !achievement.earned && styles.achievementBadgeLocked]}
                  >
                    <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                    <Text
                      style={[styles.achievementName, !achievement.earned && styles.achievementNameLocked]}
                      numberOfLines={2}
                    >
                      {achievement.name}
                    </Text>
                    {!achievement.earned && (
                      <Ionicons
                        name="lock-closed"
                        size={10}
                        color={colors.textLight}
                        style={styles.achievementLockIcon}
                      />
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {pointHistory.length > 0 && (
          <View style={styles.activityCard}>
            <Text style={styles.activityTitle}>Community Activity</Text>
            {pointHistory.map((entry) => (
              <View key={entry.id} style={styles.activityRow}>
                <View style={styles.activityAmountBadge}>
                  {/* Thanks are a 0-point entry (see thanks_received_schema.sql) —
                      "+0" would read as a mistake, so it gets its own icon instead. */}
                  <Text style={styles.activityAmountText}>
                    {entry.reason === 'help_thanked' ? '💙' : `+${entry.amount}`}
                  </Text>
                </View>
                <Text style={styles.activityReason}>{formatPointReason(entry.reason)}</Text>
                <Text style={styles.activityTime}>{formatRelativeTime(entry.created_at)}</Text>
              </View>
            ))}
          </View>
        )}
      </FadeInView>

      <View style={styles.postsSection}>
        <Text style={styles.postsHeading}>Posts</Text>
        {posts.length === 0 ? (
          <EmptyState icon="newspaper-outline" title="No posts yet" subtitle="Share something with your school community!" />
        ) : (
          posts.map((post) => (
            <PostPreviewCard key={post.id} post={post} onPress={() => navigation.navigate('PostDetail', { post })} />
          ))
        )}
      </View>

      <FadeInView style={styles.accountSection} delay={100}>
        <Text style={styles.email}>{user?.email}</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} disabled={loggingOut}>
          {loggingOut ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={16} color={colors.error} />
              <Text style={styles.logoutText}>Log Out</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogoutAllDevices} style={styles.logoutEverywhereButton}>
          <Text style={styles.logoutEverywhereText}>Log out of all devices</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteAccountButton} disabled={deletingAccount}>
          {deletingAccount ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          )}
        </TouchableOpacity>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.xl,
  },
  headerArea: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    marginTop: spacing.md,
  },
  username: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  statText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  statNumber: {
    fontFamily: fontFamily.bold,
    color: colors.textDark,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  metaTextPlain: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  editButtonText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  communityCard: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    ...shadow.card,
  },
  communityTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  communityStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  communityStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  communityStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  communityStatNumber: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    color: colors.textDark,
    marginTop: 2,
  },
  communityStatLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    textAlign: 'center',
  },
  achievementsDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  achievementsTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  achievementBadge: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  achievementBadgeLocked: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  achievementIcon: {
    fontSize: 20,
  },
  achievementName: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textDark,
  },
  achievementNameLocked: {
    color: colors.textLight,
  },
  achievementLockIcon: {
    marginLeft: -2,
  },
  activityCard: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadow.card,
  },
  activityTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activityAmountBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  activityAmountText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  activityReason: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  activityTime: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  postsSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  postsHeading: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  accountSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  email: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.lg,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoutText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.error,
  },
  logoutEverywhereButton: {
    marginTop: spacing.md,
  },
  logoutEverywhereText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textDecorationLine: 'underline',
  },
  deleteAccountButton: {
    marginTop: spacing.lg,
  },
  deleteAccountText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.error,
    textDecorationLine: 'underline',
  },
});
