-- Fixes a gap found during live verification of safety_moderation_schema.sql:
-- users_blocked() had no protection of its own, so any client could call it
-- directly via supabase.rpc('users_blocked', {...}) and learn whether a block
-- exists between two arbitrary user ids — a narrow but real instance of
-- exactly what "don't expose block status" was meant to prevent.
--
-- users_blocked() is called from three places, one of which (the messages
-- INSERT policy) is a plain RLS boolean expression, not a function body — it
-- can't run `perform set_config(...)` before calling anything. So the fix
-- moves that one call out of the policy and into a new BEFORE INSERT trigger
-- (a real function body, like the other two callers), and reverts the policy
-- itself to exactly its pre-Step-7 form.

-- =====================================================================
-- 1. Guard users_blocked() — same transaction-local-flag pattern already
-- used for award_achievements() and create_notification() (Step 3's
-- postmortem: REVOKE broke a legitimate internal SECURITY DEFINER caller in
-- this environment, so that approach is deliberately not used here either).
-- Needs `language plpgsql` instead of the original `language sql` — a plain
-- SQL function is a single expression and can't contain the IF/RAISE guard.
-- =====================================================================
create or replace function public.users_blocked(user_a uuid, user_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_users_blocked_check', true), 'off') <> 'on' then
    raise exception 'users_blocked() cannot be called directly.';
  end if;

  return exists (
    select 1 from public.blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
end;
$$;

-- =====================================================================
-- 2. get_or_create_conversation() — unchanged behavior, one line added: set
-- the flag immediately before the existing users_blocked() call.
-- =====================================================================
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
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(auth.uid(), other_user_id) then
    raise exception 'Unable to start a conversation with this user.';
  end if;

  select id into conv_id from public.conversations where user1_id = uid1 and user2_id = uid2;

  if conv_id is null then
    insert into public.conversations (user1_id, user2_id)
    values (uid1, uid2)
    returning id into conv_id;
  end if;

  return conv_id;
end;
$$;

-- =====================================================================
-- 3. create_notification() — unchanged behavior, same flag set immediately
-- before the existing users_blocked() call (only reached when p_actor_id is
-- not null, same as before).
-- =====================================================================
create or replace function public.create_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_post_id uuid,
  p_conversation_id uuid,
  p_achievement_id uuid,
  p_push_title text,
  p_push_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_notification_create', true), 'off') <> 'on' then
    raise exception 'create_notification() cannot be called directly.';
  end if;

  if p_actor_id is not null and p_actor_id = p_user_id then
    return;
  end if;

  if p_actor_id is not null then
    perform set_config('newstep.allow_users_blocked_check', 'on', true);
    if public.users_blocked(p_user_id, p_actor_id) then
      return;
    end if;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, conversation_id, achievement_id)
  values (p_user_id, p_actor_id, p_type, p_post_id, p_conversation_id, p_achievement_id);

  perform public.send_push_notification(p_user_id, p_push_title, p_push_body, jsonb_build_object('type', p_type));
end;
$$;

-- =====================================================================
-- 4. messages INSERT policy — reverted to EXACTLY its pre-Step-7 form (the
-- original from chat_schema.sql). The users_blocked() call that
-- safety_moderation_schema.sql added here is removed; the same protection
-- now comes from the trigger below instead.
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
-- 5. New: the block-check for messages moves here — a real function body,
-- so it can set the guard flag itself before calling users_blocked(), then
-- abort the insert (raise) if the two participants are blocked. Runs BEFORE
-- the row is inserted; the exception aborts the statement regardless of
-- trigger/RLS evaluation order.
-- =====================================================================
create or replace function public.guard_message_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user1 uuid;
  v_user2 uuid;
begin
  select user1_id, user2_id into v_user1, v_user2
  from public.conversations
  where id = new.conversation_id;

  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(v_user1, v_user2) then
    raise exception 'Unable to send messages in this conversation.';
  end if;

  return new;
end;
$$;

create trigger guard_message_not_blocked
  before insert on public.messages
  for each row execute function public.guard_message_not_blocked();
