import { useCallback, useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fetchSchoolStudentCount, fetchSchoolMembers } from '../../lib/schools';
import { fetchPostsBySchool } from '../../lib/posts';
import { formatRelativeTime } from '../../lib/time';
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

type Section = { key: string; title: string; category?: PostCategory; posts: Post[] };

export default function SchoolScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'School'>>();
  const { schoolName } = route.params;

  const [loading, setLoading] = useState(true);
  const [studentCount, setStudentCount] = useState(0);
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [helpPosts, setHelpPosts] = useState<Post[]>([]);
  const [questionPosts, setQuestionPosts] = useState<Post[]>([]);
  const [friendPosts, setFriendPosts] = useState<Post[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [count, memberList, recent, help, questions, friends] = await Promise.all([
            fetchSchoolStudentCount(schoolName),
            fetchSchoolMembers(schoolName, MEMBER_LIMIT),
            fetchPostsBySchool(schoolName, undefined, SECTION_LIMIT),
            fetchPostsBySchool(schoolName, 'Need Help', SECTION_LIMIT),
            fetchPostsBySchool(schoolName, 'School Question', SECTION_LIMIT),
            fetchPostsBySchool(schoolName, 'Looking for Friends', SECTION_LIMIT),
          ]);
          setStudentCount(count);
          setMembers(memberList);
          setRecentPosts(recent);
          setHelpPosts(help);
          setQuestionPosts(questions);
          setFriendPosts(friends);
        } catch {
          // leave everything at its default (empty) — sections below handle that gracefully
        } finally {
          setLoading(false);
        }
      })();
    }, [schoolName])
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

      {members.length > 0 && (
        <FadeInView style={styles.membersSection} delay={60}>
          <Text style={styles.sectionTitle}>Members</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={members}
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
