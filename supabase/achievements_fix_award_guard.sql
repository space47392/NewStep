-- Fixes a real, reported bug: revoking EXECUTE on award_achievements() from
-- public/anon/authenticated (achievements_lock_award_function.sql) broke the
-- legitimate internal call from handle_post_completed() too — "Mark as
-- Completed" started failing for real users immediately after that revoke.
--
-- The revoke assumed a SECURITY DEFINER function's owner always retains
-- implicit privilege on objects it owns, bypassing any REVOKE. That's the
-- normal Postgres rule, but it can't be confirmed without direct role/ownership
-- introspection this session doesn't have access to — and the failure's timing
-- makes it the clear suspect. Rather than keep guessing, this switches to a
-- mechanism that doesn't depend on GRANT/REVOKE/ownership at all: the same
-- transaction-local flag technique already used (and proven working) for
-- profiles.points via guard_profile_points_update().

-- 1. Undo the revoke — restores the call path regardless of the exact cause.
grant execute on function public.award_achievements(uuid, text, integer) to public;

-- 2. award_achievements() now refuses to run unless a same-transaction flag
-- has already been set by trusted code — gating the function call itself,
-- the same idea as guard_profile_points_update() gates a column write. A
-- client calling this RPC directly never sets the flag, so it still always
-- fails — just with its own exception now instead of a permission error.
create or replace function public.award_achievements(p_user_id uuid, p_metric text, p_current_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_achievement_award', true), 'off') <> 'on' then
    raise exception 'award_achievements() cannot be called directly.';
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  select p_user_id, a.id
  from public.achievements a
  where a.metric = p_metric
    and a.requirement <= p_current_count
    and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user_id and ua.achievement_id = a.id
    )
  on conflict (user_id, achievement_id) do nothing;
end;
$$;

-- 3. The three legitimate callers — same bodies as before, one added line
-- each (set the flag immediately before calling award_achievements()).
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

    insert into public.points_history (user_id, amount, reason, post_id)
    values (new.helper_id, 1, 'help_completed', new.id)
    on conflict (post_id, reason) where post_id is not null do nothing;

    perform set_config('newstep.allow_achievement_award', 'on', true);
    perform public.award_achievements(
      new.helper_id,
      'help_completed',
      (select count(*) from public.posts where helper_id = new.helper_id and status = 'completed')
    );
  end if;
  return new;
end;
$$;

create or replace function public.handle_comment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('newstep.allow_achievement_award', 'on', true);
  perform public.award_achievements(
    new.author_id,
    'comments_made',
    (select count(*) from public.comments where author_id = new.author_id)
  );
  return new;
end;
$$;

create or replace function public.handle_like_added_achievement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.posts where id = new.post_id;

  if v_author_id is not null then
    perform set_config('newstep.allow_achievement_award', 'on', true);
    perform public.award_achievements(
      v_author_id,
      'likes_received',
      (
        select count(*)
        from public.likes l
        join public.posts p on p.id = l.post_id
        where p.author_id = v_author_id
      )
    );
  end if;

  return new;
end;
$$;
