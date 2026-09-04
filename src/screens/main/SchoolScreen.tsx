import { useCallback, useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchSchoolStudentCount,
  fetchSchoolMembers,
  fetchSchoolMembersByGrade,
  fetchSchoolMembersByInterests,
  fetchSchoolStudentCountById,
  fetchSchoolMembersById,
  fetchSchoolMembersByGradeById,
  fetchSchoolMembersByInterestsById,
  fetchSchoolById,
  fetchSchoolContributors,
  fetchSchoolContributorsById,
} from '../../lib/schools';
import {
  fetchPostsBySchool,
  fetchPostsBySchoolId,
  fetchUpcomingEventsBySchool,
  fetchUpcomingEventsBySchoolId,
} from '../../lib/posts';
import { fetchStoriesBySchool, fetchStoriesBySchoolId } from '../../lib/stories';
import { getSeenStoryIds } from '../../lib/storyPrefs';
import { fetchProfileById } from '../../lib/profile';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { Skeleton, PostCardSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import PostPreviewCard from '../../components/PostPreviewCard';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, SchoolMember, Post, Story, School, SchoolContributor } from '../../types';

// Each section pulls a small, capped slice rather than everything — this page
// is a discovery surface, not a full feed. Tapping any post still goes to the
// real PostDetailScreen for full interaction (like/comment/volunteer/etc).
const SECTION_LIMIT = 5;
const MEMBER_LIMIT = 30;
const DISCOVERY_LIMIT = 10;
const CONTRIBUTOR_LIMIT = 5;

// Shared by the Members row and both "Find your community" rows — same card
// shape (avatar + name, tap through to the real profile). Callers own their
// own heading Text, since "Members" wants a full section title while the two
// discovery rows want smaller subtitles nested under one shared heading.
function renderMemberList(data: SchoolMember[], navigation: NativeStackNavigationProp<MainStackParamList>) {
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={data}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.membersRow}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.memberItem}
          onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
        >
          <Avatar uri={item.avatar_url} size={56} />
          <Text style={styles.memberName} numberOfLines={1}>
            {item.full_name ?? 'Unknown'}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

