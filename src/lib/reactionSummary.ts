// Chat reactions (supabase/message_reactions.sql). Pure, so it's unit tested.

// Same list, same order as the database check.
export const REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🙏'] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

// One person's reaction on a message. emoji null = taken back.
export type MessageReaction = { message_id: string; user_id: string; emoji: string | null };

export type ReactionCount = { emoji: string; count: number; mine: boolean };

// The pills under a bubble: one per emoji, in the picker's order.
export function summarizeReactions(rows: MessageReaction[] | undefined, myUserId: string | undefined): ReactionCount[] {
  if (!rows?.length) return [];
  const byEmoji = new Map<string, ReactionCount>();
  for (const r of rows) {
    if (!r.emoji) continue;
    const c = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    c.count += 1;
    if (r.user_id === myUserId) c.mine = true;
    byEmoji.set(r.emoji, c);
  }
  const order = (e: string) => {
    const i = (REACTIONS as readonly string[]).indexOf(e);
    return i < 0 ? REACTIONS.length : i;
  };
  return [...byEmoji.values()].sort((a, b) => order(a.emoji) - order(b.emoji));
}

// Reactions grouped by message, keeping one row per (message, person):
// a newer row for the same person replaces the older one.
export function indexReactions(rows: MessageReaction[]): Record<string, MessageReaction[]> {
  const out: Record<string, MessageReaction[]> = {};
  for (const r of rows) {
    const list = (out[r.message_id] ??= []);
    const i = list.findIndex((x) => x.user_id === r.user_id);
    if (i >= 0) list[i] = r;
    else list.push(r);
  }
  return out;
}

// What my reaction becomes after tapping `emoji`: the same one takes it back.
export function nextReaction(current: string | null | undefined, emoji: string): string | null {
  return current === emoji ? null : emoji;
}
