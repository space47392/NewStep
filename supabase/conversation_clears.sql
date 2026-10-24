-- "Delete chat" — removes a conversation from MY chat list only.
--
-- Nothing is actually deleted: the other person keeps their full history.
-- We just remember when I cleared it. Messages from before that moment are
-- hidden from me, and the chat stays off my list until a new message arrives
-- (then it comes back, starting fresh — like Instagram / KakaoTalk).

create table if not exists public.conversation_clears (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.conversation_clears enable row level security;

drop policy if exists "Users can view their own chat clears" on public.conversation_clears;
create policy "Users can view their own chat clears"
  on public.conversation_clears for select
  using (auth.uid() = user_id);

-- No insert/update policies: clears are written only through this function,
-- which checks that the caller is actually in the conversation.
create or replace function public.clear_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
  ) then
    raise exception 'Conversation not found';
  end if;

  insert into public.conversation_clears (user_id, conversation_id, cleared_at)
  values (auth.uid(), p_conversation_id, now())
  on conflict (user_id, conversation_id) do update set cleared_at = excluded.cleared_at;

  -- Whatever was unread in it no longer counts toward my badges.
  update public.messages m
  set read_at = now()
  where m.conversation_id = p_conversation_id
    and m.read_at is null
    and (m.sender_id is null or m.sender_id <> auth.uid());
end;
$$;

revoke all on function public.clear_conversation(uuid) from public, anon;
grant execute on function public.clear_conversation(uuid) to authenticated;
