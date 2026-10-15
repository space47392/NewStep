-- School Sky Lanterns, part 2: "This helped", "Me too", and a place to review
-- reports. Run AFTER school_sky_lanterns.sql. Safe to run more than once.
--
--   * "This helped" — the lantern's writer can thank a note. The note's writer
--     gets a notification, but never learns who wrote the lantern.
--   * "Me too" — classmates can quietly say "I feel this too" on a lantern.
--     Only the count is shown; no names, no notifications.
--   * Report review — the review schema is NOT reachable from the app; open it
--     in the Supabase SQL editor (see the bottom of this file).

-- =====================================================================
-- "This helped"
-- =====================================================================
alter table public.lantern_notes add column if not exists helped boolean not null default false;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
    'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received',
    'sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks'
  ));

create or replace function public.mark_lantern_note_helped(p_note uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_author uuid;
  v_was boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select n.author_id, n.helped into v_note_author, v_was
  from public.lantern_notes n
  join public.sky_lanterns l on l.id = n.lantern_id
  where n.id = p_note and l.author_id = auth.uid();
  if not found then
    raise exception 'Only the lantern''s writer can do that';
  end if;
  if v_was then
    return;
  end if;
  update public.lantern_notes set helped = true where id = p_note;

  -- No actor: the note's writer must not learn who wrote the lantern.
  if v_note_author is not null then
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      v_note_author, null, 'lantern_thanks', null, null, null,
      'Your warm note helped someone 💛',
      'They wanted you to know it made a difference.'
    );
  end if;
end;
$$;
revoke all on function public.mark_lantern_note_helped(uuid) from public;
grant execute on function public.mark_lantern_note_helped(uuid) to authenticated;

-- Notes now say whether they helped (return type changed, so drop first).
drop function if exists public.fetch_lantern_notes(uuid);
create function public.fetch_lantern_notes(p_lantern uuid)
returns table (id uuid, text text, created_at timestamptz, hidden boolean, mine boolean,
               author_id uuid, author_name text, author_avatar text, helped boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.text, n.created_at, n.hidden, n.author_id = auth.uid() as mine,
         p.id, p.full_name, p.avatar_url, n.helped
  from public.lantern_notes n
  join public.sky_lanterns l on l.id = n.lantern_id
  left join public.profiles p on p.id = n.author_id
  where n.lantern_id = p_lantern
    and public.lantern_visible(p_lantern)
    and (not n.hidden or l.author_id = auth.uid())
    and not exists (select 1 from public.lantern_reports r where r.note_id = n.id and r.reporter_id = auth.uid())
  order by n.created_at;
$$;
revoke all on function public.fetch_lantern_notes(uuid) from public;
grant execute on function public.fetch_lantern_notes(uuid) to authenticated;

-- =====================================================================
-- "Me too"
-- =====================================================================
create table if not exists public.lantern_hugs (
  lantern_id uuid not null references public.sky_lanterns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lantern_id, user_id)
);
alter table public.lantern_hugs enable row level security;
-- No policies: only through the function below.

-- Returns true when I now feel it too, false when I took it back.
create or replace function public.toggle_lantern_hug(p_lantern uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.lantern_visible(p_lantern) then
    raise exception 'That lantern has drifted away';
  end if;
  if exists (select 1 from public.sky_lanterns where id = p_lantern and author_id = auth.uid()) then
    raise exception 'This is your own lantern';
  end if;
  if exists (select 1 from public.lantern_hugs where lantern_id = p_lantern and user_id = auth.uid()) then
    delete from public.lantern_hugs where lantern_id = p_lantern and user_id = auth.uid();
    return false;
  end if;
  insert into public.lantern_hugs (lantern_id, user_id) values (p_lantern, auth.uid());
  return true;
end;
$$;
revoke all on function public.toggle_lantern_hug(uuid) from public;
grant execute on function public.toggle_lantern_hug(uuid) to authenticated;

-- Lanterns now carry the "Me too" count (return type changed, so drop first).
drop function if exists public.fetch_lanterns();
create function public.fetch_lanterns()
returns table (id uuid, text text, crisis boolean, created_at timestamptz, mine boolean,
               note_count int, noted_by_me boolean, hug_count int, hugged_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.text, l.crisis, l.created_at,
         l.author_id = auth.uid() as mine,
         (select count(*)::int from public.lantern_notes n where n.lantern_id = l.id and not n.hidden) as note_count,
         exists (select 1 from public.lantern_notes n where n.lantern_id = l.id and n.author_id = auth.uid()) as noted_by_me,
         (select count(*)::int from public.lantern_hugs h where h.lantern_id = l.id) as hug_count,
         exists (select 1 from public.lantern_hugs h where h.lantern_id = l.id and h.user_id = auth.uid()) as hugged_by_me
  from public.sky_lanterns l
  where public.lantern_visible(l.id)
  order by l.created_at desc
  limit 60;
$$;
revoke all on function public.fetch_lanterns() from public;
grant execute on function public.fetch_lanterns() to authenticated;

-- =====================================================================
-- Report review (SQL editor only — not exposed to the app)
-- =====================================================================
-- The app's API only serves the "public" schema, so nothing here can be
-- reached from a phone.
create schema if not exists review;
revoke all on schema review from public, anon, authenticated;

-- Every reported lantern and note, newest first, with how many people
-- reported it and who wrote it (so a teacher/admin can follow up).
create or replace view review.lantern_reports as
select
  coalesce(r.lantern_id, r.note_id) as target_id,
  case when r.lantern_id is not null then 'lantern' else 'note' end as kind,
  coalesce(l.text, n.text) as text,
  count(*) as reports,
  max(r.created_at) as last_reported,
  coalesce(l.author_id, n.author_id) as author_id,
  ap.full_name as author_name,
  coalesce(l.crisis, false) as crisis,
  coalesce(l.school_name, nl.school_name) as school_name
from public.lantern_reports r
left join public.sky_lanterns l on l.id = r.lantern_id
left join public.lantern_notes n on n.id = r.note_id
left join public.sky_lanterns nl on nl.id = n.lantern_id
left join public.profiles ap on ap.id = coalesce(l.author_id, n.author_id)
group by 1, 2, 3, 6, 7, 8, 9
order by last_reported desc;
revoke all on review.lantern_reports from public, anon, authenticated;

-- Remove something after reviewing it.
create or replace function review.remove_lantern(p_lantern uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.sky_lanterns where id = p_lantern;
$$;

create or replace function review.remove_lantern_note(p_note uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.lantern_notes where id = p_note;
$$;
revoke all on function review.remove_lantern(uuid) from public, anon, authenticated;
revoke all on function review.remove_lantern_note(uuid) from public, anon, authenticated;

-- How to review (in the Supabase SQL editor):
--   select * from review.lantern_reports;
--   select review.remove_lantern('<target_id>');        -- kind = 'lantern'
--   select review.remove_lantern_note('<target_id>');   -- kind = 'note'
