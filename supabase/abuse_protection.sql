-- Abuse protection (anti-spam + anti-farming).
--
-- 1. Length limits enforced by the database, not only the app — a modified
--    client could otherwise send megabytes of text.
-- 2. Rate limits on everything a spammer would flood: posts, comments,
--    messages, stories, follows, reports, story waves.
-- 3. Point / achievement farming: two accounts (or one person with several)
--    could ask-and-help each other forever for unlimited points and badges.
--    Help still completes normally; only the *credit* is limited.
--
-- Every limit is generous for real students and only bites on bursts.
-- Safe to run more than once. Run AFTER help_history_schema.sql.

-- =====================================================================
-- 1. Length limits
-- =====================================================================
-- NOT VALID: applies to every new/edited row without failing on any old row
-- that might already be longer.
alter table public.posts drop constraint if exists posts_content_length;
alter table public.posts add constraint posts_content_length
  check (char_length(btrim(content)) between 1 and 500) not valid;

alter table public.comments drop constraint if exists comments_content_length;
alter table public.comments add constraint comments_content_length
  check (char_length(btrim(content)) between 1 and 500) not valid;

alter table public.messages drop constraint if exists messages_content_length;
alter table public.messages add constraint messages_content_length
  check (char_length(content) <= 2000) not valid;

alter table public.profiles drop constraint if exists profiles_full_name_length;
alter table public.profiles add constraint profiles_full_name_length
  check (full_name is null or char_length(full_name) <= 50) not valid;

alter table public.reports drop constraint if exists reports_details_length;
alter table public.reports add constraint reports_details_length
  check (details is null or char_length(details) <= 500) not valid;

-- =====================================================================
-- 2. Rate limits
-- =====================================================================
-- One shared checker: counts the caller's own recent rows in a table and
-- raises a friendly error past the limit. The app already shows
-- error.message in its alerts/toasts, so the student sees this text.
create or replace function public.enforce_rate_limit(
  p_table text,
  p_user_column text,
  p_user_id uuid,
  p_window interval,
  p_max integer,
  p_message text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Service-role / dashboard inserts (no signed-in user) are never limited.
  if p_user_id is null or auth.uid() is null then
    return;
  end if;
  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - $2',
    p_table, p_user_column
  ) into v_count using p_user_id, p_window;
  if v_count >= p_max then
    raise exception '%', p_message using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.enforce_rate_limit(text, text, uuid, interval, integer, text) from public;

create or replace function public.rate_limit_posts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('posts', 'author_id', new.author_id, interval '10 minutes', 5,
    'You''re posting a lot right now. Take a short break and try again in a few minutes.');
  perform public.enforce_rate_limit('posts', 'author_id', new.author_id, interval '1 day', 30,
    'You''ve reached today''s post limit. You can post again tomorrow.');
  return new;
end; $$;
drop trigger if exists rate_limit_posts on public.posts;
create trigger rate_limit_posts before insert on public.posts
  for each row execute function public.rate_limit_posts();

create or replace function public.rate_limit_comments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('comments', 'author_id', new.author_id, interval '5 minutes', 20,
    'You''re commenting very fast. Slow down a little and try again shortly.');
  return new;
end; $$;
drop trigger if exists rate_limit_comments on public.comments;
create trigger rate_limit_comments before insert on public.comments
  for each row execute function public.rate_limit_comments();

create or replace function public.rate_limit_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('messages', 'sender_id', new.sender_id, interval '1 minute', 30,
    'You''re sending messages too fast. Wait a moment and try again.');
  return new;
end; $$;
drop trigger if exists rate_limit_messages on public.messages;
create trigger rate_limit_messages before insert on public.messages
  for each row execute function public.rate_limit_messages();

create or replace function public.rate_limit_stories() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('stories', 'author_id', new.author_id, interval '1 hour', 10,
    'You''ve shared a lot of stories this hour. Try again a bit later.');
  return new;
end; $$;
drop trigger if exists rate_limit_stories on public.stories;
create trigger rate_limit_stories before insert on public.stories
  for each row execute function public.rate_limit_stories();

