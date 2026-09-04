import { useCallback, useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
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
import { fetchPostsBySchool, fetchPostsBySchoolId } from '../../lib/posts';
import { fetchStoriesBySchool, fetchStoriesBySchoolId } from '../../lib/stories';
import { getSeenStoryIds } from '../../lib/storyPrefs';
import { fetchProfileById } from '../../lib/profile';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import PostPreviewCard from '../../components/PostPreviewCard';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, SchoolMember, Post, PostCategory, Story, School, SchoolContributor } from '../../types';

// Each section pulls a small, capped slice rather than everything — this page
// is a discovery surface, not a full feed. Tapping any post still goes to the
// real PostDetailScreen for full interaction (like/comment/volunteer/etc).
const SECTION_LIMIT = 5;
const MEMBER_LIMIT = 30;
const DISCOVERY_LIMIT = 10;
const CONTRIBUTOR_LIMIT = 5;

type Section = { key: string; title: string; category?: PostCategory; posts: Post[] };

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

export default function SchoolScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'School'>>();
  const { schoolId, schoolName } = route.params;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [directorySchool, setDirectorySchool] = useState<School | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [contributors, setContributors] = useState<SchoolContributor[]>([]);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [schoolStories, setSchoolStories] = useState<Story[]>([]);
  const [seenSchoolStoryIds, setSeenSchoolStoryIds] = useState<Set<string>>(new Set());
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [helpPosts, setHelpPosts] = useState<Post[]>([]);
  const [questionPosts, setQuestionPosts] = useState<Post[]>([]);
  const [friendPosts, setFriendPosts] = useState<Post[]>([]);
  const [myGrade, setMyGrade] = useState<string | null>(null);
  const [gradeMates, setGradeMates] = useState<SchoolMember[]>([]);
  const [interestMates, setInterestMates] = useState<SchoolMember[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          // Prefer the stable school_id once this page was reached with one;
          // school_name stays the fallback for every link that only ever had
          // a free-text name to pass (see MainStackParamList's School route).
          const [count, contributorList, memberList, recent, help, questions, friends, stories, directoryRow, myProfile, blockedIds] =
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
              schoolId
                ? fetchPostsBySchoolId(schoolId, 'Need Help', SECTION_LIMIT)
                : fetchPostsBySchool(schoolName, 'Need Help', SECTION_LIMIT),
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
          setHelpPosts(help.filter((p) => !blockedIds.has(p.author_id)));
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
        } finally {
          setLoading(false);
        }
      })();
    }, [schoolId, schoolName, user])
  );

  if (loading) {
    return <LoadingScreen />;
  }

  const allSections: Section[] = [
    { key: 'recent', title: 'Recent Posts', posts: recentPosts },
    { key: 'help', title: 'Recent Help', category: 'Need Help', posts: helpPosts },
    { key: 'questions', title: 'School Questions', category: 'School Question', posts: questionPosts },
    { key: 'friends', title: 'Looking for Friends', category: 'Looking for Friends', posts: friendPosts },
  ];
  const sections = allSections.filter((s) => s.posts.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
      </FadeInView>

      {contributors.length > 0 && (
        <FadeInView style={styles.membersSection} delay={10}>
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
                <Text style={styles.contributorMeta}>
                  💙 {item.thanks_received_count}
                </Text>
              </TouchableOpacity>
            )}
          />
        </FadeInView>
      )}

      {schoolStories.length > 0 && (
        <FadeInView style={styles.membersSection} delay={20}>
          <Text style={styles.sectionTitle}>School Stories</Text>
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

      {(gradeMates.length > 0 || interestMates.length > 0) && (
        <FadeInView style={styles.membersSection} delay={40}>
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
        <FadeInView style={styles.membersSection} delay={60}>
          <Text style={styles.sectionTitle}>Members</Text>
          {renderMemberList(members, navigation)}
        </FadeInView>
      )}

      {sections.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="No posts yet"
          subtitle={`Be the first to post something for ${schoolName}!`}
        />
      ) : (
        sections.map((section, sectionIndex) => (
          <FadeInView key={section.key} style={styles.section} delay={100 + sectionIndex * 40}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.posts.map((post) => (
              <PostPreviewCard
                key={post.id}
                post={post}
                showCategory={!section.category}
                onPress={() => navigation.navigate('PostDetail', { post })}
              />
            ))}
          </FadeInView>
        ))
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
  membersSection: {
    marginBottom: spacing.lg,
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
