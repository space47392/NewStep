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

const SCHOOL_MEMBER_FIELDS = 'id, full_name, username, avatar_url, grade, interests';

// "Students in your grade" — same school, same grade, excluding yourself.
// Deterministic (no ranking/scoring), matching the same narrow field select as
// fetchSchoolMembers — never anything beyond avatar/name/username/grade/interests.
export async function fetchSchoolMembersByGrade(
  schoolName: string,
  grade: string,
  excludeUserId: string,
  limit = 10
): Promise<SchoolMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(SCHOOL_MEMBER_FIELDS)
    .eq('school_name', schoolName)
    .eq('grade', grade)
    .neq('id', excludeUserId)
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SchoolMember[];
}

// "Students with similar interests" — same school, at least one interest in
// common, excluding yourself. Simple and deterministic on purpose (per the
// spec: no dating-style matching): .overlaps() does the "at least one shared
// interest" filter server-side, then results are ranked by how many interests
// actually overlap — cheap client-side on an already-small, already-filtered
// result set, not worth a database function for this.
export async function fetchSchoolMembersByInterests(
  schoolName: string,
  interests: string[],
  excludeUserId: string,
  limit = 10
): Promise<SchoolMember[]> {
  if (interests.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select(SCHOOL_MEMBER_FIELDS)
    .eq('school_name', schoolName)
    .neq('id', excludeUserId)
    .overlaps('interests', interests)
    .limit(limit * 3); // a slightly wider pool to rank by overlap before trimming to `limit`

  if (error) throw error;

  const interestSet = new Set(interests.map((i) => i.toLowerCase()));
  const ranked = ((data ?? []) as SchoolMember[])
    .map((member) => ({
      member,
      overlapCount: member.interests.filter((i) => interestSet.has(i.toLowerCase())).length,
    }))
    .sort((a, b) => b.overlapCount - a.overlapCount)
    .slice(0, limit)
    .map((r) => r.member);

  return ranked;
}
