import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchHelpStats, fetchPointsHistory, formatPointReason } from '../../lib/points';
import { fetchAchievementProgress } from '../../lib/achievements';
import { fetchFollowCounts } from '../../lib/follows';
import { fetchSchoolById } from '../../lib/schools';
import { deleteMyAccount } from '../../lib/account';
import { formatRelativeTime } from '../../lib/time';
import IconInput from '../../components/IconInput';
import PrimaryButton from '../../components/PrimaryButton';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, Profile, PointsHistoryEntry, AchievementProgress, School } from '../../types';

const GRADES = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'];

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user, signOut } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isNewStudent, setIsNewStudent] = useState<boolean | null>(null);
  const [points, setPoints] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  const [studentsHelped, setStudentsHelped] = useState(0);
  const [thanksReceived, setThanksReceived] = useState(0);
  const [pointHistory, setPointHistory] = useState<PointsHistoryEntry[]>([]);
  const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle<Profile>();

      if (error) {
        Alert.alert('Could not load profile', error.message);
      } else if (data) {
        setFullName(data.full_name ?? '');
        setGrade(data.grade ?? '');
        setInterests(data.interests ?? []);
        setAvatarUrl(data.avatar_url ?? null);
        setIsNewStudent(data.is_new_student);
        setPoints(data.points);
        setThanksReceived(data.thanks_received_count);
        setUsername(data.username);
        setSchoolId(data.school_id);
      }

      // Best-effort — a hiccup here shouldn't block the rest of the profile
      // (editable fields above) from loading and being usable.
      try {
        const [helpStats, history, achievementProgress, counts] = await Promise.all([
          fetchHelpStats(user.id),
          fetchPointsHistory(user.id),
          fetchAchievementProgress(user.id),
          fetchFollowCounts(user.id),
        ]);
        setStudentsHelped(helpStats.studentsHelped);
        setPointHistory(history);
        setAchievements(achievementProgress);
        setFollowCounts(counts);
      } catch {
        // leave stats/history/achievements/followCounts at their defaults
      }

      setLoadingProfile(false);
    })();
  }, [user]);

  // Re-checked on every focus (not just once) so returning from
  // ChooseSchoolScreen immediately reflects the newly picked school — the
  // rest of the form above is loaded once and left alone so this doesn't
  // clobber an in-progress edit just from navigating away and back.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('school_id')
            .eq('id', user.id)
            .maybeSingle();
          if (error) throw error;

          const newSchoolId = data?.school_id ?? null;
          setSchoolId(newSchoolId);
          setSelectedSchool(newSchoolId ? await fetchSchoolById(newSchoolId) : null);
        } catch {
          // leave whatever was last shown
        }
      })();
    }, [user])
  );

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.length || !user) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const file = new File(asset.uri);
      const bytes = await file.bytes();
      const path = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // The upload path is fixed per user (upsert overwrite), so the public URL
      // is identical every time — bust it here, before it's saved, so every
      // screen that renders this avatar from the DB (not just this preview)
      // picks up the new photo instead of a stale cached one.
      setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      Alert.alert('Upload failed', message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (!trimmed || interests.includes(trimmed)) {
      setInterestInput('');
      return;
    }
    setInterests([...interests, trimmed]);
    setInterestInput('');
  };

  const handleRemoveInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      grade,
      interests,
      avatar_url: avatarUrl,
      is_new_student: isNewStudent,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
    } else {
      Alert.alert('Saved', 'Your profile has been updated.');
    }
  };

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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <FadeInView style={styles.headerArea}>
        <Text style={styles.title}>My Profile</Text>

        <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickAvatar} disabled={uploadingAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={48} color={colors.primary} />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
          {uploadingAvatar && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        {username ? <Text style={styles.username}>@{username}</Text> : null}

        {user && (
          <View style={styles.followRow}>
            <TouchableOpacity onPress={() => navigation.navigate('FollowList', { userId: user.id, mode: 'followers' })}>
              <Text style={styles.followText}>
                <Text style={styles.followCount}>{followCounts.followers}</Text> Followers
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('FollowList', { userId: user.id, mode: 'following' })}>
              <Text style={styles.followText}>
                <Text style={styles.followCount}>{followCounts.following}</Text> Following
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.savedPostsButton} onPress={() => navigation.navigate('SavedPosts')}>
          <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
          <Text style={styles.savedPostsText}>Saved Posts</Text>
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

      <FadeInView style={styles.form} delay={100}>
        <Text style={styles.label}>Full Name</Text>
        <IconInput icon="person-outline" placeholder="Alex Johnson" value={fullName} onChangeText={setFullName} autoComplete="name" />

        <Text style={styles.label}>School</Text>
        <View style={styles.schoolCard}>
          <View style={styles.schoolCardRow}>
            <Text style={styles.schoolCardIcon}>🏫</Text>
            <View style={styles.schoolCardText}>
              {selectedSchool ? (
                <>
                  <Text style={styles.schoolCardName}>{selectedSchool.name}</Text>
                  {selectedSchool.city ? (
                    <Text style={styles.schoolCardMeta}>
                      {selectedSchool.city}
                      {selectedSchool.state ? `, ${selectedSchool.state}` : ''}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.schoolCardPlaceholder}>Choose your school</Text>
              )}
            </View>
          </View>
          <PrimaryButton
            title={schoolId ? 'Change School' : 'Choose School'}
            icon="school-outline"
            variant="outline"
            onPress={() => navigation.navigate('ChooseSchool')}
            style={styles.schoolCardButton}
          />
          <Text style={styles.schoolCardNote}>
            Selecting a school links you to its community — it doesn't verify that you attend it.
          </Text>
        </View>

        <Text style={styles.label}>Are you new to this school?</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, isNewStudent === true && styles.chipSelected]}
            onPress={() => setIsNewStudent(true)}
          >
            <Text style={[styles.chipText, isNewStudent === true && styles.chipTextSelected]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, isNewStudent === false && styles.chipSelected]}
            onPress={() => setIsNewStudent(false)}
          >
            <Text style={[styles.chipText, isNewStudent === false && styles.chipTextSelected]}>Not right now</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Grade</Text>
        <View style={styles.chipRow}>
          {GRADES.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.chip, grade === g && styles.chipSelected]}
              onPress={() => setGrade(g)}
            >
              <Text style={[styles.chipText, grade === g && styles.chipTextSelected]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Interests</Text>
        <View style={styles.interestInputRow}>
          <IconInput
            icon="sparkles-outline"
            style={styles.interestInput}
            placeholder="e.g. Basketball"
            value={interestInput}
            onChangeText={setInterestInput}
            onSubmitEditing={handleAddInterest}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddInterest}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.chipRow}>
          {interests.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[styles.chip, styles.chipSelected]}
              onPress={() => handleRemoveInterest(interest)}
            >
              <Text style={styles.chipTextSelected}>{interest} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>

        <PrimaryButton title="Save Profile" icon="checkmark-outline" onPress={handleSave} loading={saving} style={styles.saveButton} />

        <Text style={styles.email}>{user?.email}</Text>
        <PrimaryButton
          title="Log Out"
          icon="log-out-outline"
          variant="destructive"
          onPress={handleLogout}
          loading={loggingOut}
          style={styles.logoutButton}
        />
        <TouchableOpacity onPress={handleLogoutAllDevices} style={styles.logoutEverywhereButton}>
          <Text style={styles.logoutEverywhereText}>Log out of all devices</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          style={styles.deleteAccountButton}
          disabled={deletingAccount}
        >
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
  },
  headerArea: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  form: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  avatarWrapper: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  followRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
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
  savedPostsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  savedPostsText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  communityCard: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
    marginBottom: spacing.lg,
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
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  schoolCard: {
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  schoolCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  schoolCardIcon: {
    fontSize: 22,
  },
  schoolCardText: {
    flex: 1,
  },
  schoolCardName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  schoolCardMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
  },
  schoolCardPlaceholder: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  schoolCardButton: {
    marginBottom: spacing.sm,
  },
  schoolCardNote: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fontFamily.semibold,
    color: colors.textMid,
    fontSize: fontSize.sm,
  },
  chipTextSelected: {
    fontFamily: fontFamily.semibold,
    color: '#fff',
    fontSize: fontSize.sm,
  },
  interestInputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  interestInput: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    marginTop: spacing.xl,
  },
  logoutButton: {
    marginTop: spacing.sm,
  },
  logoutEverywhereButton: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  logoutEverywhereText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    textDecorationLine: 'underline',
  },
  deleteAccountButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  deleteAccountText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.error,
    textDecorationLine: 'underline',
  },
  email: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
