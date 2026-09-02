import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { searchUsers } from '../../lib/search';
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../../lib/recentSearches';
import { fetchBlockedUserIds } from '../../lib/blocks';
import { useAuth } from '../../contexts/AuthContext';
import IconInput from '../../components/IconInput';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import FadeInView from '../../components/FadeInView';
import { colors, spacing, fontSize, fontFamily } from '../../constants/theme';
import { MainStackParamList, Profile } from '../../types';

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      getRecentSearches().then(setRecentSearches);
    }, [])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchUsers(trimmed);
        // UX filtering only, not a security boundary — see blocks.ts.
        const blockedIds = user ? await fetchBlockedUserIds(user.id).catch(() => new Set<string>()) : new Set<string>();
        setResults(data.filter((p) => !blockedIds.has(p.id)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, user]);

  const handleSelectResult = async (profile: Profile) => {
    const updated = await addRecentSearch(query.trim());
    setRecentSearches(updated);
    navigation.navigate('UserProfile', { userId: profile.id });
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search</Text>
      <IconInput
        icon="search-outline"
        placeholder="Search by name, school, or interest"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      {showRecent ? (
        <FlatList
          data={recentSearches}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            recentSearches.length > 0 ? (
              <View style={styles.recentHeader}>
                <Text style={styles.sectionTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={handleClearRecent}>
                  <Text style={styles.clearText}>Clear All</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Search for students"
              subtitle="Find classmates by name, school, or interest."
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.recentRow} onPress={() => handleSelectRecent(item)}>
              <Ionicons name="time-outline" size={18} color={colors.textMid} />
              <Text style={styles.recentText}>{item}</Text>
              <TouchableOpacity
                onPress={(e) => handleRemoveRecent(e, item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={colors.textLight} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      ) : searching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState icon="person-outline" title="No users found" subtitle={`No results for "${query.trim()}"`} />
          }
          renderItem={({ item, index }) => (
            <FadeInView delay={Math.min(index, 6) * 30}>
              <TouchableOpacity style={styles.resultRow} onPress={() => handleSelectResult(item)}>
                <Avatar uri={item.avatar_url} size={48} />
                <View style={styles.resultText}>
                  <Text style={styles.resultName}>{item.full_name ?? 'Unknown'}</Text>
                  {item.school_name ? <Text style={styles.resultSchool}>{item.school_name}</Text> : null}
                </View>
              </TouchableOpacity>
            </FadeInView>
          )}
        />
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
  input: {
    marginBottom: spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: spacing.lg,
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
  },
  clearText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
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
  resultSchool: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
});
