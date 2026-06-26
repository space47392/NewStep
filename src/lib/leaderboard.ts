import { supabase } from './supabase';
import { Profile } from '../types';

export async function fetchLeaderboard(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('points', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Profile[];
}
