-- 1. Track edits and soft-deletes on messages.
alter table public.messages
  add column edited_at timestamptz,
  add column deleted_at timestamptz;

-- 2. Edit/delete go through these functions rather than a second plain RLS
-- policy. messages already has an UPDATE policy ("Recipients can mark messages
-- as read") scoped to auth.uid() <> sender_id. Postgres combines multiple
-- permissive policies with OR across USING and WITH CHECK *independently* — so
-- adding a second policy with auth.uid() = sender_id would make the combined
-- WITH CHECK "auth.uid() <> sender_id OR auth.uid() = sender_id", which is
-- always true. That would let any participant edit anyone's message content,
-- not just their own. SECURITY DEFINER bypasses RLS entirely for these two
-- specific, narrowly-checked operations instead.
create or replace function public.edit_message(p_message_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.messages
    where id = p_message_id and sender_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'You can only edit your own messages.';
  end if;

  update public.messages
  set content = p_content, edited_at = now()
  where id = p_message_id;
end;
$$;

-- Soft delete: content is actually cleared (not just hidden by the client), and
-- deleted_at is set so the row survives as a tombstone for "You deleted this
-- message" instead of disappearing — per the requirement that the message
-- shouldn't vanish completely.
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

  update public.messages
  set content = '', deleted_at = now()
  where id = p_message_id;
end;
$$;
