import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { searchUsers, searchPosts, searchSchools } from '../../lib/search';
import { fetchPostsBySchool, fetchPostsBySchoolId } from '../../lib/posts';
import { fetchStoriesBySchool, fetchStoriesBySchoolId } from '../../lib/stories';
import { fetchProfileById } from '../../lib/profile';
import {
  fetchSchoolMembersByGrade,
  fetchSchoolMembersByInterests,
  fetchSchoolMembersByGradeById,
  fetchSchoolMembersByInterestsById,
} from '../../lib/schools';
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../../lib/recentSearches';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { fetchFollowingIds } from '../../lib/follows';
import { useAuth } from '../../contexts/AuthContext';
import IconInput from '../../components/IconInput';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import FadeInView from '../../components/FadeInView';
import PostPreviewCard from '../../components/PostPreviewCard';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import {
  MainStackParamList,
  PersonSearchResult,
  SchoolSearchResult,
  SchoolMember,
  Post,
  PostCategory,
  Story,
} from '../../types';

const DEBOUNCE_MS = 300;
const RESULT_DISPLAY_LIMIT = 5; // per section, when searching — avoid overwhelming the user
const CATEGORY_FILTERS: { label: string; value: PostCategory | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Need Help', value: 'Need Help' },
  { label: 'School Question', value: 'School Question' },
  { label: 'Looking for Friends', value: 'Looking for Friends' },
];

// Dedupes across grade-mates and interest-mates for "People You May Know" —
// first list wins on overlap (deterministic: grade match takes priority over
// interest match), no scoring involved.
function dedupeMembers(...lists: SchoolMember[][]): SchoolMember[] {
  const seen = new Set<string>();
  const result: SchoolMember[] = [];
  for (const list of lists) {
    for (const member of list) {
      if (!seen.has(member.id)) {
        seen.add(member.id);
        result.push(member);
      }
    }
  }
  return result;
}

