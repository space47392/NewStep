// Report review (supabase/moderation.sql). Pure and unit tested; the database
// calls are in moderationApi.ts.

export type ModerationKind = 'post' | 'comment' | 'story' | 'profile' | 'message' | 'wish' | 'lantern' | 'lantern_note' | 'tip';
export type ModerationAction = 'dismiss' | 'remove' | 'reviewed';

// Same list, same order as the SQL checks.
export const MODERATION_KINDS: { key: ModerationKind; label: string; emoji: string }[] = [
  { key: 'post', label: 'Post', emoji: '📝' },
  { key: 'comment', label: 'Comment', emoji: '💬' },
  { key: 'story', label: 'Story', emoji: '📷' },
  { key: 'profile', label: 'Profile', emoji: '👤' },
  { key: 'message', label: 'Message', emoji: '✉️' },
  { key: 'wish', label: 'Wish', emoji: '🌠' },
  { key: 'lantern', label: 'Lantern', emoji: '🏮' },
  { key: 'lantern_note', label: 'Lantern note', emoji: '💌' },
  { key: 'tip', label: 'School tip', emoji: '🎒' },
];

export function kindInfo(kind: string) {
  return MODERATION_KINDS.find((k) => k.key === kind) ?? { key: kind as ModerationKind, label: 'Report', emoji: '🚩' };
}

export type QueueItem = {
  kind: ModerationKind;
  target_id: string;
  preview: string | null;
  author_id: string | null;
  author_name: string | null;
  report_count: number;
  reasons: string[];
  last_reported: string;
};

// What a moderator can do with each kind. Accounts aren't removed from here.
export function actionsFor(kind: ModerationKind): ModerationAction[] {
  return kind === 'profile' ? ['dismiss', 'reviewed'] : ['dismiss', 'remove'];
}

export const ACTION_LABEL: Record<ModerationAction, string> = {
  dismiss: 'Looks fine',
  remove: 'Remove',
  reviewed: 'Mark reviewed',
};

// "harassment: said mean things" → "Harassment: said mean things".
export function reasonLabel(reason: string): string {
  return reason ? reason[0].toUpperCase() + reason.slice(1) : 'Reported';
}

export function isModeratorRole(role: string | null | undefined): boolean {
  return role === 'moderator' || role === 'admin';
}
