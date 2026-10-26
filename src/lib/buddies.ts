import { supabase } from './supabase';

// Buddies (buddies.sql): a classmate who walks a new student through their
// first weeks. All writes are RPCs that enforce the rules server-side.

export type BuddyPerson = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  grade: string | null;
  interests: string[] | null;
};

export type BuddySuggestion = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  grade: string | null;
  interests: string[];
  intro: string | null;
  shared_interests: string[];
  helped_count: number;
};

export type BuddyPair = {
  id: string;
  newcomer_id: string;
  buddy_id: string;
  status: 'asked' | 'active' | 'declined' | 'ended';
  message: string | null;
  created_at: string;
  responded_at: string | null;
  newcomer: BuddyPerson | null;
  buddy: BuddyPerson | null;
};

export type BuddyState = {
  // My intro if I've said I'm happy to be a buddy, else null.
  volunteer: { intro: string | null } | null;
  // My own ask (waiting or accepted), as the student looking for a buddy.
  mine: BuddyPair | null;
  // The most recent ask someone said "not right now" to, if it's fresh.
  recentlyDeclined: BuddyPair | null;
  // Students who asked me, and students I'm a buddy for.
  incoming: BuddyPair[];
  helping: BuddyPair[];
};

const PERSON = 'id, full_name, avatar_url, grade, interests';

export async function fetchBuddyState(userId: string): Promise<BuddyState> {
  const [{ data: vol }, { data: pairs, error }] = await Promise.all([
    supabase.from('buddy_volunteers').select('intro').eq('user_id', userId).maybeSingle(),
    supabase
      .from('buddy_pairs')
      .select(
        `id, newcomer_id, buddy_id, status, message, created_at, responded_at,
         newcomer:profiles!buddy_pairs_newcomer_id_fkey ( ${PERSON} ),
         buddy:profiles!buddy_pairs_buddy_id_fkey ( ${PERSON} )`
      )
      .order('created_at', { ascending: false })
      .limit(40),
  ]);
  if (error) throw error;
  const rows = (pairs ?? []) as unknown as BuddyPair[];
  const asNewcomer = rows.filter((p) => p.newcomer_id === userId);
  const mine = asNewcomer.find((p) => p.status === 'asked' || p.status === 'active') ?? null;
  const latest = asNewcomer[0];
  const recentlyDeclined =
    !mine && latest?.status === 'declined' && Date.now() - Date.parse(latest.responded_at ?? latest.created_at) < 3 * 86400000 ? latest : null;
  return {
    volunteer: vol ? { intro: (vol as { intro: string | null }).intro } : null,
    mine,
    recentlyDeclined,
    incoming: rows.filter((p) => p.buddy_id === userId && p.status === 'asked'),
    helping: rows.filter((p) => p.buddy_id === userId && p.status === 'active'),
  };
}

export async function suggestBuddies(): Promise<BuddySuggestion[]> {
  const { data, error } = await supabase.rpc('suggest_buddies');
  if (error) throw error;
  return ((data ?? []) as BuddySuggestion[]).map((s) => ({ ...s, helped_count: Number(s.helped_count ?? 0) }));
}

export async function setBuddyVolunteer(on: boolean, intro?: string): Promise<void> {
  const { error } = await supabase.rpc('set_buddy_volunteer', { p_on: on, p_intro: intro ?? null });
  if (error) throw error;
}

export async function askBuddy(buddyId: string, message?: string): Promise<void> {
  const { error } = await supabase.rpc('ask_buddy', { p_buddy: buddyId, p_message: message ?? null });
  if (error) throw error;
}

export async function respondBuddy(pairId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_buddy', { p_pair: pairId, p_accept: accept });
  if (error) throw error;
}

export async function endBuddy(pairId: string): Promise<void> {
  const { error } = await supabase.rpc('end_buddy', { p_pair: pairId });
  if (error) throw error;
}
