import { supabase } from './supabase';
import { Profile } from '../types';

export async function fetchProfileById(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (error) throw error;
  return data as Profile;
}
