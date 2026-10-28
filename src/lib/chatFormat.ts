import type { Message } from '../types';
import { isSameDay } from './time';

// How a chat thread is laid out: which bubbles group together, where the day
// separators and "3 hours later" markers go, and which bubble shows the time.
// Pure, so it's unit tested (src/lib/__tests__/chatFormat.test.ts).

// 1–3 emoji and nothing else ("👋", "🎉🎉") are shown big and bubble-free,
// like a sticker.
let EMOJI_ONLY: RegExp | null = null;
try {
  EMOJI_ONLY = new RegExp('^(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|\\p{Emoji_Modifier})*\\s*){1,3}$', 'u');
} catch {
  // Engine without Unicode property escapes: never use the big style.
}

export function isEmojiOnly(text: string): boolean {
  return !!EMOJI_ONLY && EMOJI_ONLY.test(text.trim());
}

// A quiet "· 3 hours later ·" between two messages on the same day that are
// far apart, so a conversation picked back up doesn't read as one continuous
// back-and-forth.
const GAP_MARKER_MS = 60 * 60 * 1000;

export function formatGap(fromIso: string, toIso: string): string | null {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (ms < GAP_MARKER_MS) return null;
  const hours = Math.floor(ms / GAP_MARKER_MS);
  return hours === 1 ? '1 hour later' : `${hours} hours later`;
}

// Same calendar minute. A fixed comparison, so a run of messages never
// regroups just because time passed.
export function sameTimestampBucket(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);
}

// The one-line stand-in for a message: reply quotes, the chat list, etc.
export function messagePreview(m: Pick<Message, 'content' | 'deleted_at' | 'audio_path' | 'photo_path'>): string {
  if (m.deleted_at) return 'Original message deleted';
  if (m.content) return m.content;
  if (m.audio_path) return '🎤 Voice message';
  if (m.photo_path) return '📷 Photo';
  return '';
}

export type MessageLayout = {
  // "Today" / "Yesterday" / a date above this message.
  showDaySeparator: boolean;
  // "· 2 hours later ·" above this message (never together with a day separator).
  gapLabel: string | null;
  // First / last bubble of a run from the same sender on the same day.
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  // Only the last message of a same-minute run shows its time, whoever sent it.
  showTimestamp: boolean;
};

type Stamped = Pick<Message, 'sender_id' | 'created_at'>;

export function layoutMessage(prev: Stamped | undefined, item: Stamped, next: Stamped | undefined): MessageLayout {
  const showDaySeparator = !prev || !isSameDay(prev.created_at, item.created_at);
  const sameRun = (other: Stamped | undefined) =>
    !!other && other.sender_id === item.sender_id && isSameDay(other.created_at, item.created_at);
  return {
    showDaySeparator,
    gapLabel: !showDaySeparator && prev ? formatGap(prev.created_at, item.created_at) : null,
    isFirstInGroup: !sameRun(prev),
    isLastInGroup: !sameRun(next),
    showTimestamp: !next || !sameTimestampBucket(item.created_at, next.created_at),
  };
}
