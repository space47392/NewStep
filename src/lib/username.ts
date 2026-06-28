import { supabase } from './supabase';

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();

  if (error) throw error;
  return data === null;
}

export async function setMyUsername(userId: string, username: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ username }).eq('id', userId);

  if (error) {
    // 23505 = unique_violation — someone else claimed it in the gap between the
    // availability check and this submit. The DB constraint is the real source
    // of truth; the earlier check is just fast feedback.
    if (error.code === '23505') {
      throw new Error('That username was just taken — try another.');
    }
    throw error;
  }
}