// One consistent "Title ... See All" header for every Hub section that has a
// fuller place to send someone — keeps that pattern from being copy-pasted
// (and drifting) across Stories/Need Help/Questions.
function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SchoolScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'School'>>();
  const { schoolId, schoolName } = route.params;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [directorySchool, setDirectorySchool] = useState<School | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [contributors, setContributors] = useState<SchoolContributor[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [schoolStories, setSchoolStories] = useState<Story[]>([]);
  const [seenSchoolStoryIds, setSeenSchoolStoryIds] = useState<Set<string>>(new Set());
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Post[]>([]);
  const [openHelpPosts, setOpenHelpPosts] = useState<Post[]>([]);
  const [questionPosts, setQuestionPosts] = useState<Post[]>([]);
  const [friendPosts, setFriendPosts] = useState<Post[]>([]);
  const [myGrade, setMyGrade] = useState<string | null>(null);
  const [gradeMates, setGradeMates] = useState<SchoolMember[]>([]);
  const [interestMates, setInterestMates] = useState<SchoolMember[]>([]);

  const loadSchoolData = useCallback(async () => {
    try {
      // Prefer the stable school_id once this page was reached with one;
      // school_name stays the fallback for every link that only ever had a
      // free-text name to pass (see MainStackParamList's School route). One
      // Promise.all — every section loads together, not as a waterfall of
      // independent spinners.
      const [count, contributorList, memberList, recent, events, openHelp, questions, friends, stories, directoryRow, myProfile, blockedIds] =
        await Promise.all([
          schoolId ? fetchSchoolStudentCountById(schoolId) : fetchSchoolStudentCount(schoolName),
          (schoolId
            ? fetchSchoolContributorsById(schoolId, CONTRIBUTOR_LIMIT)
            : fetchSchoolContributors(schoolName, CONTRIBUTOR_LIMIT)
          ).catch(() => [] as SchoolContributor[]),
          schoolId ? fetchSchoolMembersById(schoolId, MEMBER_LIMIT) : fetchSchoolMembers(schoolName, MEMBER_LIMIT),
          schoolId
            ? fetchPostsBySchoolId(schoolId, undefined, SECTION_LIMIT)
            : fetchPostsBySchool(schoolName, undefined, SECTION_LIMIT),
          (schoolId
            ? fetchUpcomingEventsBySchoolId(schoolId, SECTION_LIMIT)
            : fetchUpcomingEventsBySchool(schoolName, SECTION_LIMIT)
          ).catch(() => [] as Post[]),
          // "Need Help" only ever shows actionable, still-open requests — not
          // ones already accepted or completed.
          schoolId
            ? fetchPostsBySchoolId(schoolId, 'Need Help', SECTION_LIMIT, 'open')
            : fetchPostsBySchool(schoolName, 'Need Help', SECTION_LIMIT, 'open'),
          schoolId
            ? fetchPostsBySchoolId(schoolId, 'School Question', SECTION_LIMIT)
            : fetchPostsBySchool(schoolName, 'School Question', SECTION_LIMIT),
          schoolId
            ? fetchPostsBySchoolId(schoolId, 'Looking for Friends', SECTION_LIMIT)
            : fetchPostsBySchool(schoolName, 'Looking for Friends', SECTION_LIMIT),
          (schoolId
            ? fetchStoriesBySchoolId(schoolId, MEMBER_LIMIT)
            : fetchStoriesBySchool(schoolName, MEMBER_LIMIT)
          ).catch(() => [] as Story[]),
          schoolId ? fetchSchoolById(schoolId).catch(() => null) : Promise.resolve(null),
          user ? fetchProfileById(user.id) : Promise.resolve(null),
          user ? fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
        ]);
      // UX filtering only, not a security boundary — see blocks.ts.
      setStudentCount(count);
      setContributors(contributorList.filter((c) => !blockedIds.has(c.id)));
      setDirectorySchool(directoryRow);
      setMembers(memberList.filter((m) => !blockedIds.has(m.id)));
      setRecentPosts(recent.filter((p) => !blockedIds.has(p.author_id)));
      setUpcomingEvents(events.filter((p) => !blockedIds.has(p.author_id)));
      setOpenHelpPosts(openHelp.filter((p) => !blockedIds.has(p.author_id)));
      setQuestionPosts(questions.filter((p) => !blockedIds.has(p.author_id)));
      setFriendPosts(friends.filter((p) => !blockedIds.has(p.author_id)));

      const visibleStories = stories.filter((s) => !blockedIds.has(s.author_id));
      setSchoolStories(visibleStories);
      // Read-only here — same local seen/unseen state Feed's story rail
      // already reads, just consulted again, never pruned from this screen:
      // pruning against only THIS school's ids would wrongly forget that
      // other-school stories (visible in Feed's own rail) were seen.
      if (user) {
        setSeenSchoolStoryIds(await getSeenStoryIds(user.id));
      }

      // "Find your community" only shows on your OWN school's page, and only
      // if you opted into New Student mode — never on a school you're just
      // browsing, and never forced on anyone who didn't ask for it.
      const isOwnSchool =
        !!myProfile && (schoolId ? myProfile.school_id === schoolId : myProfile.school_name === schoolName);
      const wantsDiscovery = isOwnSchool && myProfile!.is_new_student === true;

      if (wantsDiscovery && user) {
        setMyGrade(myProfile!.grade);
        const [byGrade, byInterests] = schoolId
          ? await Promise.all([
              myProfile!.grade
                ? fetchSchoolMembersByGradeById(schoolId, myProfile!.grade, user.id, DISCOVERY_LIMIT)
                : Promise.resolve([]),
              myProfile!.interests.length > 0
                ? fetchSchoolMembersByInterestsById(schoolId, myProfile!.interests, user.id, DISCOVERY_LIMIT)
                : Promise.resolve([]),
            ])
          : await Promise.all([
              myProfile!.grade
                ? fetchSchoolMembersByGrade(schoolName, myProfile!.grade, user.id, DISCOVERY_LIMIT)
                : Promise.resolve([]),
              myProfile!.interests.length > 0
                ? fetchSchoolMembersByInterests(schoolName, myProfile!.interests, user.id, DISCOVERY_LIMIT)
                : Promise.resolve([]),
            ]);
        setGradeMates(byGrade.filter((m) => !blockedIds.has(m.id)));
        setInterestMates(byInterests.filter((m) => !blockedIds.has(m.id)));
      } else {
        setMyGrade(null);
        setGradeMates([]);
        setInterestMates([]);
      }
    } catch {
      // leave everything at its default (empty) — sections below handle that gracefully
    }
  }, [schoolId, schoolName, user]);

  // Refetch every time this page gains focus, but only show the full skeleton
  // the very first time — same "quiet refresh after that" pattern FeedScreen
  // already uses, so returning from a post/story doesn't cause a jarring reload.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!hasLoadedOnce) setLoading(true);
        await loadSchoolData();
        setLoading(false);
        setHasLoadedOnce(true);
      })();
    }, [loadSchoolData, hasLoadedOnce])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSchoolData();
    setRefreshing(false);
  };

  const goToSearch = () => navigation.navigate('Tabs', { screen: 'Search' });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Skeleton width="70%" height={22} />
            <Skeleton width="40%" height={13} style={{ marginTop: spacing.sm }} />
          </View>
          <Skeleton width="50%" height={16} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Skeleton width={56} height={56} radius={radius.full} />
            <Skeleton width={56} height={56} radius={radius.full} />
            <Skeleton width={56} height={56} radius={radius.full} />
          </View>
          <PostCardSkeleton />
          <PostCardSkeleton />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <FadeInView style={styles.header}>
        <Text style={styles.schoolName}>🏫 {directorySchool?.name ?? schoolName}</Text>
        {directorySchool?.city ? (
          <Text style={styles.schoolLocation}>
            {directorySchool.city}
            {directorySchool.state ? `, ${directorySchool.state}` : ''}
          </Text>
        ) : null}
        <Text style={styles.studentCount}>
          {studentCount} {studentCount === 1 ? 'Student' : 'Students'}
        </Text>
        <Text style={styles.disclaimer}>Community-built from student profiles — not officially verified.</Text>
      </FadeInView>

      {schoolStories.length > 0 && (
        <FadeInView style={styles.section} delay={10}>
          <SectionHeader
            title="🏫 School Stories"
            onSeeAll={() => navigation.navigate('StoryViewer', { stories: schoolStories, initialIndex: 0 })}
          />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={schoolStories}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.membersRow}
            renderItem={({ item, index }) => {
              const mine = item.author_id === user?.id;
              const seen = seenSchoolStoryIds.has(item.id);
              // Same seen/mine ring convention as Feed's story rail — see the
              // matching comment there.
              const ringColor = mine ? colors.success : seen ? colors.border : colors.secondary;
              return (
                <TouchableOpacity
                  style={styles.memberItem}
                  onPress={() => navigation.navigate('StoryViewer', { stories: schoolStories, initialIndex: index })}
                >
                  <View style={[styles.storyAvatarWrap, { borderColor: ringColor }]}>
                    <Avatar uri={item.profiles?.avatar_url} size={56} />
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {mine ? 'Your Story' : item.profiles?.full_name ?? 'Unknown'}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </FadeInView>
      )}

      {recentPosts.length > 0 && (
        <FadeInView style={styles.section} delay={20}>
          <SectionHeader title="📰 What's Happening" />
          {recentPosts.map((post) => (
            <PostPreviewCard key={post.id} post={post} onPress={() => navigation.navigate('PostDetail', { post })} />
          ))}
        </FadeInView>
      )}

      {upcomingEvents.length > 0 && (
        <FadeInView style={styles.section} delay={25}>
          <SectionHeader title="🎉 School Events" onSeeAll={goToSearch} />
          {upcomingEvents.map((post) => (
            <PostPreviewCard
              key={post.id}
              post={post}
              showCategory={false}
              onPress={() => navigation.navigate('PostDetail', { post })}
            />
          ))}
        </FadeInView>
      )}

      {openHelpPosts.length > 0 && (
        <FadeInView style={styles.section} delay={30}>
          <SectionHeader title="🤝 Need Help" onSeeAll={goToSearch} />
          {openHelpPosts.map((post) => (
            <PostPreviewCard
              key={post.id}
              post={post}
              showCategory={false}
              onPress={() => navigation.navigate('PostDetail', { post })}
            />
          ))}
        </FadeInView>
      )}

      {questionPosts.length > 0 && (
        <FadeInView style={styles.section} delay={40}>
          <SectionHeader title="❓ Questions" onSeeAll={goToSearch} />
          {questionPosts.map((post) => (
            <PostPreviewCard
              key={post.id}
              post={post}
              showCategory={false}
              onPress={() => navigation.navigate('PostDetail', { post })}
            />
          ))}
        </FadeInView>
      )}

      {friendPosts.length > 0 && (
        <FadeInView style={styles.section} delay={50}>
          <SectionHeader title="👋 Looking for Friends" />
          {friendPosts.map((post) => (
            <PostPreviewCard
              key={post.id}
              post={post}
              showCategory={false}
              onPress={() => navigation.navigate('PostDetail', { post })}
            />
          ))}
        </FadeInView>
      )}

      {schoolStories.length === 0 &&
        recentPosts.length === 0 &&
        upcomingEvents.length === 0 &&
        openHelpPosts.length === 0 &&
        questionPosts.length === 0 &&
        friendPosts.length === 0 && (
          <EmptyState
            icon="school-outline"
            title="Nothing here yet"
            subtitle={`Be the first to post something for ${directorySchool?.name ?? schoolName}!`}
          />
        )}

      {contributors.length > 0 && (
        <FadeInView style={styles.section} delay={60}>
          <Text style={styles.sectionTitle}>🌟 Community Contributors</Text>
          <Text style={styles.contributorsSubtitle}>Students who've helped others in this community</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={contributors}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.membersRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.memberItem}
                onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
              >
                <Avatar uri={item.avatar_url} size={56} />
                <Text style={styles.memberName} numberOfLines={1}>
                  {item.full_name ?? 'Unknown'}
                </Text>
                <Text style={styles.contributorMeta}>💙 {item.thanks_received_count}</Text>
              </TouchableOpacity>
            )}
          />
        </FadeInView>
      )}

      {(gradeMates.length > 0 || interestMates.length > 0) && (
        <FadeInView style={styles.section} delay={70}>
          <Text style={styles.sectionTitle}>Find your community</Text>
          {gradeMates.length > 0 && (
            <View style={styles.memberRowWrap}>
              <Text style={styles.memberRowTitle}>Students in Grade {myGrade}</Text>
              {renderMemberList(gradeMates, navigation)}
            </View>
          )}
          {interestMates.length > 0 && (
            <View style={styles.memberRowWrap}>
              <Text style={styles.memberRowTitle}>Students with similar interests</Text>
              {renderMemberList(interestMates, navigation)}
            </View>
          )}
        </FadeInView>
      )}

      {members.length > 0 && (
        <FadeInView style={styles.section} delay={80}>
          <Text style={styles.sectionTitle}>Members</Text>
          {renderMemberList(members, navigation)}
        </FadeInView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  header: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  schoolName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
  },
  schoolLocation: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  studentCount: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  disclaimer: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  seeAllText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  contributorsSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  contributorMeta: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 1,
  },
  memberRowWrap: {
    marginBottom: spacing.md,
  },
  memberRowTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  membersRow: {
    gap: spacing.md,
  },
  memberItem: {
    alignItems: 'center',
    width: 64,
  },
  storyAvatarWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberName: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textDark,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
    marginBottom: spacing.sm,
  },
  section: {
    marginBottom: spacing.lg,
  },
});
