import { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileById } from '../../lib/profile';
import { fetchSchoolContributors, fetchSchoolContributorsById } from '../../lib/schools';
import { fetchHelpStats } from '../../lib/points';
import { fetchBlockedUserIds } from '../../lib/blocks';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { MainStackParamList, SchoolContributor } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';

const CONTRIBUTOR_LIMIT = 20;

// A contributor plus their "students helped" count — computed per-contributor
// via fetchHelpStats() (Promise.all, bounded by CONTRIBUTOR_LIMIT) since
// there's no bulk version of that query; acceptable at this small, capped size.
type ContributorRow = SchoolContributor & { studentsHelped: number };

// Step 30: replaces the old points leaderboard (medals, rank numbers,
// points-sorted competitive framing) with the same non-competitive
// recognition pattern SchoolScreen's "Community Contributors" section
// already uses — same query, same "no ranks/scores/positions" rule, just as
// this tab's full destination instead of a small teaser row. No new backend:
// fetchSchoolContributors[ById]() and fetchHelpStats() already existed.
export default function VolunteerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadContributors = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await fetchProfileById(user.id);
      setSchoolName(profile.school_name);

      if (!profile.school_id && !profile.school_name) {
        setContributors([]);
        return;
      }

      const [rawContributors, blockedIds] = await Promise.all([
        profile.school_id
          ? fetchSchoolContributorsById(profile.school_id, CONTRIBUTOR_LIMIT)
          : fetchSchoolContributors(profile.school_name!, CONTRIBUTOR_LIMIT),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
      ]);

      // UX filtering only, not a security boundary — see blocks.ts.
      const visible = rawContributors.filter((c) => !blockedIds.has(c.id));
      const withHelpStats = await Promise.all(
        visible.map(async (c) => ({
          ...c,
          studentsHelped: (await fetchHelpStats(c.id).catch(() => ({ studentsHelped: 0 }))).studentsHelped,
        }))
      );
      setContributors(withHelpStats);
    } catch {
      setContributors([]);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadContributors();
        setLoading(false);
      })();
    }, [loadContributors])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContributors();
    setRefreshing(false);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <FlatList
      data={contributors}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>🌟 Community Contributors</Text>
          <Text style={styles.subtitle}>
            {schoolName
              ? `Students who've genuinely helped others at ${schoolName}`
              : "Students who've genuinely helped others in their school community"}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="star-outline"
          title={schoolName ? 'No community contributions yet' : 'Add your school to see contributors'}
          subtitle={
            schoolName
              ? 'Be the first to help someone at your school and get recognized here.'
              : 'Set your school from your profile to see students who have helped others there.'
          }
        />
      }
      renderItem={({ item, index }) => (
        <FadeInView delay={Math.min(index, 6) * 40}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
          >
            <Avatar uri={item.avatar_url} size={44} />
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.full_name ?? 'Unknown'}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.statText}>💙 {item.thanks_received_count} Thanks Received</Text>
                {item.studentsHelped > 0 && <Text style={styles.statText}>🤝 {item.studentsHelped} Helped</Text>}
              </View>
            </View>
          </TouchableOpacity>
        </FadeInView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
  },
  header: {
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
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 2,
  },
  statText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
});
