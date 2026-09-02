-- Achievement / badge system. Two tables: static definitions (achievements) and
-- earned records (user_achievements). Awarding happens entirely via triggers on
-- events that already exist (post completion, comment insert, like insert) —
-- no new client-facing write path. Run after points_history_schema.sql.

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  icon text not null,
  -- Which running count this achievement watches. award_achievements() below
  -- uses this to stay generic instead of one hardcoded function per badge.
  metric text not null check (metric in ('help_completed', 'comments_made', 'likes_received')),
  requirement integer not null,
  created_at timestamptz not null default now()
);

alter table public.achievements enable row level security;

-- Public read — needed to render locked/unearned badges, not just earned ones.
-- No write policy for any client role: definitions only ever change via a
-- migration like this one.
create policy "Achievements are viewable by everyone"
  on public.achievements for select
  using (true);

insert into public.achievements (key, name, description, icon, metric, requirement) values
  ('first_helper',      'First Helper',       'Complete 1 Help request.',        '🤝', 'help_completed',  1),
  ('helpful_student',   'Helpful Student',     'Complete 5 Help requests.',       '⭐', 'help_completed',  5),
  ('community_builder', 'Community Builder',   'Complete 10 Help requests.',      '🌟', 'help_completed', 10),
  ('community_voice',   'Community Voice',     'Make 10 comments.',               '💬', 'comments_made',  10),
  ('supporter',         'Supporter',           'Receive 10 likes on your posts.', '❤️', 'likes_received', 10);

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  -- The hard guarantee that the same badge can never be awarded twice.
  constraint user_achievements_unique unique (user_id, achievement_id)
);

create index user_achievements_user_id_idx on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

-- Public read — badges are part of the public profile, same spirit as
-- profiles.points and the leaderboard (unlike points_history, which stays
-- private per-user).
create policy "Earned achievements are viewable by everyone"
  on public.user_achievements for select
  using (true);

-- Deliberately NO insert/update/delete policy for authenticated/anon. A client
-- can never award itself (or anyone else) a badge, or delete/modify an earned
-- one. The only writer is award_achievements() below — SECURITY DEFINER,
-- bypasses RLS the same way handle_post_completed() already does.

-- Shared awarding logic: given a user, a metric, and that user's CURRENT count
-- for that metric, award every achievement on that metric whose requirement is
-- now met and isn't already earned. Handles jumping straight past a milestone
-- (e.g. a backfill or batch operation) by awarding every tier crossed, not just
-- the highest one. The unique constraint + ON CONFLICT is a second, independent
-- guard against double-award beyond the NOT EXISTS check.
create or replace function public.award_achievements(p_user_id uuid, p_metric text, p_current_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

-- Extends the existing handle_post_completed() (points_history_schema.sql) with
-- one more call at the end — same transaction, same trigger, same exactly-once
-- guard it already has. Everything above the added block is unchanged.
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

    perform public.award_achievements(
      new.helper_id,
      'help_completed',
      (select count(*) from public.posts where helper_id = new.helper_id and status = 'completed')
    );
  end if;
  return new;
end;
$$;

-- New: Community Voice (10 comments made).
create or replace function public.handle_comment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.award_achievements(
    new.author_id,
    'comments_made',
    (select count(*) from public.comments where author_id = new.author_id)
  );
  return new;
end;
$$;

create trigger on_comment_added
  after insert on public.comments
  for each row execute function public.handle_comment_added();

-- New: Supporter (10 likes received across all of your posts). Counts directly
-- from likes joined to posts rather than the denormalized posts.like_count
-- column, so this doesn't depend on firing after handle_like_added() (Postgres
-- runs same-event triggers in trigger-name order, which is incidental, not a
-- guarantee worth relying on).
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

create trigger on_like_added_achievement
  after insert on public.likes
  for each row execute function public.handle_like_added_achievement();
