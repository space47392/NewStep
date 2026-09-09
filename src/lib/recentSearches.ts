import AsyncStorage from '@react-native-async-storage/async-storage';

// Namespaced per-user, same pattern as storyPrefs.ts/newStudentPrefs.ts — a
// shared/reused device must never show one account's search history to the
// next one that logs in (Step 40). Any pre-existing global 'recent_searches'
// entry (from before this namespacing existed) is simply orphaned, never
// migrated — not worth the risk of attributing an unknown previous account's
// history to whoever happens to log in next.
function storageKey(userId: string): string {
  return `recent_searches:${userId}`;
}

const MAX_RECENT = 10;

export async function getRecentSearches(userId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(userId: string, term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches(userId);

  const existing = await getRecentSearches(userId);
  const deduped = [trimmed, ...existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT
  );
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(deduped));
  return deduped;
}

export async function removeRecentSearch(userId: string, term: string): Promise<string[]> {
  const existing = await getRecentSearches(userId);
  const filtered = existing.filter((t) => t !== term);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(filtered));
  return filtered;
}

export async function clearRecentSearches(userId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(userId));
}
