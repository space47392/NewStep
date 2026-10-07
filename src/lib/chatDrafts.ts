import AsyncStorage from '@react-native-async-storage/async-storage';

// Unsent chat messages, kept per conversation so leaving a chat half-typed
// doesn't lose it. Namespaced per user like recentSearches.ts — a shared
// device must never show one account's drafts to the next.
function storageKey(userId: string): string {
  return `chat_drafts:${userId}`;
}

export async function getChatDrafts(userId: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function getChatDraft(userId: string, conversationId: string): Promise<string> {
  const drafts = await getChatDrafts(userId);
  return drafts[conversationId] ?? '';
}

// An empty/whitespace draft removes the entry instead of storing it.
export async function saveChatDraft(userId: string, conversationId: string, text: string): Promise<void> {
  try {
    const drafts = await getChatDrafts(userId);
    if (text.trim()) {
      drafts[conversationId] = text;
    } else {
      delete drafts[conversationId];
    }
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(drafts));
  } catch {
    // A lost draft is a small annoyance, never worth an error.
  }
}
