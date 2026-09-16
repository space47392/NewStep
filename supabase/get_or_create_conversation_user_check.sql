-- Step 60, P2 #1 — get_or_create_conversation() currently trusts
-- `other_user_id` and only discovers it doesn't exist when the INSERT into
-- conversations hits the FK constraint, surfacing a raw Postgres
-- foreign-key-violation message to the client. Not reachable through any
-- legitimate UI today (UserProfileScreen already refuses to render a
-- "Message" button for a profile it couldn't load — see fetchProfileById()'s
-- .single() failing gracefully into "Profile not found"), but a client
-- calling this RPC directly with an arbitrary/deleted id gets an unpolished,
-- implementation-leaking error instead of the same kind of controlled
-- message every other RPC in this project already gives
-- (volunteer_to_help()'s 'Post not found.', thank_helper()'s equivalents).
--
-- Fix: one existence check, first, before anything else — same
-- CREATE OR REPLACE FUNCTION shape as the current definition
-- (users_blocked_security_fix.sql), with nothing else changed: SECURITY
-- DEFINER, the block check, the least/greatest normalization, and the
-- select-then-insert body are all byte-for-byte the same as before.
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
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'User not found.';
  end if;

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
