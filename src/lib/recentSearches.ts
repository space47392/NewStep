import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'recent_searches';
const MAX_RECENT = 10;

export async function getRecentSearches(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches();

  const existing = await getRecentSearches();
  const deduped = [trimmed, ...existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  return deduped;
}

export async function removeRecentSearch(term: string): Promise<string[]> {
  const existing = await getRecentSearches();
  const filtered = existing.filter((t) => t !== term);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
