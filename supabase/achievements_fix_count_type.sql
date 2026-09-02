-- Real root cause of "Mark as Completed" failing, found via Supabase Postgres
-- logs: award_achievements()'s third parameter was declared `integer`, but
-- every call site passes `(select count(*) ...)` — and COUNT(*) always
-- returns `bigint` in Postgres, never `integer`. Function-argument resolution
-- only considers IMPLICIT casts, and bigint -> integer is only an
-- ASSIGNMENT-level cast, so Postgres couldn't find a matching overload at all:
--   ERROR 42883: function public.award_achievements(uuid, unknown, bigint) does not exist
-- That fired inside the handle_post_completed() trigger, aborting the whole
-- transaction — including mark_post_completed()'s own status update. Present
-- since the very first version of this function (achievements_schema.sql);
-- unrelated to the EXECUTE-privilege fixes applied afterward (those were
-- real, independently worth keeping, but not the cause of this failure).

-- Changing a parameter type is a different signature to Postgres, so this
-- needs a drop + recreate rather than a plain CREATE OR REPLACE.
drop function if exists public.award_achievements(uuid, text, integer);

create function public.award_achievements(p_user_id uuid, p_metric text, p_current_count bigint)
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

-- Bodies unchanged — recreated only to force a clean replan against the new
-- award_achievements signature rather than any stale cached plan.
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