export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [postCategory, setPostCategory] = useState<PostCategory | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [people, setPeople] = useState<PersonSearchResult[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [schools, setSchools] = useState<SchoolSearchResult[]>([]);

  const [mySchoolName, setMySchoolName] = useState<string | null>(null);
  const [suggestedPeople, setSuggestedPeople] = useState<SchoolMember[]>([]);
  const [suggestedPosts, setSuggestedPosts] = useState<Post[]>([]);
  const [schoolStories, setSchoolStories] = useState<Story[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reused by both the initial focus load and pull-to-refresh — reuses the
  // exact same Step 5 discovery functions SchoolScreen's "Find your
  // community" section already calls, just surfaced generally instead of
  // gated behind New Student mode.
  const loadDiscovery = useCallback(async () => {
    if (!user) return;
    try {
      const myProfile = await fetchProfileById(user.id);
      setMySchoolName(myProfile.school_name);
      const schoolId = myProfile.school_id;
      if (!schoolId && !myProfile.school_name) {
        setSuggestedPeople([]);
        setSuggestedPosts([]);
        setSchoolStories([]);
        return;
      }

      const [blockedIds, followingIds] = await Promise.all([
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
        fetchFollowingIds(user.id).catch(() => [] as string[]),
      ]);
      const followingIdSet = new Set(followingIds);
      // Prefer the stable school_id once set; school_name stays the fallback
      // for every profile that hasn't picked from the directory yet.
      const [byGrade, byInterests, schoolPosts, stories] = schoolId
        ? await Promise.all([
            myProfile.grade
              ? fetchSchoolMembersByGradeById(schoolId, myProfile.grade, user.id, 10)
              : Promise.resolve([]),
            myProfile.interests.length > 0
              ? fetchSchoolMembersByInterestsById(schoolId, myProfile.interests, user.id, 10)
              : Promise.resolve([]),
            fetchPostsBySchoolId(schoolId, undefined, 5),
            fetchStoriesBySchoolId(schoolId, 10).catch(() => [] as Story[]),
          ])
        : await Promise.all([
            myProfile.grade
              ? fetchSchoolMembersByGrade(myProfile.school_name!, myProfile.grade, user.id, 10)
              : Promise.resolve([]),
            myProfile.interests.length > 0
              ? fetchSchoolMembersByInterests(myProfile.school_name!, myProfile.interests, user.id, 10)
              : Promise.resolve([]),
            fetchPostsBySchool(myProfile.school_name!, undefined, 5),
            fetchStoriesBySchool(myProfile.school_name!, 10).catch(() => [] as Story[]),
          ]);

      // UX filtering only, not a security boundary — see blocks.ts. Already-
      // followed people are also skipped here — no strong reason to keep
      // suggesting someone you're already following.
      setSuggestedPeople(
        dedupeMembers(byGrade, byInterests)
          .filter((m) => !blockedIds.has(m.id) && !followingIdSet.has(m.id))
          .slice(0, 10)
      );
      setSuggestedPosts(schoolPosts.filter((p) => !blockedIds.has(p.author_id)));
      setSchoolStories(stories.filter((s) => !blockedIds.has(s.author_id)));
    } catch {
      // Discovery is a bonus surface, not the primary flow — fail quietly.
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      getRecentSearches().then(setRecentSearches);
      loadDiscovery();
    }, [loadDiscovery])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDiscovery();
    setRefreshing(false);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setPeople([]);
      setPosts([]);
      setSchools([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [peopleResults, postResults, schoolResults, blockedIds] = await Promise.all([
          searchUsers(trimmed, mySchoolName),
          searchPosts(trimmed, postCategory),
          searchSchools(trimmed),
          user ? fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
        ]);
        // UX filtering only, not a security boundary — see blocks.ts.
        setPeople(peopleResults.filter((p) => !blockedIds.has(p.id)));
        setPosts(postResults.filter((p) => !blockedIds.has(p.author_id)));
        setSchools(schoolResults);
        setSearchError(null);
      } catch (err) {
        setPeople([]);
        setPosts([]);
        setSchools([]);
        setSearchError(err instanceof Error ? err.message : 'Could not search right now.');
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, postCategory, user, mySchoolName]);

  const recordSearch = async () => {
    const updated = await addRecentSearch(query.trim());
    setRecentSearches(updated);
  };

  const handleSelectPerson = async (person: PersonSearchResult) => {
    await recordSearch();
    navigation.navigate('UserProfile', { userId: person.id });
  };

  const handleSelectPost = async (post: Post) => {
    await recordSearch();
    navigation.navigate('PostDetail', { post });
  };

  const handleSelectSchool = async (schoolName: string) => {
    await recordSearch();
    navigation.navigate('School', { schoolName });
  };

  const handleSelectRecent = (term: string) => {
    setQuery(term);
  };

  const handleRemoveRecent = async (e: { stopPropagation: () => void }, term: string) => {
    e.stopPropagation();
    const updated = await removeRecentSearch(term);
    setRecentSearches(updated);
  };

  const handleClearRecent = async () => {
    await clearRecentSearches();
    setRecentSearches([]);
  };

  const showRecent = query.trim().length === 0;
  const hasAnyResults = people.length > 0 || posts.length > 0 || schools.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search</Text>

      <View style={styles.inputWrap}>
        <IconInput
          icon="search-outline"
          placeholder="Search students, posts, or schools"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {!showRecent && (
        <View style={styles.chipRow}>
          {CATEGORY_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, postCategory === f.value && styles.chipSelected]}
              onPress={() => setPostCategory(f.value)}
            >
              <Text style={[styles.chipText, postCategory === f.value && styles.chipTextSelected]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showRecent ? (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {recentSearches.length > 0 && (
            <View style={styles.section}>
              <View style={styles.recentHeader}>
                <Text style={styles.sectionTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={handleClearRecent}>
                  <Text style={styles.clearText}>Clear All</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((term) => (
                <TouchableOpacity key={term} style={styles.recentRow} onPress={() => handleSelectRecent(term)}>
                  <Ionicons name="time-outline" size={18} color={colors.textMid} />
                  <Text style={styles.recentText}>{term}</Text>
                  <TouchableOpacity
                    onPress={(e) => handleRemoveRecent(e, term)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={16} color={colors.textLight} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {schoolStories.length > 0 && mySchoolName && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏫 What's happening at {mySchoolName}</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={schoolStories}
                keyExtractor={(s) => s.id}
                contentContainerStyle={styles.storyRow}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={styles.storyItem}
                    onPress={() => navigation.navigate('StoryViewer', { stories: schoolStories, initialIndex: index })}
                  >
                    <Avatar uri={item.profiles?.avatar_url} size={52} />
                    <Text style={styles.storyItemName} numberOfLines={1}>
                      {item.author_id === user?.id ? 'You' : item.profiles?.full_name ?? 'Unknown'}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {suggestedPeople.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>People You May Know</Text>
              {suggestedPeople.map((person) => (
                <TouchableOpacity
                  key={person.id}
                  style={styles.resultRow}
                  onPress={() => navigation.navigate('UserProfile', { userId: person.id })}
                >
                  <Avatar uri={person.avatar_url} size={44} />
                  <View style={styles.resultText}>
                    <Text style={styles.resultName}>{person.full_name ?? 'Unknown'}</Text>
                    {person.grade ? <Text style={styles.resultMeta}>Grade {person.grade}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {suggestedPosts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suggested for You</Text>
              {suggestedPosts.map((post) => (
                <PostPreviewCard key={post.id} post={post} onPress={() => navigation.navigate('PostDetail', { post })} />
              ))}
            </View>
          )}

          {recentSearches.length === 0 && suggestedPeople.length === 0 && suggestedPosts.length === 0 && (
            <EmptyState
              icon="search-outline"
              title="Search for students, posts, or schools"
              subtitle="Find classmates by name, username, school, or interest."
            />
          )}
        </ScrollView>
      ) : searching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {!hasAnyResults ? (
            <EmptyState
              icon="search-outline"
              title="No results found"
              subtitle={searchError ?? `No matches for "${query.trim()}"`}
            />
          ) : (
            <>
              {people.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>People</Text>
                  {people.slice(0, RESULT_DISPLAY_LIMIT).map((person, index) => (
                    <FadeInView key={person.id} delay={Math.min(index, 6) * 30}>
                      <TouchableOpacity style={styles.resultRow} onPress={() => handleSelectPerson(person)}>
                        <Avatar uri={person.avatar_url} size={48} />
                        <View style={styles.resultText}>
                          <Text style={styles.resultName}>{person.full_name ?? 'Unknown'}</Text>
                          {person.username ? <Text style={styles.resultMeta}>@{person.username}</Text> : null}
                          {person.school_name ? <Text style={styles.resultMeta}>{person.school_name}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    </FadeInView>
                  ))}
                </View>
              )}

              {posts.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Posts</Text>
                  {posts.slice(0, RESULT_DISPLAY_LIMIT).map((post) => (
                    <PostPreviewCard key={post.id} post={post} onPress={() => handleSelectPost(post)} />
                  ))}
                </View>
              )}

              {schools.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Schools</Text>
                  {schools.slice(0, RESULT_DISPLAY_LIMIT).map((school) => (
                    <TouchableOpacity
                      key={school.schoolName}
                      style={styles.schoolRow}
                      onPress={() => handleSelectSchool(school.schoolName)}
                    >
                      <Text style={styles.schoolEmoji}>🏫</Text>
                      <View style={styles.resultText}>
                        <Text style={styles.resultName}>{school.schoolName}</Text>
                        <Text style={styles.resultMeta}>
                          {school.studentCount} {school.studentCount === 1 ? 'student' : 'students'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  clearButton: {
    position: 'absolute',
    right: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
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
    fontSize: fontSize.xs,
  },
  chipTextSelected: {
    fontFamily: fontFamily.semibold,
    color: '#fff',
    fontSize: fontSize.xs,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
  },
  clearText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  storyRow: {
    gap: spacing.md,
  },
  storyItem: {
    alignItems: 'center',
    width: 60,
  },
  storyItemName: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textDark,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  recentText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  resultMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  schoolEmoji: {
    fontSize: 24,
  },
});
