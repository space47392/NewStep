import { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchProfileById } from '../../lib/profile';
import { fetchSchoolContributors, fetchSchoolContributorsById, fetchSchoolById } from '../../lib/schools';
import { fetchHelpStats } from '../../lib/points';
import { fetchBlockedUserIds } from '../../lib/blocks';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import ContributorRow from '../../components/ContributorRow';
import NSIcon from '../../components/NSIcon';
import PrimaryButton from '../../components/PrimaryButton';
import { MainStackParamList, SchoolContributor } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

const CONTRIBUTOR_LIMIT = 20;

// Mirrors how someone actually lands on this list: contributors are students
// with at least one thank-you (fetchSchoolContributors), so the last step is
// exactly that — no promise this screen can't keep.
const HOW_TO_STEPS = [
  { icon: 'ask' as const, tint: colors.secondaryLight, text: 'Find a request in Help' },
  { icon: 'help' as const, tint: colors.primaryLight, text: 'Offer to help out' },
  { icon: 'thanks' as const, tint: colors.accentLight, text: 'Get a thank-you' },
];

// A contributor plus their "students helped" count — computed per-contributor
// via fetchHelpStats() (Promise.all, bounded by CONTRIBUTOR_LIMIT) since
// there's no bulk version of that query; acceptable at this small, capped size.
type ContributorData = SchoolContributor & { studentsHelped: number };

