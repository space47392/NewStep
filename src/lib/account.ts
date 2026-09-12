import { supabase } from './supabase';
import { cleanupAccountStorage } from './accountStorage';
import { clearRecentSearches } from './recentSearches';

// Deletes the signed-in user's own account, permanently, via
// delete_my_account() (see account_deletion_schema.sql) — a SECURITY
// DEFINER function that deletes the caller's own auth.users row directly.
// That cascades to the profile and everything owned by it. There is no
// client-side "undo" — this is deliberately a single, irreversible call; the
// UI is responsible for confirming with the user before ever reaching this.
//
// Order matters (Step 52): Storage cleanup happens first, while `userId` is
// still a signed-in session — every bucket's DELETE policy checks
// auth.uid() against the object's own folder, so this can't run after
// auth.users is gone. cleanupAccountStorage() throws on any failure rather
// than swallowing it, and that's deliberate: if it throws, this function
// re-throws WITHOUT ever calling the deletion RPC, so the account (and
// everything in it) is left fully intact for a retry — never a state where
// the account is gone but owned files definitely aren't. Only once storage
// cleanup has actually succeeded does this proceed to the real, irreversible
// deletion; the local-only recent-search cache is cleared last, best-effort,
// since it's a device-local convenience with no correctness stakes either way.
export async function deleteMyAccount(userId: string): Promise<void> {
  await cleanupAccountStorage(userId);

  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;

  await clearRecentSearches(userId).catch(() => {});
}