create or replace function public.rate_limit_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('follows', 'follower_id', new.follower_id, interval '1 hour', 60,
    'You''ve followed a lot of people this hour. Try again later.');
  return new;
end; $$;
drop trigger if exists rate_limit_follows on public.follows;
create trigger rate_limit_follows before insert on public.follows
  for each row execute function public.rate_limit_follows();

create or replace function public.rate_limit_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enforce_rate_limit('reports', 'reporter_id', new.reporter_id, interval '1 day', 20,
    'You''ve sent a lot of reports today. Thanks for helping — please try again tomorrow.');
  return new;
end; $$;
drop trigger if exists rate_limit_reports on public.reports;
create trigger rate_limit_reports before insert on public.reports
  for each row execute function public.rate_limit_reports();

-- Story waves are notifications, not their own table — limit them there.
create or replace function public.rate_limit_story_waves() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if new.type = 'story_wave' and new.actor_id is not null then
    select count(*) into v_count from public.notifications
    where actor_id = new.actor_id and type = 'story_wave' and created_at > now() - interval '1 hour';
    if v_count >= 30 then
      raise exception 'You''ve waved a lot this hour. Try again later.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists rate_limit_story_waves on public.notifications;
create trigger rate_limit_story_waves before insert on public.notifications
  for each row execute function public.rate_limit_story_waves();

-- Indexes so the counts above stay fast as tables grow.
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists comments_author_created_idx on public.comments (author_id, created_at desc);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index if not exists stories_author_created_idx on public.stories (author_id, created_at desc);
create index if not exists follows_follower_created_idx on public.follows (follower_id, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create index if not exists notifications_actor_type_created_idx on public.notifications (actor_id, type, created_at desc);

-- =====================================================================
-- 3. Anti-farming for Help credit
-- =====================================================================
-- Same as help_history_schema.sql's version, plus one gate in front of the
-- credit (point, help_history row, achievements):
--   * the same helper ← same student pair earns credit at most once per 7 days
--   * a helper earns credit for at most 5 completions per 24 hours
-- Past either limit the request still completes and the helper is still
-- told it was completed — they just don't get another point or badge
-- progress for it.
create or replace function public.handle_post_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_new_student boolean;
  v_credited boolean;
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    v_credited :=
      not exists (
        select 1 from public.help_history
        where helper_id = new.helper_id
          and student_id = new.author_id
          and completed_at > now() - interval '7 days'
      )
      and (
        select count(*) from public.help_history
        where helper_id = new.helper_id and completed_at > now() - interval '24 hours'
      ) < 5;

    if v_credited then
      perform set_config('newstep.allow_points_change', 'on', true);
      update public.profiles
      set points = points + 1
      where id = new.helper_id;

      insert into public.points_history (user_id, amount, reason, post_id)
      values (new.helper_id, 1, 'help_completed', new.id)
      on conflict (post_id, reason) where post_id is not null do nothing;

      -- Computed BEFORE inserting the new row below, or it would always see
      -- itself and never be true.
      v_is_new_student := not exists (
        select 1 from public.help_history
        where helper_id = new.helper_id and student_id = new.author_id
      );

      insert into public.help_history (helper_id, student_id, post_id, is_new_student)
      values (new.helper_id, new.author_id, new.id, v_is_new_student)
      on conflict (post_id) where post_id is not null do nothing;

      perform set_config('newstep.allow_achievement_award', 'on', true);
      perform public.award_achievements(
        new.helper_id,
        'help_completed',
        (select count(*) from public.help_history where helper_id = new.helper_id)
      );
    end if;

    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.helper_id, null, 'help_completed', new.id, null, null,
      'Nice work!', 'The request you helped with was marked as completed'
    );
    if v_credited then
      perform set_config('newstep.allow_notification_create', 'on', true);
      perform public.create_notification(
        new.helper_id, null, 'points_earned', null, null, null,
        'Community Point earned', 'You earned 1 Community Point'
      );
    end if;
  end if;
  return new;
end;
$$;
