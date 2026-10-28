import { supabase } from './supabase';
import type { MessageReaction } from './reactionSummary';

// Chat reactions: reads, the toggle RPC and live updates
// (supabase/message_reactions.sql). Summaries live in reactionSummary.ts.

export async function fetchReactions(conversationId: string): Promise<MessageReaction[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .eq('conversation_id', conversationId)
    .not('emoji', 'is', null);
  if (error) throw error;
  return (data ?? []) as MessageReaction[];
}

// Sets, switches or takes back my reaction. Resolves to what's on it now.
export async function reactToMessage(messageId: string, emoji: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('react_to_message', { p_message: messageId, p_emoji: emoji });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// Every change is an insert or an update (taking one back sets emoji to null),
// so both events carry the full row.
export function subscribeToReactions(conversationId: string, onChange: (reaction: MessageReaction) => void) {
  const filter = `conversation_id=eq.${conversationId}`;
  const handle = (payload: { new: unknown }) => {
    const row = payload.new as MessageReaction;
    onChange({ message_id: row.message_id, user_id: row.user_id, emoji: row.emoji });
  };
  // Unique per subscriber (see subscribeToLikes in likes.ts).
  const channel = supabase
    .channel(`reactions:${conversationId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter }, handle)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter }, handle)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
