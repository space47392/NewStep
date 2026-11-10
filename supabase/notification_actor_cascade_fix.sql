-- Deleting an account from the Supabase dashboard (Authentication > Users)
-- failed with "Database error deleting user".
--
-- Why: notifications.actor_id is `on delete set null`, so deleting someone
-- makes Postgres run UPDATE notifications SET actor_id = NULL on every
-- notification they caused. guard_notification_update() rejects any change
-- except read_at. account_deletion_notification_trigger_fix.sql let this
-- through only when delete_my_account() sets a flag first, so the in-app
-- "Delete account" worked but the dashboard (and any other admin delete)
-- did not.
--
-- Fix: also allow the change when it comes from inside another trigger
-- (pg_trigger_depth() > 1). Foreign-key cascades run that way; a client's
-- own UPDATE through the API is always depth 1, so it is still limited to
-- read_at. The change must still be exactly "actor_id becomes null, nothing
-- else changes". The old flag keeps working too.
--
-- Run after calls.sql. Safe to run more than once.

create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The person who caused this notification was deleted: the only change
  -- is actor_id becoming null, and nothing else moves.
  if (pg_trigger_depth() > 1
      or coalesce(current_setting('newstep.allow_notification_actor_clear', true), 'off') = 'on')
     and old.actor_id is not null
     and new.actor_id is null
     and new.user_id is not distinct from old.user_id
     and new.type is not distinct from old.type
     and new.post_id is not distinct from old.post_id
     and new.conversation_id is not distinct from old.conversation_id
     and new.achievement_id is not distinct from old.achievement_id
     and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  -- Everything else (a client's own update included): only read_at may change.
  if new.user_id is distinct from old.user_id
     or new.actor_id is distinct from old.actor_id
     or new.type is distinct from old.type
     or new.post_id is distinct from old.post_id
     or new.conversation_id is distinct from old.conversation_id
     or new.achievement_id is distinct from old.achievement_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only read_at can be changed on a notification.';
  end if;

  return new;
end;
$$;

-- A trigger function: nobody calls it directly.
revoke all on function public.guard_notification_update() from public, anon, authenticated;
