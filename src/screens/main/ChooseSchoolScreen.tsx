import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchSchoolStates, fetchSchoolCities, searchSchoolsDirectory, setMySchool } from '../../lib/schools';
import EmptyState from '../../components/EmptyState';
import LoadingScreen from '../../components/LoadingScreen';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';
import { MainStackParamList, School } from '../../types';

type Step = 'state' | 'city' | 'search';
const DEBOUNCE_MS = 250;

const DEFAULT_TITLE = 'Choose your school';
const DEFAULT_SUBTITLE = "Selecting a school links you to its community — it doesn't verify that you attend it.";

type Props = {
  // Set only by the onboarding flow (AppNavigator) — there, this screen is
  // rendered directly on the root stack with nothing to go back to, so
  // "close"/"skip"/"selected a school" all need somewhere else to go instead
  // of navigation.goBack(). Left undefined for the normal Profile-invoked
  // case, which keeps its exact original goBack() behavior.
  onDone?: () => void;
  // Adds an explicit "Skip for now" action — only makes sense alongside onDone.
  showSkip?: boolean;
  title?: string;
  subtitle?: string;
};

// State -> Area/City -> Search -> Select, per the approved UX. One screen
// with an internal step rather than three stack screens — there's no reason
// to add three navigator entries and lose-your-place-on-back-swipe risk for
// what is really one linear picker. Reused as-is (not rebuilt) for onboarding —
// see the onDone/showSkip props above.
export default function ChooseSchoolScreen({ onDone, showSkip, title, subtitle }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const finish = onDone ?? (() => navigation.goBack());

  const [step, setStep] = useState<Step>('state');

  const [states, setStates] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<School[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSchoolStates()
      .then(setStates)
      .catch(() => setStates([]))
      .finally(() => setLoadingStates(false));
  }, []);

  const handlePickState = async (state: string) => {
    setSelectedState(state);
    setSelectedCity(null);
    setStep('city');
    setLoadingCities(true);
    try {
      setCities(await fetchSchoolCities(state));
    } catch {
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  };

  const runSearch = useCallback(
    async (state: string, city: string | null, term: string) => {
      setSearching(true);
      try {
        const data = await searchSchoolsDirectory({ state, city: city ?? undefined, query: term });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  const handlePickCity = (city: string | null) => {
    setSelectedCity(city);
    setStep('search');
    setQuery('');
    if (selectedState) runSearch(selectedState, city, '');
  };

  // Debounced re-search as the user types, once already on the search step.
  useEffect(() => {
    if (step !== 'search' || !selectedState) return;
    const timer = setTimeout(() => runSearch(selectedState, selectedCity, query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, step]);

  const handleSelectSchool = async (school: School) => {
    if (!user || savingId) return;
    setSavingId(school.id);
    try {
      await setMySchool(user.id, school.id);
      showToast(`School set to ${school.name}`);
      finish();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your school.';
      Alert.alert('Error', message);
    } finally {
      setSavingId(null);
    }
  };

  const handleBackStep = () => {
    if (step === 'search') {
      setStep('city');
    } else if (step === 'city') {
      setStep('state');
      setSelectedState(null);
    } else {
      finish();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackStep}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>{step === 'state' ? 'Back' : 'Change'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textMid} />
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{title ?? DEFAULT_TITLE}</Text>
        <Text style={styles.subtitle}>{subtitle ?? DEFAULT_SUBTITLE}</Text>
        {showSkip && (
          <TouchableOpacity onPress={finish} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
        {(selectedState || selectedCity) && (
          <View style={styles.breadcrumbRow}>
            {selectedState && <Text style={styles.breadcrumb}>{selectedState}</Text>}
            {selectedCity && (
              <>
                <Ionicons name="chevron-forward" size={12} color={colors.textLight} />
                <Text style={styles.breadcrumb}>{selectedCity}</Text>
              </>
            )}
          </View>
        )}
      </View>

      {step === 'state' &&
        (loadingStates ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={states}
            keyExtractor={(s) => s}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <EmptyState
                icon="school-outline"
                title="No states available yet"
                subtitle="The school directory hasn't been set up for your region yet — you can still type your school name on your Profile."
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => handlePickState(item)}>
                <Text style={styles.rowText}>{item}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            )}
          />
        ))}

      {step === 'city' &&
        (loadingCities ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={cities}
            keyExtractor={(c) => c}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <TouchableOpacity style={styles.row} onPress={() => handlePickCity(null)}>
                <Text style={styles.rowText}>Search all of {selectedState}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            }
            ListEmptyComponent={
              <EmptyState icon="location-outline" title="No areas listed" subtitle="Try searching the whole state instead." />
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => handlePickCity(item)}>
                <Text style={styles.rowText}>{item}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            )}
          />
        ))}

      {step === 'search' && (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search school name..."
              placeholderTextColor={colors.textLight}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>

          {searching ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <EmptyState
                  icon="school-outline"
                  title="No schools found"
                  subtitle="Not listed yet? You can still type your school name directly on your Profile."
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.schoolRow}
                  onPress={() => handleSelectSchool(item)}
                  disabled={savingId !== null}
                >
                  <View style={styles.schoolIcon}>
                    <Ionicons name="school-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.schoolText}>
                    <Text style={styles.schoolName}>{item.name}</Text>
                    {item.city ? <Text style={styles.schoolMeta}>{item.city}{item.state ? `, ${item.state}` : ''}</Text> : null}
                  </View>
                  {savingId === item.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    fontSize: fontSize.md,
  },
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
    lineHeight: 19,
  },
  skipButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  skipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  breadcrumb: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  rowText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.subtle,
  },
  schoolIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  schoolText: {
    flex: 1,
  },
  schoolName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  schoolMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
  },
});
