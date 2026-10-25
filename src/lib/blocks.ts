import { supabase } from './supabase';

// The list of users I've blocked. Used purely for client-side UX filtering
// (hiding their content from my own feed/search/school views) — it is NOT the
// security boundary that actually stops interactions; that's enforced
// server-side via users_blocked() inside get_or_create_conversation(), the
// messages INSERT policy, and create_notification() (see
// safety_moderation_schema.sql). This can't see who has blocked ME, by
// design — RLS only exposes rows where I'm the blocker.
export async function fetchBlockedUserIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.blocked_id as string));
}

export async function blockUser(params: { blockerId: string; blockedId: string }): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: params.blockerId, blocked_id: params.blockedId });
  // 23505 = unique_violation — already blocked; treat as a no-op success.
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(params: { blockerId: string; blockedId: string }): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', params.blockerId)
    .eq('blocked_id', params.blockedId);
  if (error) throw error;
}

export type BlockedAccount = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

// For Settings → Blocked accounts, newest first. Accounts deleted since are
// skipped — there's nobody left to unblock.
export async function fetchBlockedAccounts(userId: string): Promise<BlockedAccount[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('created_at, profile:profiles!blocks_blocked_id_fkey ( id, full_name, username, avatar_url )')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { profile: BlockedAccount | null }[])
    .map((row) => row.profile)
    .filter((p): p is BlockedAccount => p !== null);
}
