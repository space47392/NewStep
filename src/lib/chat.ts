import { supabase } from './supabase';
import { ChatProfile, Conversation, Message } from '../types';

// Always goes through this RPC rather than inserting directly, so user1_id/user2_id
// stay normalized (smaller UUID first) and a pair can never be created twice.
export async function getOrCreateConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    other_user_id: otherUserId,
  });

  if (error) throw error;
  return data as string;
}

type ConversationRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  user1: ChatProfile;
  user2: ChatProfile;
};

export async function fetchConversations(currentUserId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `
      id,
      user1_id,
      user2_id,
      last_message,
      last_message_at,
      created_at,
      user1:profiles!conversations_user1_id_fkey ( id, full_name, avatar_url ),
      user2:profiles!conversations_user2_id_fkey ( id, full_name, avatar_url )
    `
    )
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ConversationRow[];
  const unreadCounts = await fetchUnreadCounts(rows.map((r) => r.id), currentUserId);

  return rows.map((row) => ({
    id: row.id,
    last_message: row.last_message,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    otherUser: row.user1_id === currentUserId ? row.user2 : row.user1,
    unreadCount: unreadCounts[row.id] ?? 0,
  }));
}

// PostgREST has no GROUP BY through the table API, so we pull the (lightweight)
// unread rows and tally counts per conversation client-side.
async function fetchUnreadCounts(
  conversationIds: string[],
  currentUserId: string
): Promise<Record<string, number>> {
  if (conversationIds.length === 0) return {};

  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', conversationIds)
    .is('read_at', null)
    .neq('sender_id', currentUserId);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
  }
  return counts;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
}): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    sender_id: params.senderId,
    content: params.content,
  });

  if (error) throw error;
}

export async function markMessagesAsRead(conversationId: string, currentUserId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', currentUserId)
    .is('read_at', null);

  if (error) throw error;
}

// Goes through the edit_message() RPC rather than a plain client-side update —
// see messages_edit_delete.sql for why a second RLS policy isn't safe here.
export async function editMessage(messageId: string, content: string): Promise<void> {
  const { error } = await supabase.rpc('edit_message', { p_message_id: messageId, p_content: content });
  if (error) throw error;
}

// Soft delete — clears content and sets deleted_at server-side so the row
// survives as a tombstone instead of disappearing.
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_message', { p_message_id: messageId });
  if (error) throw error;
}

export type MessageChangeEvent = { type: 'insert' | 'update'; message: Message };

export function subscribeToMessages(conversationId: string, onChange: (event: MessageChangeEvent) => void) {
  // Unique per subscriber, not just per conversation — see the comment in
  // likes.ts's subscribeToLikes for why a shared topic name can collide.
  const channel = supabase
    .channel(`messages:${conversationId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        onChange({ type: 'insert', message: payload.new as Message });
      }
    )
    .on(
      // Edits, deletes, AND read-receipt updates all land here — the screen
      // just merges whichever fields changed by id, which is harmless for all three.
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        onChange({ type: 'update', message: payload.new as Message });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
