-- Message reactions: a quick ❤️ 😂 😮 😢 👏 🙏 on a chat message.
--
-- One reaction per person per message (tap another to switch, the same one
-- to take it back). Only the two people in the conversation can see or add
-- them.
--
-- Taking a reaction back sets emoji to null instead of deleting the row.
-- Supabase Realtime doesn't apply RLS to DELETE events, so a delete would be
-- broadcast to anyone subscribed to that conversation id. Inserts and updates
-- are checked against the select policy below.
--
-- Safe to run more than once. Run after voice_messages.sql (this replaces
-- delete_message so a deleted message also loses its reactions).

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Copied from the message, so Realtime can filter by conversation.
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  emoji text check (emoji is null or emoji in ('❤️', '😂', '😮', '😢', '👏', '🙏')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_conversation_idx on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

drop policy if exists "Participants can see reactions in their conversations" on public.message_reactions;
create policy "Participants can see reactions in their conversations"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );
-- No insert/update/delete policies: writes only go through react_to_message().

-- Set, switch or take back my reaction. Returns the emoji now on it (or null).
create or replace function public.react_to_message(p_message uuid, p_emoji text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.messages;
  v_conv public.conversations;
  v_other uuid;
  v_current text;
  v_next text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_emoji not in ('❤️', '😂', '😮', '😢', '👏', '🙏') then
    raise exception 'That reaction isn''t available.';
  end if;

  select * into v_msg from public.messages where id = p_message;
  select * into v_conv from public.conversations where id = v_msg.conversation_id;
  if v_msg.id is null or v_conv.id is null or auth.uid() not in (v_conv.user1_id, v_conv.user2_id) then
    raise exception 'Message not found.';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'That message was deleted.';
  end if;

  -- The other person left (deleted account) or one of you blocked the other.
  v_other := case when v_conv.user1_id = auth.uid() then v_conv.user2_id else v_conv.user1_id end;
  if v_other is null or exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = v_other)
       or (b.blocker_id = v_other and b.blocked_id = auth.uid())
  ) then
    raise exception 'You can''t react in this chat.';
  end if;

  select emoji into v_current from public.message_reactions where message_id = p_message and user_id = auth.uid();
  v_next := case when v_current is not distinct from p_emoji then null else p_emoji end;

  insert into public.message_reactions (message_id, user_id, conversation_id, emoji, updated_at)
  values (p_message, auth.uid(), v_msg.conversation_id, v_next, now())
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = excluded.updated_at;

  return v_next;
end;
$$;
revoke all on function public.react_to_message(uuid, text) from public, anon;
grant execute on function public.react_to_message(uuid, text) to authenticated;

-- Deleting a message also clears its reactions (same as voice_messages.sql,
-- plus the last statement).
create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.messages
    where id = p_message_id and sender_id = auth.uid()
  ) then
    raise exception 'You can only delete your own messages.';
  end if;

  -- The files themselves are removed by the app (storage policies).
  update public.messages
  set content = '', photo_path = null, audio_path = null, audio_ms = null, deleted_at = now()
  where id = p_message_id;

  update public.message_reactions set emoji = null, updated_at = now()
  where message_id = p_message_id and emoji is not null;
end;
$$;

-- Live updates in an open chat.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;
