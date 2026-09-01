-- Security hardening pass on the Help lifecycle (Open -> Helping -> Completed).
-- Fixes two RLS gaps found during audit; does not change any application behavior
-- a legitimate user could rely on. Run this once, after volunteer_points_schema.sql.

-- =====================================================================
-- FIX 1 — Secure profiles.points
-- =====================================================================
-- "Users can update their own profile" (profile_schema.sql) has no WITH CHECK,
-- so it restricts WHICH ROW can be touched (id = auth.uid()) but nothing about
-- WHICH COLUMNS. Today, this succeeds from any signed-in client:
--   supabase.from('profiles').update({ points: 999999 }).eq('id', myUserId)
-- This trigger closes that gap without touching the existing policy, so
-- full_name / school_name / grade / interests / avatar_url / username edits
-- keep working exactly as before — it only ever rejects a change to `points`
-- unless a same-transaction flag has already been set by trusted server-side
-- code. Only handle_post_completed() (Fix 2, below) ever sets that flag.
create or replace function public.guard_profile_points_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_points_change', true), 'off') <> 'on' then
    raise exception 'profiles.points cannot be modified directly.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_points_update on public.profiles;
create trigger guard_profile_points_update
  before update on public.profiles
  for each row
  when (old.points is distinct from new.points)
  execute function public.guard_profile_points_update();

-- =====================================================================
-- FIX 2 — Secure Volunteer + Complete
-- =====================================================================
-- The previous approach used two permissive UPDATE policies on posts:
--   "Students can volunteer to help on open requests"  (posts_add_volunteer.sql)
--   "Authors can mark accepted requests as completed"  (volunteer_points_schema.sql)
-- Postgres combines multiple permissive policies for the same command with OR,
-- independently for USING and WITH CHECK. That let a non-author, on someone
-- else's OPEN post, satisfy the volunteer policy's USING (open + not the
-- author) while satisfying the *complete* policy's WITH CHECK (status =
-- 'completed') instead of the volunteer policy's own — jumping the post
-- straight from 'open' to 'completed' with themselves as helper_id, without
-- the real author ever accepting them. handle_post_completed() would then
-- award them a point. This is the exact bug class edit_post() was already
-- written to avoid (see posts_edit_delete.sql) — it just wasn't applied here.
--
-- Fix: drop both policies (posts becomes fully update-locked for plain client
-- requests, same as it already is for edit/delete) and replace them with two
-- SECURITY DEFINER functions. Each independently re-validates every condition
-- against the CURRENT row under a row lock, and uses auth.uid() rather than
-- any client-supplied id.

drop policy "Students can volunteer to help on open requests" on public.posts;
drop policy "Authors can mark accepted requests as completed" on public.posts;

create or replace function public.volunteer_to_help(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to volunteer.';
  end if;

  -- Locks the row so a second, concurrent call for the same post blocks here
  -- until this transaction commits or rolls back, then re-reads the fresh
  -- (already-accepted) row instead of racing against a stale one.
  select * into v_post from public.posts where id = p_post_id for update;

  if not found then
    raise exception 'Post not found.';
  end if;

  if v_post.category is distinct from 'Need Help' then
    raise exception 'Only Need Help posts can be volunteered for.';
  end if;

  if v_post.status is distinct from 'open' then
    raise exception 'This request is no longer open.';
  end if;

  if v_post.helper_id is not null then
    raise exception 'This request already has a helper.';
  end if;

  if v_post.author_id = v_uid then
    raise exception 'You cannot volunteer for your own request.';
  end if;

  update public.posts
  set helper_id = v_uid, status = 'accepted'
  where id = p_post_id;
end;
$$;

create or replace function public.mark_post_completed(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to complete a request.';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;

  if not found then
    raise exception 'Post not found.';
  end if;

  if v_post.author_id <> v_uid then
    raise exception 'Only the author can mark this request as completed.';
  end if;

  if v_post.status is distinct from 'accepted' then
    raise exception 'Only an accepted request can be marked as completed.';
  end if;

  if v_post.helper_id is null then
    raise exception 'This request has no helper to credit.';
  end if;

  update public.posts
  set status = 'completed'
  where id = p_post_id;
  -- handle_post_completed() (AFTER UPDATE trigger, updated below) awards the
  -- helper's point from here — same mechanism as before, still exactly-once
  -- thanks to its own "old.status <> 'completed'" guard.
end;
$$;

-- Unchanged behavior, one addition: set the same-transaction flag
-- guard_profile_points_update() (Fix 1) requires, so this — the one
-- legitimate path — can still write profiles.points.
create or replace function public.handle_post_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    perform set_config('newstep.allow_points_change', 'on', true);
    update public.profiles
    set points = points + 1
    where id = new.helper_id;
  end if;
  return new;
end;
$$;
