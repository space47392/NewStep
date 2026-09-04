-- Fix for 42P17 "infinite recursion detected in policy for relation
-- messages", found in production logs. Root cause: message_replies_schema.sql
-- put a subquery against `messages` inside the messages INSERT policy's own
-- WITH CHECK — a policy on table T can't safely subquery T itself from
-- within its own USING/WITH CHECK, since evaluating that subquery requires
-- re-applying T's RLS, which requires evaluating the policy again.
--
-- Fix, same shape as guard_message_not_blocked() (users_blocked_security_fix.sql):
-- move the check out of the policy (a plain boolean expression, no
-- set_config available) and into a BEFORE INSERT trigger (a real function
-- body). A SECURITY DEFINER trigger function is not itself subject to the
-- table's RLS when it queries that table internally, so this sidesteps the
-- recursion entirely rather than working around it.

-- =====================================================================
-- 1. Restore the INSERT policy to exactly its pre-reply form — the same
-- two conditions from users_blocked_security_fix.sql, nothing about replies.
-- =====================================================================
drop policy "Participants can send messages in their conversations" on public.messages;

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  );

-- =====================================================================
-- 2. guard_message_reply_target() — the reply validation, now as a trigger.
-- Allows reply_to_message_id IS NULL (every normal message). When set,
-- verifies the referenced message exists AND belongs to the same
-- conversation as the message being inserted. A single generic exception
-- either way — never reveals whether a given message id exists, what
-- conversation it's in, or any of its content.
-- =====================================================================
create or replace function public.guard_message_reply_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to_message_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.messages m
    where m.id = new.reply_to_message_id
      and m.conversation_id = new.conversation_id
  ) then
    raise exception 'Invalid reply target.';
  end if;

  return new;
end;
$$;

create trigger guard_message_reply_target
  before insert on public.messages
  for each row execute function public.guard_message_reply_target();
