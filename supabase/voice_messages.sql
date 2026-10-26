-- Voice messages in chat.
--
-- The recording is stored in the same PRIVATE 'chat-photos' bucket as chat
-- photos (chat_photos.sql), under the same {conversation_id}/{sender_id}/
-- folder, so the same storage policies decide who can upload, listen to or
-- delete it. Run chat_photos.sql first.

alter table public.messages add column if not exists audio_path text;
alter table public.messages add column if not exists audio_ms integer;

-- At most 2 minutes, and the file must sit in that conversation's folder,
-- under its sender.
alter table public.messages drop constraint if exists messages_audio_ms_range;
alter table public.messages add constraint messages_audio_ms_range
  check (audio_ms is null or (audio_ms between 0 and 125000)) not valid;

alter table public.messages drop constraint if exists messages_audio_path_owner;
alter table public.messages add constraint messages_audio_path_owner
  check (
    audio_path is null
    or audio_path like conversation_id::text || '/' || sender_id::text || '/%'
  ) not valid;

-- Chat-list preview for a voice (or photo) message with no text.
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message = case
        when coalesce(btrim(new.content), '') = '' and new.audio_path is not null then '🎤 Voice message'
        when coalesce(btrim(new.content), '') = '' and new.photo_path is not null then '📷 Photo'
        else new.content
      end,
      last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

-- Deleting a message also clears its voice recording.
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
end;
$$;
