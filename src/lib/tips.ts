import { supabase } from './supabase';

// School guide (school_tips.sql): tips classmates share about their school.

export type TipCategory = 'around' | 'food' | 'clubs' | 'classes' | 'people' | 'other';

export const TIP_CATEGORIES: { key: TipCategory; label: string; emoji: string; starter: string }[] = [
  { key: 'around', label: 'Getting around', emoji: '🗺️', starter: 'The fastest way to get to …' },
  { key: 'food', label: 'Food & lunch', emoji: '🍱', starter: 'The best place to eat lunch is …' },
  { key: 'clubs', label: 'Clubs', emoji: '🎨', starter: 'If you like …, join …' },
  { key: 'classes', label: 'Classes', emoji: '📚', starter: 'For … class, it really helps to …' },
  { key: 'people', label: 'Making friends', emoji: '👋', starter: 'An easy way to meet people is …' },
  { key: 'other', label: 'Everything else', emoji: '✨', starter: 'I wish someone told me …' },
];

export function tipCategory(key: string) {
  return TIP_CATEGORIES.find((c) => c.key === key) ?? TIP_CATEGORIES[TIP_CATEGORIES.length - 1];
}

export type SchoolTip = {
  id: string;
  author_id: string | null;
  category: TipCategory;
  title: string;
  body: string | null;
  helpful_count: number;
  created_at: string;
  author: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export async function fetchSchoolTips(userId: string): Promise<{ tips: SchoolTip[]; helped: Set<string> }> {
  const [{ data, error }, { data: marks }] = await Promise.all([
    supabase
      .from('school_tips')
      .select('id, author_id, category, title, body, helpful_count, created_at, author:profiles!school_tips_author_id_fkey ( id, full_name, avatar_url )')
      .order('helpful_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('school_tip_helpful').select('tip_id').eq('user_id', userId),
  ]);
  if (error) throw error;
  return {
    tips: (data ?? []) as unknown as SchoolTip[],
    helped: new Set((marks ?? []).map((m) => (m as { tip_id: string }).tip_id)),
  };
}

export async function addSchoolTip(category: TipCategory, title: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('add_school_tip', { p_category: category, p_title: title.trim(), p_body: body.trim() || null });
  if (error) throw error;
}

export async function deleteSchoolTip(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_school_tip', { p_tip: id });
  if (error) throw error;
}

export async function toggleTipHelpful(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('toggle_school_tip_helpful', { p_tip: id });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function reportSchoolTip(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('report_school_tip', { p_tip: id, p_reason: reason ?? null });
  if (error) throw error;
}
