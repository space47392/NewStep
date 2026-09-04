import { supabase } from './supabase';
import { SchoolMember, School } from '../types';

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

// Shared by fetchSchoolMembersByInterests and its school_id-based twin below —
// .overlaps() does the "at least one shared interest" filter server-side,
// then results are ranked by how many interests actually overlap, cheap
// client-side on an already-small, already-filtered result set.
function rankByInterestOverlap(members: SchoolMember[], interests: string[], limit: number): SchoolMember[] {
  const interestSet = new Set(interests.map((i) => i.toLowerCase()));
  return members
    .map((member) => ({
      member,
      overlapCount: member.interests.filter((i) => interestSet.has(i.toLowerCase())).length,
    }))
    .sort((a, b) => b.overlapCount - a.overlapCount)
    .slice(0, limit)
    .map((r) => r.member);
}

// "Students with similar interests" — same school, at least one interest in
// common, excluding yourself. Simple and deterministic on purpose (per the
// spec: no dating-style matching).
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
  return rankByInterestOverlap((data ?? []) as SchoolMember[], interests, limit);
}

// =============================================================================
// School directory (Step 15) — school_id-based versions of the four functions
// above, same shape and same narrow field selects, just filtered by the
// stable school_id instead of the free-text school_name. Kept as separate
// functions rather than an optional-param branch in the originals: callers
// (SchoolScreen, FeedScreen, SearchScreen) already know which one they have
// and choosing between two clearly-named functions is easier to follow than
// one function silently behaving two different ways.
// =============================================================================

export async function fetchSchoolStudentCountById(schoolId: string): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId);

  if (error) throw error;
  return count ?? 0;
}

export async function fetchSchoolMembersById(schoolId: string, limit = 30): Promise<SchoolMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url, grade, interests')
    .eq('school_id', schoolId)
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SchoolMember[];
}

export async function fetchSchoolMembersByGradeById(
  schoolId: string,
  grade: string,
  excludeUserId: string,
  limit = 10
): Promise<SchoolMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(SCHOOL_MEMBER_FIELDS)
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .neq('id', excludeUserId)
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SchoolMember[];
}

export async function fetchSchoolMembersByInterestsById(
  schoolId: string,
  interests: string[],
  excludeUserId: string,
  limit = 10
): Promise<SchoolMember[]> {
  if (interests.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select(SCHOOL_MEMBER_FIELDS)
    .eq('school_id', schoolId)
    .neq('id', excludeUserId)
    .overlaps('interests', interests)
    .limit(limit * 3);

  if (error) throw error;
  return rankByInterestOverlap((data ?? []) as SchoolMember[], interests, limit);
}

// =============================================================================
// Directory browsing/search — powers ChooseSchoolScreen. The directory starts
// as a single small seeded region (see schools_seed_<region>.sql, not yet
// run), so plain client-side dedupe of state/city values is fine for now;
// this would need a real GROUP BY (a small SQL function, same idiom as
// search_schools_by_name()) if/when the directory grows to cover many states.
// =============================================================================

export async function fetchSchoolStates(): Promise<string[]> {
  const { data, error } = await supabase.from('schools').select('state').not('state', 'is', null);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.state as string))).sort();
}

export async function fetchSchoolCities(state: string): Promise<string[]> {
  const { data, error } = await supabase.from('schools').select('city').eq('state', state).not('city', 'is', null);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.city as string))).sort();
}

const SCHOOL_DIRECTORY_FIELDS = 'id, name, city, state, country, district';

// city is optional — omit it to search every school in the state. query is
// optional too — omit it to just browse everything in scope, e.g. right
// after picking a city.
export async function searchSchoolsDirectory(params: {
  state: string;
  city?: string;
  query?: string;
  limit?: number;
}): Promise<School[]> {
  let request = supabase.from('schools').select(SCHOOL_DIRECTORY_FIELDS).eq('state', params.state);
  if (params.city) request = request.eq('city', params.city);
  if (params.query && params.query.trim()) request = request.ilike('name', `${params.query.trim()}%`);

  const { data, error } = await request.order('name', { ascending: true }).limit(params.limit ?? 50);
  if (error) throw error;
  return (data ?? []) as School[];
}

export async function fetchSchoolById(schoolId: string): Promise<School | null> {
  const { data, error } = await supabase
    .from('schools')
    .select(SCHOOL_DIRECTORY_FIELDS)
    .eq('id', schoolId)
    .maybeSingle();

  if (error) throw error;
  return data as School | null;
}

// Self-reported, same as school_name always has been — this is a community
// label, never a claim that the student actually attends that school.
export async function setMySchool(userId: string, schoolId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ school_id: schoolId }).eq('id', userId);
  if (error) throw error;
}
