import { supabase } from './supabase';
import { Profile } from '../types';

// websearch_to_tsquery/plainto_tsquery match whole lexemes, not prefixes — typing
// "Jo" wouldn't match "John" until the word was complete. Building a raw tsquery
// with the `:*` prefix operator per word gives proper type-ahead behavior instead.
function buildPrefixQuery(term: string): string | null {
  const words = term
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '')) // strip characters that would break tsquery syntax
    .filter(Boolean);

  if (words.length === 0) return null;
  return words.map((w) => `${w}:*`).join(' & ');
}

export async function searchUsers(term: string): Promise<Profile[]> {
  const tsQuery = buildPrefixQuery(term);
  if (!tsQuery) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .textSearch('search_text', tsQuery)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as Profile[];
}
