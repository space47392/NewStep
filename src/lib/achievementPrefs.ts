import AsyncStorage from '@react-native-async-storage/async-storage';

// Which earned achievements this device has already celebrated with the
// unlock popup — purely a UI nicety, so it lives on-device like
// storyPrefs.ts/newStudentPrefs.ts. Keyed per-user so a shared device never
// carries one account's "already seen" over to another. Worst case (cleared
// storage / new phone) is seeing a celebration again, never missing data.
function storageKey(userId: string): string {
  return `celebrated_achievement_ids:${userId}`;
}

export async function getCelebratedAchievementIds(userId: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function markAchievementCelebrated(userId: string, achievementId: string): Promise<void> {
  const seen = await getCelebratedAchievementIds(userId);
  if (seen.has(achievementId)) return;
  seen.add(achievementId);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify([...seen]));
}
