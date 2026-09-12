-- Step 50 P1 #1 — close the one interaction surface that `users_blocked()`
-- protects everywhere else (follows, messages, story waves, notifications)
-- but never protected here: likes and comments. Before this, a blocked
-- relationship only suppressed the NOTIFICATION about a like/comment — the
-- like/comment itself was still fully created and visible. This migration
-- adds exactly two new BEFORE INSERT trigger functions, one per table, and
-- their triggers. No existing table, column, RLS policy, or trigger is
-- touched or replaced.
--
-- Pattern reused as-is from guard_follow_not_blocked() (follows_schema.sql)
-- and guard_message_not_blocked() (users_blocked_security_fix.sql):
--   - BEFORE INSERT trigger, raises a generic exception to abort the INSERT
--     entirely when blocked — never reveals *why* (no distinguishing wording
--     for "you blocked them" vs "they blocked you").
--   - `perform set_config('newstep.allow_users_blocked_check', 'on', true)`
--     immediately before calling users_blocked() — required because
--     users_blocked() (users_blocked_security_fix.sql) refuses to run at all
--     unless this session-local flag is set first; it's what stops a client
--     from calling users_blocked() directly to probe block status.
--   - The post's real author_id is always looked up fresh from `public.posts`
--     inside the trigger — never trusted from the inserted row itself (the
--     inserted row has no author_id column to begin with; it only has
--     post_id, which is looked up here) — so a client can't spoof who it's
--     checking against.
--
-- Deliberately NOT `security definer`, unlike guard_follow_not_blocked()/
-- guard_message_not_blocked(): both new functions only ever (a) SELECT
-- author_id from public.posts, whose SELECT policy is unconditionally public
-- ("Posts are viewable by everyone" — using (true), posts_schema.sql), and
-- (b) call the already-`security definer` users_blocked(), which does its
-- own privilege escalation internally to read public.blocks regardless of
-- the caller. Neither step needs this function's own execution to run with
-- elevated privilege, so it doesn't get any — the existing pattern's
-- SECURITY DEFINER is reused only where it's actually load-bearing.

-- =====================================================================
-- 1. Likes — guard_like_not_blocked()
-- =====================================================================
create or replace function public.guard_like_not_blocked()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_post_author_id uuid;
begin
  select author_id into v_post_author_id
  from public.posts
  where id = new.post_id;

  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(new.user_id, v_post_author_id) then
    raise exception 'Unable to like this post.';
  end if;

  return new;
end;
$$;

create trigger guard_like_not_blocked
  before insert on public.likes
  for each row execute function public.guard_like_not_blocked();

-- =====================================================================
-- 2. Comments — guard_comment_not_blocked()
-- =====================================================================
create or replace function public.guard_comment_not_blocked()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_post_author_id uuid;
begin
  select author_id into v_post_author_id
  from public.posts
  where id = new.post_id;

  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(new.author_id, v_post_author_id) then
    raise exception 'Unable to comment on this post.';
  end if;

  return new;
end;
$$;

create trigger guard_comment_not_blocked
  before insert on public.comments
  for each row execute function public.guard_comment_not_blocked();

-- =====================================================================
-- Notes on behavior this migration does NOT change:
--   - Liking/commenting on your OWN post: users_blocked(x, x) is always
--     false (blocks_unique/blocks_not_self make a self-block impossible to
--     begin with), so this is untouched.
--   - Unliking (DELETE on likes) / editing or deleting your own comment:
--     these triggers only fire BEFORE INSERT, exactly like
--     guard_follow_not_blocked only ever gates new follows, never unfollows.
--   - unique_like (post_id, user_id) and comments' existing RLS/realtime
--     behavior: untouched — this migration adds no columns, no policies,
--     and modifies no existing function or trigger.
--   - on_like_added / on_like_added_achievement / on_like_added_notify /
--     on_comment_added / on_comment_created_notify (all AFTER INSERT):
--     when this BEFORE INSERT trigger raises, Postgres aborts the INSERT
--     before the row ever exists, so none of these AFTER triggers run at
--     all for a blocked attempt — like_count never increments and no
--     notification is created, with no change needed to any of them.
-- =====================================================================
