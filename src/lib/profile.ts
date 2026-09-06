import { supabase } from './supabase';
import { Profile } from '../types';

export async function fetchProfileById(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (error) throw error;
  return data as Profile;
}

// A narrower single-column write than EditProfileScreen's full-profile
// upsert — used only by the onboarding "Choose Interests" step (Step 25),
// which touches nothing else about the profile. Same column, same RLS.
export async function setMyInterests(userId: string, interests: string[]): Promise<void> {
  const { error } = await supabase.from('profiles').update({ interests }).eq('id', userId);
  if (error) throw error;
}
