import AsyncStorage from '@react-native-async-storage/async-storage';

// Which of this device's active stories the current user has already opened —
// purely a UI nicety (the seen/unseen ring on the story rail), not worth a
// database column or table. Mirrors newStudentPrefs.ts's per-user AsyncStorage
// pattern. Story ids are already fresh on every replace_story() call (see
// stories_schema.sql), so a replaced/expired story's old id simply never
// matches an active story again — nothing here needs a real expiry, only the
// light pruning below to keep the persisted list from growing forever.
function storageKey(userId: string): string {
  return `seen_story_ids:${userId}`;
}

export async function getSeenStoryIds(userId: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function markStorySeen(userId: string, storyId: string): Promise<void> {
  const seen = await getSeenStoryIds(userId);
  if (seen.has(storyId)) return;
  seen.add(storyId);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify([...seen]));
}

// Drops any stored id that isn't among the currently-active stories — an
// expired or replaced story's old id can never be seen again anyway, so
// there's no reason to keep it around.
export async function pruneSeenStoryIds(userId: string, activeStoryIds: string[]): Promise<void> {
  const seen = await getSeenStoryIds(userId);
  const activeSet = new Set(activeStoryIds);
  const pruned = [...seen].filter((id) => activeSet.has(id));
  if (pruned.length !== seen.size) {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(pruned));
  }
}
