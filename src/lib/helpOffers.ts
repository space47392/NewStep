import { supabase } from './supabase';

// Help offers (supabase/help_offers.sql): several classmates can offer to
// help with a Need Help post; the person who asked chooses one.

export type HelpOffer = {
  helper_id: string;
  full_name: string | null;
  avatar_url: string | null;
  grade: string | null;
  message: string | null;
  created_at: string;
  // How many requests this person has helped finish before.
  helped_count: number;
  mine: boolean;
};

export const OFFER_MESSAGE_MAX = 140;

export async function offerHelp(postId: string, message?: string): Promise<void> {
  const { error } = await supabase.rpc('volunteer_to_help', {
    p_post_id: postId,
    p_message: message?.trim() || null,
  });
  if (error) throw error;
}

export async function withdrawHelpOffer(postId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_help_offer', { p_post_id: postId });
  if (error) throw error;
}

export async function chooseHelper(postId: string, helperId: string): Promise<void> {
  const { error } = await supabase.rpc('choose_helper', { p_post_id: postId, p_helper_id: helperId });
  if (error) throw error;
}

// The author gets every offer; anyone else only their own.
export async function fetchHelpOffers(postId: string): Promise<HelpOffer[]> {
  const { data, error } = await supabase.rpc('fetch_help_offers', { p_post_id: postId });
  if (error) throw error;
  return (data ?? []) as HelpOffer[];
}

export async function fetchMyOfferPostIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('my_help_offer_post_ids');
  if (error) throw error;
  return new Set(((data ?? []) as unknown[]).map((r) => (typeof r === 'string' ? r : (r as { my_help_offer_post_ids: string }).my_help_offer_post_ids)));
}
