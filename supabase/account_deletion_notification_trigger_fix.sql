-- Step 52B — fixes the exact conflict Step 52's live test uncovered:
-- deleting an account whose id appears as `actor_id` on someone else's
-- notification made delete_my_account() fail with HTTP 400.
--
-- Root cause (confirmed against Supabase logs):
--   notifications.actor_id references public.profiles(id) on delete set null
--   (notifications_schema.sql) — when auth.users cascades down to profiles
--   and then to notifications, Postgres performs that SET NULL as a real
--   `UPDATE notifications SET actor_id = NULL WHERE actor_id = <deleted id>`.
--   That UPDATE fires the existing `guard_notification_update` BEFORE UPDATE
--   trigger, whose only job (notifications_schema.sql) is "reject any change
--   except read_at" — it has no way to tell "a legitimate FK cascade" apart
--   from "a client trying to rewrite this row," so it rejected the cascade
--   too, rolling back the whole deletion transaction.
--
-- Fix: CREATE OR REPLACE both functions below (the schema file itself is
-- untouched) —
--   1. guard_notification_update() gets one new, narrowly-scoped bypass
--      branch, checked BEFORE its existing reject-everything-but-read_at
--      logic (which is otherwise unchanged, byte-for-byte).
--   2. delete_my_account() sets the transaction-local flag that bypass
--      requires, immediately before the delete that triggers the cascade.
--
-- The existing `guard_notification_update` trigger itself (before update on
-- public.notifications) is NOT touched — CREATE OR REPLACE FUNCTION updates
-- the function body in place; the trigger keeps pointing at the same
-- function name and needs no re-creation. Idempotent: both objects are
-- plain CREATE OR REPLACE, safe to run more than once.

-- =====================================================================
-- 1. guard_notification_update() — same reject-everything-but-read_at body
-- as notifications_schema.sql, with one new bypass checked first.
-- =====================================================================
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Narrow bypass for account deletion's FK cascade only. ALL of the
  -- following must hold, not just the flag:
  --   - the transaction-local flag delete_my_account() sets is on (a client
  --     has no way to set this itself — nothing exposes set_config() to the
  --     client, same as every other newstep.allow_* guard flag already in
  --     this project);
  --   - actor_id is actually transitioning non-null -> null (the ONLY shape
  --     the actor_id FK's `on delete set null` can ever produce), never any
  --     other value;
  --   - every OTHER column is unchanged — belt-and-suspenders on top of the
  --     two conditions above, so even a hypothetical future caller that sets
  --     the flag for some unrelated reason still can't smuggle a change to
  --     type/post_id/conversation_id/achievement_id/user_id/created_at
  --     through this branch.
  -- If all of this holds, the update is allowed and none of the existing
  -- protected-column logic below even runs.
  if coalesce(current_setting('newstep.allow_notification_actor_clear', true), 'off') = 'on'
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

  -- Unchanged from notifications_schema.sql: reject any change except
  -- read_at for every other case (ordinary client updates included).
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

-- =====================================================================
-- 2. delete_my_account() — identical to account_deletion_schema.sql except
-- for the one new `perform set_config(...)` line immediately before the
-- delete. Everything else (SECURITY DEFINER, the signed-in check, deleting
-- exactly `auth.uid()`'s own row, no exception handler / full-transaction
-- rollback on any other error) is unchanged.
-- =====================================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to delete your account.';
  end if;

  -- Local to THIS transaction only (set_config's third argument, `true`) —
  -- automatically cleared the instant this transaction ends, whether it
  -- commits or rolls back, exactly like every other newstep.allow_* flag
  -- already used in this project (users_blocked(), create_notification(),
  -- award_achievements()). It can never leak into or affect any other
  -- request/session/transaction.
  perform set_config('newstep.allow_notification_actor_clear', 'on', true);

  delete from auth.users where id = v_uid;
end;
$$;
