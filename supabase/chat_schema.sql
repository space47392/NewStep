-- 1. Conversations between exactly two users. user1_id/user2_id are always
--    stored in sorted order so a pair can never end up duplicated as (A,B) and (B,A).
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references public.profiles (id) on delete cascade,
  user2_id uuid not null references public.profiles (id) on delete cascade,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint different_users check (user1_id <> user2_id),
  constraint ordered_users check (user1_id < user2_id),
  constraint unique_pair unique (user1_id, user2_id)
);

alter table public.conversations enable row level security;

create policy "Participants can view their conversations"
  on public.conversations for select
  using (auth.uid() = user1_id or auth.uid() = user2_id);

-- No INSERT policy on purpose: conversations can only be created through this
-- function, which normalizes ordering before inserting (bypasses RLS via security definer).
create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv_id uuid;
  uid1 uuid := least(auth.uid(), other_user_id);
  uid2 uuid := greatest(auth.uid(), other_user_id);
begin
  select id into conv_id from public.conversations where user1_id = uid1 and user2_id = uid2;

  if conv_id is null then
    insert into public.conversations (user1_id, user2_id)
    values (uid1, uid2)
    returning id into conv_id;
  end if;

  return conv_id;
end;
$$;

-- 2. Messages within a conversation
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "Participants can view messages in their conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

create policy "Recipients can mark messages as read"
  on public.messages for update
  using (
    auth.uid() <> sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  )
  with check (auth.uid() <> sender_id);

-- 3. Keep each conversation's preview (for the chat list) in sync with the latest message
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message = new.content, last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- 4. Turn on Realtime for live messaging
alter publication supabase_realtime add table public.messages;