// Step 30: replaces the old points leaderboard (medals, rank numbers,
// points-sorted competitive framing) with the same non-competitive
// recognition pattern SchoolScreen's "Community Contributors" section
// already uses — same query, same "no ranks/scores/positions" rule, just as
// this tab's full destination instead of a small teaser row. No new backend:
// fetchSchoolContributors[ById]() and fetchHelpStats() already existed.
export default function VolunteerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [schoolName, setSchoolName] = useState<string | null>(null);
  // Tracked separately from schoolName's display text — a school_id is what
  // actually determines "does this user have a school", independent of
  // whether the directory name lookup below happens to succeed. Mirrors
  // HelpScreen's existing hasSchool pattern, so a transient name-lookup
  // failure can never make the empty state wrongly claim no school is set.
  const [hasSchool, setHasSchool] = useState(true);
  const [contributors, setContributors] = useState<ContributorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after contributors have ever loaded shows
  // a toast instead and keeps the existing list (Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);

  const loadContributors = useCallback(async () => {
    if (!user) return;
    try {
      const profile = await fetchProfileById(user.id);
      const schoolId = profile.school_id;

      if (!schoolId && !profile.school_name) {
        setHasSchool(false);
        setSchoolName(null);
        setContributors([]);
        setLoadFailed(false);
        hasEverLoadedRef.current = true;
        return;
      }
      setHasSchool(true);

      // Picking a school via ChooseSchoolScreen's directory only ever writes
      // school_id, never school_name (see setMySchool()) — so a directory-
      // picked profile needs its real name resolved from the schools table,
      // the same way FeedScreen's loadSchoolBanner already does (Step 34).
      const [rawContributors, blockedIds, directorySchool] = await Promise.all([
        schoolId
          ? fetchSchoolContributorsById(schoolId, CONTRIBUTOR_LIMIT)
          : fetchSchoolContributors(profile.school_name!, CONTRIBUTOR_LIMIT),
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
        schoolId ? fetchSchoolById(schoolId).catch(() => null) : Promise.resolve(null),
      ]);
      setSchoolName(schoolId ? directorySchool?.name ?? profile.school_name : profile.school_name);

      // UX filtering only, not a security boundary — see blocks.ts.
      const visible = rawContributors.filter((c) => !blockedIds.has(c.id));
      const withHelpStats = await Promise.all(
        visible.map(async (c) => ({
          ...c,
          studentsHelped: (await fetchHelpStats(c.id).catch(() => ({ studentsHelped: 0 }))).studentsHelped,
        }))
      );
      setContributors(withHelpStats);
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (hasEverLoadedRef.current) {
        showToast("Couldn't refresh contributors");
      } else {
        setLoadFailed(true);
      }
    }
  }, [user, showToast]);

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

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadContributors();
    setRetrying(false);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (loadFailed) {
    return <ErrorState onRetry={handleRetry} retrying={retrying} />;
  }

  return (
    <FlatList
      style={styles.screen}
      data={contributors}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <NSIcon name="star" size={30} />
            <Text style={styles.title} numberOfLines={2}>
              Community Contributors
            </Text>
            {/* Presentation-only — contributors.length is already in local
                state (Step 10A). Matches Help's existing "N open" badge
                pattern (same shape/spacing), so a sparse Community screen
                gets the same kind of information anchor Help already has,
                without a new fetch or a new badge system. Hidden at zero,
                same as Help's, so it can never read as a misleading "0". */}
            {contributors.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{contributors.length}</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {schoolName
              ? `Students who've genuinely helped others at ${schoolName}`
              : "Students who've genuinely helped others in their school community"}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View>
        <EmptyState
          icon="star-outline"
          nsIcon={hasSchool ? 'star' : 'school'}
          tint={colors.warningLight}
          title={hasSchool ? 'No community contributors yet' : 'Add your school to see contributors'}
          subtitle={
            hasSchool
              ? 'Be the first to help someone at your school and get recognized here.'
              : 'Pick your school to see the students who help out there.'
          }
        />
        {!hasSchool && (
          <PrimaryButton
            title="Choose School"
            icon="school-outline"
            onPress={() => navigation.navigate('ChooseSchool')}
            style={styles.emptyActionButton}
          />
        )}
        </View>
      }
      ListFooterComponent={
        hasSchool ? (
          <View style={styles.howTo}>
            <Text style={styles.howToTitle}>How to show up here</Text>
            <View style={styles.howToSteps}>
              {HOW_TO_STEPS.map((step) => (
                <View key={step.text} style={styles.howToStep}>
                  <View style={[styles.howToCircle, { backgroundColor: step.tint }]}>
                    <NSIcon name={step.icon} size={30} />
                  </View>
                  <Text style={styles.howToText}>{step.text}</Text>
                </View>
              ))}
            </View>
            <PrimaryButton
              title="See who needs help"
              icon="hand-left-outline"
              variant="outline"
              onPress={() => navigation.navigate('Tabs', { screen: 'Help' })}
            />
          </View>
        ) : null
      }
      renderItem={({ item, index }) => (
        <FadeInView delay={Math.min(index, 6) * 40}>
          <ContributorRow
            variant="row"
            user={item}
            stat={
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <NSIcon name="thanks" size={16} />
                  <Text style={styles.statText}>{item.thanks_received_count} Thanks Received</Text>
                </View>
                {item.studentsHelped > 0 && (
                  <View style={styles.statItem}>
                    <NSIcon name="help" size={16} />
                    <Text style={styles.statText}>{item.studentsHelped} Helped</Text>
                  </View>
                )}
              </View>
            }
            onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
          />
        </FadeInView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  // Without this the list shows the platform's default gray instead of the
  // app background used on every other tab.
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  // flexWrap so a long/localized title never pushes the badge off-screen —
  // it wraps to its own line instead of clipping or forcing horizontal
  // scroll (Step 10A).
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  // Same shape/spacing as HelpScreen's countBadge — primary/star-colored
  // here instead of secondary/help-colored, matching the 🌟 star icon this
  // screen's title already uses (the same color the "Points" stat's star
  // icon already uses on Profile/UserProfile's Community card), not a new
  // color introduced just for this badge.
  countBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  countBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  emptyActionButton: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.xl,
  },
  howTo: {
    marginTop: spacing.lg,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  howToTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.textDark,
    textAlign: 'center',
  },
  howToSteps: {
    flexDirection: 'row',
  },
  howToStep: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  howToCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howToEmoji: {
    fontSize: 22,
  },
  howToText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
});
