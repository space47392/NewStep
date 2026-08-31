-- Bug fix: on_message_created (chat_schema.sql) only keeps conversations.last_message
-- in sync on INSERT. Since messages_edit_delete.sql added edit_message()/delete_message()
-- (both UPDATE the row), editing or deleting the most recent message in a conversation
-- left the Chats list preview showing stale — or supposedly-deleted — content forever.
-- This adds the matching UPDATE-side trigger.
create or replace function public.handle_message_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only recompute the preview if this row is still the most recent message in
  -- the conversation — editing/deleting an older message shouldn't touch it.
  if new.created_at = (
    select max(created_at) from public.messages where conversation_id = new.conversation_id
  ) then
    update public.conversations
    set last_message = case when new.deleted_at is not null then 'Message deleted' else new.content end
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

-- Only fires when content or deleted_at actually changed, so plain "mark as read"
-- updates (which only touch read_at) don't trigger a needless recompute.
create trigger on_message_updated
  after update on public.messages
  for each row
  when (old.content is distinct from new.content or old.deleted_at is distinct from new.deleted_at)
  execute function public.handle_message_updated();
