import { supabase } from './supabase';

// Deletes the signed-in user's own account, permanently, via
// delete_my_account() (see account_deletion_schema.sql) — a SECURITY
// DEFINER function that deletes the caller's own auth.users row directly.
// That cascades to the profile and everything owned by it. There is no
// client-side "undo" — this is deliberately a single, irreversible call; the
// UI is responsible for confirming with the user before ever reaching this.
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}
