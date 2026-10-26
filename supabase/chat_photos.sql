-- Photos in chat.
--
-- 1. messages.photo_path — where the photo lives in the private 'chat-photos'
--    bucket: {conversation_id}/{sender_id}/{file}.jpg. A photo message may have
--    no text (content = '').
-- 2. A PRIVATE bucket. Unlike post/avatar/story photos, chat photos are only
--    for the two people in the conversation: the app shows them through
--    short-lived signed URLs, and these storage policies decide who may
--    upload, view or delete.
-- 3. The chat-list preview says "📷 Photo" for a photo with no text, and a
--    deleted message drops its photo too.

-- 1. The column ------------------------------------------------------------
alter table public.messages add column if not exists photo_path text;

-- 2. The private bucket and who can use it --------------------------------
insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', false)
on conflict (id) do update set public = false;

-- Upload: only into a conversation you're in (and that still has both people),
-- and only into your own folder inside it.
drop policy if exists "Chat photos: participants can upload their own" on storage.objects;
create policy "Chat photos: participants can upload their own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and c.user1_id is not null
        and c.user2_id is not null
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- View: both people in the conversation.
drop policy if exists "Chat photos: participants can view" on storage.objects;
create policy "Chat photos: participants can view"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- Delete: only photos you sent.
drop policy if exists "Chat photos: senders can delete their own" on storage.objects;
create policy "Chat photos: senders can delete their own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-photos' and (storage.foldername(name))[2] = auth.uid()::text);

-- A message's photo must sit in that conversation's folder, under its sender.
alter table public.messages drop constraint if exists messages_photo_path_owner;
alter table public.messages add constraint messages_photo_path_owner
  check (
    photo_path is null
    or photo_path like conversation_id::text || '/' || sender_id::text || '/%'
  ) not valid;

-- 3. Previews and deletes ---------------------------------------------------
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message = case
        when coalesce(btrim(new.content), '') = '' and new.photo_path is not null then '📷 Photo'
        else new.content
      end,
      last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

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

  -- The photo file itself is removed by the app (storage policy above).
  update public.messages
  set content = '', photo_path = null, deleted_at = now()
  where id = p_message_id;
end;
$$;
