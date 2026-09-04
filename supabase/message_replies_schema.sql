-- Chat UX Upgrade — Reply to message. One minimal, nullable, self-referencing
-- column — no new table. The reply preview (sender + snippet of the original
-- message) is resolved entirely client-side from messages already loaded in
-- the conversation; nothing about the original message's content is ever
-- duplicated into the database.

alter table public.messages
  add column reply_to_message_id uuid references public.messages (id) on delete set null;

-- Drop + recreate the SAME single INSERT policy (not a second one) — same
-- precedent as safety_moderation_schema.sql's block-check addition to this
-- exact policy. One condition added: if reply_to_message_id is supplied, it
-- must point to a message in the SAME conversation being posted to — stops a
-- client setting it to an arbitrary message id from a conversation they
-- aren't even part of. (This is about referential sanity, not confidentiality:
-- messages' own SELECT policy already prevents any content from leaking
-- either way.)
drop policy "Participants can send messages in their conversations" on public.messages;

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
    and (
      reply_to_message_id is null
      or exists (
        select 1 from public.messages m
        where m.id = reply_to_message_id and m.conversation_id = conversation_id
      )
    )
  );
