import { useCallback, useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchSchoolStudentCount, fetchSchoolMembers, fetchSchoolMembersByGrade, fetchSchoolMembersByInterests } from '../../lib/schools';
import { fetchPostsBySchool } from '../../lib/posts';
import { fetchProfileById } from '../../lib/profile';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { formatRelativeTime } from '../../lib/time';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { CATEGORY_STYLES } from '../../constants/categoryStyles';
import { MainStackParamList, SchoolMember, Post, PostCategory } from '../../types';

// Each section pulls a small, capped slice rather than everything — this page
// is a discovery surface, not a full feed. Tapping any post still goes to the
// real PostDetailScreen for full interaction (like/comment/volunteer/etc).
const SECTION_LIMIT = 5;
const MEMBER_LIMIT = 30;
const DISCOVERY_LIMIT = 10;

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
  const { schoolName } = route.params;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [studentCount, setStudentCount] = useState(0);
  const [members, setMembers] = useState<SchoolMember[]>([]);
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
          const [count, memberList, recent, help, questions, friends, myProfile, blockedIds] = await Promise.all([
            fetchSchoolStudentCount(schoolName),
            fetchSchoolMembers(schoolName, MEMBER_LIMIT),
            fetchPostsBySchool(schoolName, undefined, SECTION_LIMIT),
            fetchPostsBySchool(schoolName, 'Need Help', SECTION_LIMIT),
            fetchPostsBySchool(schoolName, 'School Question', SECTION_LIMIT),
            fetchPostsBySchool(schoolName, 'Looking for Friends', SECTION_LIMIT),
            user ? fetchProfileById(user.id) : Promise.resolve(null),
            user ? fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
          ]);
          // UX filtering only, not a security boundary — see blocks.ts.
          setStudentCount(count);
          setMembers(memberList.filter((m) => !blockedIds.has(m.id)));
          setRecentPosts(recent.filter((p) => !blockedIds.has(p.author_id)));
          setHelpPosts(help.filter((p) => !blockedIds.has(p.author_id)));
          setQuestionPosts(questions.filter((p) => !blockedIds.has(p.author_id)));
          setFriendPosts(friends.filter((p) => !blockedIds.has(p.author_id)));

          // "Find your community" only shows on your OWN school's page, and only
          // if you opted into New Student mode — never on a school you're just
          // browsing, and never forced on anyone who didn't ask for it.
          const isOwnSchool = !!myProfile && myProfile.school_name === schoolName;
          const wantsDiscovery = isOwnSchool && myProfile!.is_new_student === true;

          if (wantsDiscovery && user) {
            setMyGrade(myProfile!.grade);
            const [byGrade, byInterests] = await Promise.all([
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
    }, [schoolName, user])
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
        <Text style={styles.schoolName}>🏫 {schoolName}</Text>
        <Text style={styles.studentCount}>
          {studentCount} {studentCount === 1 ? 'Student' : 'Students'}
        </Text>
      </FadeInView>

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
            {section.posts.map((post) => {
              const category = CATEGORY_STYLES[post.category];
              return (
                <TouchableOpacity
                  key={post.id}
                  style={styles.postCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('PostDetail', { post })}
                >
                  <View style={styles.postHeader}>
                    <Avatar uri={post.profiles?.avatar_url} size={32} />
                    <View style={styles.postHeaderText}>
                      <Text style={styles.postAuthor}>{post.profiles?.full_name ?? 'Unknown'}</Text>
                      <Text style={styles.postTimestamp}>{formatRelativeTime(post.created_at)}</Text>
                    </View>
                    {!section.category && (
                      <View style={[styles.categoryBadge, { backgroundColor: category.bg }]}>
                        <Ionicons name={category.icon} size={11} color={category.text} />
                        <Text style={[styles.categoryText, { color: category.text }]}>{post.category}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postContent} numberOfLines={2}>
                    {post.content}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
  studentCount: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: spacing.xs,
  },
  membersSection: {
    marginBottom: spacing.lg,
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
  postCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  postHeaderText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  postAuthor: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  postTimestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  categoryText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
  postContent: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
    lineHeight: 19,
  },
});
