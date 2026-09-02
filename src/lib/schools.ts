import { supabase } from './supabase';
import { SchoolMember } from '../types';

// head: true skips fetching any rows at all — just the count header — so this
// never pulls whole profile records just to display a number.
export async function fetchSchoolStudentCount(schoolName: string): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('school_name', schoolName);

  if (error) throw error;
  return count ?? 0;
}

// Only the fields appropriate to show for member discovery — no points,
// updated_at, or anything else profiles happens to carry. There's no email or
// other private field on this table to begin with, but this stays deliberately
// narrow rather than select('*') on principle.
export async function fetchSchoolMembers(schoolName: string, limit = 30): Promise<SchoolMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url, grade, interests')
    .eq('school_name', schoolName)
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SchoolMember[];
}
