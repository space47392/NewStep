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
  // Null when that participant has since deleted their account
  // (conversations.user1_id/user2_id are ON DELETE SET NULL — Step 56).
  user1_id: string | null;
  user2_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  user1: ChatProfile | null;
  user2: ChatProfile | null;
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
    // Still correct as-is with a nullable user1_id/user2_id (Step 56): RLS
    // guarantees the caller is one of the two real participants, so
    // `row.user1_id === currentUserId` only ever matches the caller's OWN
    // (always-live) column — the other branch naturally yields whichever
    // side is the actual other participant, null included if they've since
    // deleted their account.
    otherUser: row.user1_id === currentUserId ? row.user2 : row.user1,
    unreadCount: unreadCounts[row.id] ?? 0,
  }));
}

// PostgREST has no GROUP BY through the table API, so we pull the (lightweight)
// unread rows and tally counts per conversation client-side.
//
// `.or('sender_id.neq.<id>,sender_id.is.null')` rather than plain
// `.neq('sender_id', currentUserId)` (Step 56D): SQL's `<>` evaluates to NULL
// — not true — when either side is NULL, so a plain `.neq()` silently
// excludes every message whose sender has since deleted their account
// (messages.sender_id is ON DELETE SET NULL — Step 56) from ever being
// counted as unread, no matter how long it sits with read_at still null. A
// message from a deleted sender is still a genuine incoming message for the
// surviving participant (it just isn't from *me*), so it belongs in this
// count exactly like any other unread incoming message — this only widens
// which of THIS conversation's own rows qualify as "not sent by me", never
// which conversations or which other users' data this query touches.
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
    .or(`sender_id.neq.${currentUserId},sender_id.is.null`);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
  }
  return counts;
}

// Newest-first under the hood (so LIMIT actually caps at "the most recent N"
// rather than "the first N ever sent"), then reversed back to chronological
// order for rendering — same index (conversation_id, created_at) that
// already existed powers both this and the "older" page below, no new index
// needed. Omit beforeCreatedAt for the initial/most-recent page; pass the
// oldest currently-loaded message's created_at to page further back.
export async function fetchMessages(
  conversationId: string,
  limit = 50,
  beforeCreatedAt?: string
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  // Optional — see message_replies_schema.sql. Only ever a message the
  // caller can already see (RLS re-validates it belongs to this same
  // conversation server-side, independent of whatever the client sends).
  replyToMessageId?: string;
}): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    conversation_id: params.conversationId,
    sender_id: params.senderId,
    content: params.content,
    reply_to_message_id: params.replyToMessageId ?? null,
  });

  if (error) throw error;
}

export async function markMessagesAsRead(conversationId: string, currentUserId: string): Promise<void> {
  // Same `.or()` widening as fetchUnreadCounts() above, for the same reason:
  // a plain `.neq('sender_id', currentUserId)` would never select a message
  // whose sender_id is NULL (a deleted account's old message), so it could
  // never actually be marked read here even though the RLS policy (Step 56B:
  // `sender_id is distinct from auth.uid()`) already permits it.
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .or(`sender_id.neq.${currentUserId},sender_id.is.null`)
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

// Ephemeral "is typing" signal — sent over a Realtime Broadcast channel rather than
// a table, so it never touches the database (no row to write, clean up, or have RLS on).
// Both participants join the SAME channel name (unlike the postgres_changes subscriptions
// above, which use a random suffix per subscriber) since broadcast only relays to peers
// already listening on that exact topic.
export function subscribeToTyping(conversationId: string, onTyping: (userId: string) => void) {
  const channel = supabase.channel(`typing:${conversationId}`, {
    config: { broadcast: { self: false } },
  });

  channel.on('broadcast', { event: 'typing' }, (payload) => {
    onTyping(payload.payload.userId as string);
  });
  channel.subscribe();

  return {
    sendTyping: (userId: string) => {
      channel.send({ type: 'broadcast', event: 'typing', payload: { userId } });
    },
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
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
