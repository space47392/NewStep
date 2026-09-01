import { supabase } from './supabase';
import { LeaderboardEntry } from '../types';

// Only the columns the leaderboard actually displays — narrower than select('*'),
// so a future private-ish profile field doesn't silently start flowing into a
// public ranked list just because it exists on the table.
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, school_name, avatar_url, points')
    .order('points', { ascending: false });

  if (error) throw error;
  return (data ?? []) as LeaderboardEntry[];
}
