import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { searchUsers, searchPosts, searchSchools } from '../../lib/search';
import { fetchPostsBySchool, fetchPostsBySchoolId, fetchUpcomingEventsBySchool, fetchUpcomingEventsBySchoolId } from '../../lib/posts';
import { fetchStoriesBySchool, fetchStoriesBySchoolId } from '../../lib/stories';
import { fetchProfileById } from '../../lib/profile';
import {
  fetchSchoolMembersByGrade,
  fetchSchoolMembersByInterests,
  fetchSchoolMembersByGradeById,
  fetchSchoolMembersByInterestsById,
  fetchSchoolContributors,
  fetchSchoolContributorsById,
} from '../../lib/schools';
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../../lib/recentSearches';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { fetchFollowingIds, followUser } from '../../lib/follows';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import IconInput from '../../components/IconInput';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import FadeInView from '../../components/FadeInView';
import PostPreviewCard from '../../components/PostPreviewCard';
import PrimaryButton from '../../components/PrimaryButton';
import SectionHeader from '../../components/SectionHeader';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { getInterestIcon } from '../../constants/interests';
import {
  MainStackParamList,
  PersonSearchResult,
  SchoolSearchResult,
  SchoolMember,
  SchoolContributor,
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
  { label: 'Event', value: 'Event' },
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

// Deterministic, explainable overlap — not a score. Powers the interest
// chips on a "People You May Know" card; case-insensitive since the curated
// picker and old free-typed values may differ only in casing.
function sharedInterests(mine: string[], theirs: string[]): string[] {
  const mineSet = new Set(mine.map((i) => i.toLowerCase()));
  return theirs.filter((i) => mineSet.has(i.toLowerCase()));
}

const SUGGESTED_PEOPLE_LIMIT = 5;

export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [postCategory, setPostCategory] = useState<PostCategory | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [people, setPeople] = useState<PersonSearchResult[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [schools, setSchools] = useState<SchoolSearchResult[]>([]);

  const [mySchoolName, setMySchoolName] = useState<string | null>(null);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [suggestedPeople, setSuggestedPeople] = useState<SchoolMember[]>([]);
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(new Set());
  const [contributors, setContributors] = useState<SchoolContributor[]>([]);
  const [recentQuestions, setRecentQuestions] = useState<Post[]>([]);
  const [needHelpPosts, setNeedHelpPosts] = useState<Post[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Post[]>([]);
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
      setMyInterests(myProfile.interests ?? []);
      const schoolId = myProfile.school_id;
      if (!schoolId && !myProfile.school_name) {
        setSuggestedPeople([]);
        setContributors([]);
        setRecentQuestions([]);
        setNeedHelpPosts([]);
        setUpcomingEvents([]);
        setSchoolStories([]);
        return;
      }

      const [blockedIds, followingIds] = await Promise.all([
        fetchBlockedUserIds(user.id).catch(() => new Set<string>()),
        fetchFollowingIds(user.id).catch(() => [] as string[]),
      ]);
      const followingIdSet = new Set(followingIds);
      // Prefer the stable school_id once set; school_name stays the fallback
      // for every profile that hasn't picked from the directory yet. Recent
      // Activity is split into three named categories (Questions/Need Help/
      // Events) instead of one undifferentiated pull, and Community Helpers
      // reuses the exact same contributor query SchoolScreen already has.
      const [byGrade, byInterests, contributorList, questions, needHelp, events, stories] = schoolId
        ? await Promise.all([
            myProfile.grade
              ? fetchSchoolMembersByGradeById(schoolId, myProfile.grade, user.id, 10)
              : Promise.resolve([]),
            myProfile.interests.length > 0
              ? fetchSchoolMembersByInterestsById(schoolId, myProfile.interests, user.id, 10)
              : Promise.resolve([]),
            fetchSchoolContributorsById(schoolId, 5).catch(() => [] as SchoolContributor[]),
            fetchPostsBySchoolId(schoolId, 'School Question', 3),
            fetchPostsBySchoolId(schoolId, 'Need Help', 3, 'open'),
            fetchUpcomingEventsBySchoolId(schoolId, 3).catch(() => [] as Post[]),
            fetchStoriesBySchoolId(schoolId, 10).catch(() => [] as Story[]),
          ])
        : await Promise.all([
            myProfile.grade
              ? fetchSchoolMembersByGrade(myProfile.school_name!, myProfile.grade, user.id, 10)
              : Promise.resolve([]),
            myProfile.interests.length > 0
              ? fetchSchoolMembersByInterests(myProfile.school_name!, myProfile.interests, user.id, 10)
              : Promise.resolve([]),
            fetchSchoolContributors(myProfile.school_name!, 5).catch(() => [] as SchoolContributor[]),
            fetchPostsBySchool(myProfile.school_name!, 'School Question', 3),
            fetchPostsBySchool(myProfile.school_name!, 'Need Help', 3, 'open'),
            fetchUpcomingEventsBySchool(myProfile.school_name!, 3).catch(() => [] as Post[]),
            fetchStoriesBySchool(myProfile.school_name!, 10).catch(() => [] as Story[]),
          ]);

      // UX filtering only, not a security boundary — see blocks.ts. Already-
      // followed people are also skipped here — no strong reason to keep
      // suggesting someone you're already following. Capped small — this is
      // a "worth knowing" list, not a directory.
      setSuggestedPeople(
        dedupeMembers(byGrade, byInterests)
          .filter((m) => !blockedIds.has(m.id) && !followingIdSet.has(m.id))
          .slice(0, SUGGESTED_PEOPLE_LIMIT)
      );
      setContributors(contributorList.filter((c) => !blockedIds.has(c.id)));
      setRecentQuestions(questions.filter((p) => !blockedIds.has(p.author_id)));
      setNeedHelpPosts(needHelp.filter((p) => !blockedIds.has(p.author_id)));
      setUpcomingEvents(events.filter((p) => !blockedIds.has(p.author_id)));
      setSchoolStories(stories.filter((s) => !blockedIds.has(s.author_id)));
    } catch {
      // Discovery is a bonus surface, not the primary flow — fail quietly.
    }
  }, [user]);

  // One-way — suggested people are, by construction, never someone already
  // followed, so there's no toggle/unfollow state to track here. Removes the
  // card optimistically on success rather than waiting for the next
  // loadDiscovery(), same "act, then reconcile" feel as LikeButton/SaveButton.
  const handleFollow = async (person: SchoolMember) => {
    if (!user || pendingFollowIds.has(person.id)) return;
    setPendingFollowIds((prev) => new Set(prev).add(person.id));
    try {
      await followUser({ followerId: user.id, followingId: person.id });
      setSuggestedPeople((prev) => prev.filter((p) => p.id !== person.id));
      showToast(`Following ${person.full_name ?? 'them'}`);
    } catch {
      showToast(`Couldn't follow ${person.full_name ?? 'this person'}`);
      setPendingFollowIds((prev) => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
    }
  };

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

  // Real, non-redundant full-list destinations that now exist (Step 30's
  // Community/Help tabs) — not every Discovery section gets a "See All",
  // only the ones with somewhere fuller to actually send someone.
  const goToCommunity = () => navigation.navigate('Tabs', { screen: 'Volunteer' });
  const goToHelp = () => navigation.navigate('Tabs', { screen: 'Help' });

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
              <SectionHeader title={`🏫 What's happening at ${mySchoolName}`} />
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
              <SectionHeader title="👋 People You May Know" />
              {suggestedPeople.map((person) => {
                const shared = sharedInterests(myInterests, person.interests);
                const pending = pendingFollowIds.has(person.id);
                return (
                  <View key={person.id} style={styles.personCard}>
                    <TouchableOpacity
                      style={styles.personCardMain}
                      onPress={() => navigation.navigate('UserProfile', { userId: person.id })}
                    >
                      <Avatar uri={person.avatar_url} size={48} />
                      <View style={styles.resultText}>
                        <Text style={styles.resultName}>{person.full_name ?? 'Unknown'}</Text>
                        {person.username ? <Text style={styles.resultMeta}>@{person.username}</Text> : null}
                        {person.grade ? <Text style={styles.resultMeta}>🎓 {person.grade} Grade</Text> : null}
                        {/* Plain-language reason, backed only by data this query actually
                            guarantees: every suggestion here is already same-school, and
                            the shared count comes straight from sharedInterests() above —
                            never an inferred or invented signal (Step 30). */}
                        <Text style={styles.personReason}>
                          Same school
                          {shared.length > 0 ? ` · ${shared.length} shared interest${shared.length === 1 ? '' : 's'}` : ''}
                        </Text>
                        {shared.length > 0 && (
                          <Text style={styles.personInterests} numberOfLines={1}>
                            {shared.slice(0, 3).map((i) => `${getInterestIcon(i)} ${i}`).join(' · ')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <PrimaryButton
                      title="Follow"
                      icon="person-add-outline"
                      onPress={() => handleFollow(person)}
                      loading={pending}
                      style={styles.followButton}
                    />
                  </View>
                );
              })}
            </View>
          )}

          {contributors.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="🤝 Community Helpers" onSeeAll={goToCommunity} />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={contributors}
                keyExtractor={(c) => c.id}
                contentContainerStyle={styles.storyRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.storyItem}
                    onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
                  >
                    <Avatar uri={item.avatar_url} size={52} />
                    <Text style={styles.storyItemName} numberOfLines={1}>
                      {item.full_name ?? 'Unknown'}
                    </Text>
                    <Text style={styles.contributorMeta}>💙 {item.thanks_received_count}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {recentQuestions.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="❓ Recent Questions" />
              {recentQuestions.map((post) => (
                <PostPreviewCard key={post.id} post={post} onPress={() => navigation.navigate('PostDetail', { post })} />
              ))}
            </View>
          )}

          {needHelpPosts.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="🤝 Need Help" onSeeAll={goToHelp} />
              {needHelpPosts.map((post) => (
                <PostPreviewCard key={post.id} post={post} onPress={() => navigation.navigate('PostDetail', { post })} />
              ))}
            </View>
          )}

          {upcomingEvents.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="🎉 Upcoming Events" />
              {upcomingEvents.map((post) => (
                <PostPreviewCard key={post.id} post={post} onPress={() => navigation.navigate('PostDetail', { post })} />
              ))}
            </View>
          )}

          {recentSearches.length === 0 &&
            suggestedPeople.length === 0 &&
            contributors.length === 0 &&
            recentQuestions.length === 0 &&
            needHelpPosts.length === 0 &&
            upcomingEvents.length === 0 && (
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
                  <SectionHeader title="People" />
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
                  <SectionHeader title="Posts" />
                  {posts.slice(0, RESULT_DISPLAY_LIMIT).map((post) => (
                    <PostPreviewCard key={post.id} post={post} onPress={() => handleSelectPost(post)} />
                  ))}
                </View>
              )}

              {schools.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader title="Schools" />
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
  // Tightened from spacing.lg — with only a few results per section, the old
  // gap read as empty dead space rather than clear separation (Step 31).
  section: {
    marginBottom: spacing.md,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  // Only still used directly by "Recent Searches" (paired with its own
  // "Clear All" action, a different affordance than SectionHeader's
  // "See All") — everywhere else now renders via the shared SectionHeader.
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
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
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  personCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  personReason: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  personInterests: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  // Same PrimaryButton every other Follow action in the app uses (see
  // UserProfileScreen) — just narrower, so it fits inline in a person row
  // instead of stretching full-width.
  followButton: {
    width: 104,
  },
  contributorMeta: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 1,
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
