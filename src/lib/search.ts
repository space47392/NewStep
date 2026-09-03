import { supabase } from './supabase';
import { fetchPostsByIds } from './posts';
import { PersonSearchResult, SchoolSearchResult, Post, PostCategory } from '../types';

// websearch_to_tsquery/plainto_tsquery match whole lexemes, not prefixes — typing
// "Jo" wouldn't match "John" until the word was complete. Building a raw tsquery
// with the `:*` prefix operator per word gives proper type-ahead behavior instead.
// Exported so searchPosts() below reuses the exact same query-building logic —
// one definition of "how a partial search term becomes a tsquery," not two.
export function buildPrefixQuery(term: string): string | null {
  const words = term
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '')) // strip characters that would break tsquery syntax
    .filter(Boolean);

  if (words.length === 0) return null;
  return words.map((w) => `${w}:*`).join(' & ');
}

const PERSON_SEARCH_FIELDS = 'id, username, full_name, avatar_url, school_name, grade, interests';
// Fetch a wider candidate pool than we display, so client-side ranking has
// enough to work with before trimming to the final result size.
const CANDIDATE_POOL = 30;
const PEOPLE_RESULT_LIMIT = 20;

// Deterministic ranking tiers — no scoring/weights, just an ordered list of
// "how good is this match" buckets: exact username > username prefix > name
// match > matched only via school/interests.
function personMatchTier(person: PersonSearchResult, lowerTerm: string): number {
  const username = (person.username ?? '').toLowerCase();
  const fullName = (person.full_name ?? '').toLowerCase();

  if (username === lowerTerm) return 0;
  if (username.startsWith(lowerTerm)) return 1;
  if (fullName.startsWith(lowerTerm) || fullName.includes(lowerTerm)) return 2;
  return 3;
}

// `viewerSchoolName` is optional and only ever used as a same-tier tiebreaker
// (people from your own school sort first within an equal match quality) —
// it never changes WHICH results come back, only their order.
export async function searchUsers(term: string, viewerSchoolName?: string | null): Promise<PersonSearchResult[]> {
  const tsQuery = buildPrefixQuery(term);
  if (!tsQuery) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select(PERSON_SEARCH_FIELDS)
    .textSearch('search_text', tsQuery)
    .limit(CANDIDATE_POOL);

  if (error) throw error;

  const lowerTerm = term.trim().toLowerCase();
  return ((data ?? []) as PersonSearchResult[])
    .map((person) => ({
      person,
      tier: personMatchTier(person, lowerTerm),
      sameSchool: viewerSchoolName != null && person.school_name === viewerSchoolName,
    }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.sameSchool !== b.sameSchool) return a.sameSchool ? -1 : 1;
      return (a.person.full_name ?? '').localeCompare(b.person.full_name ?? '');
    })
    .slice(0, PEOPLE_RESULT_LIMIT)
    .map((r) => r.person);
}

// Ranks server-side by ts_rank (text relevance) then recency — see
// search_posts() in search_discovery_schema.sql. Returns real, fully-joined
// Post objects (via the existing POST_SELECT, through fetchPostsByIds) so
// this renders with the exact same PostPreviewCard as everywhere else.
export async function searchPosts(term: string, category?: PostCategory, limit = 20): Promise<Post[]> {
  const tsQuery = buildPrefixQuery(term);
  if (!tsQuery) return [];

  const { data, error } = await supabase.rpc('search_posts', {
    p_query: tsQuery,
    p_category: category ?? null,
    p_limit: limit,
  });
  if (error) throw error;

  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  return fetchPostsByIds(ids);
}

// Prefix match on school_name via search_schools_by_name() — a GROUP BY
// aggregate PostgREST's filter API can't express. Returns only a name + a
// count, never per-student data. Same free-text school_name limitation as
// everywhere else (Step 4/5/9) — "Sunny Hills School" and "Sunny Hills High
// School" are different rows here, not normalized into one.
export async function searchSchools(term: string, limit = 10): Promise<SchoolSearchResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase.rpc('search_schools_by_name', { p_term: trimmed, p_limit: limit });
  if (error) throw error;

  return ((data ?? []) as { school_name: string; student_count: number }[]).map((row) => ({
    schoolName: row.school_name,
    studentCount: row.student_count,
  }));
}
