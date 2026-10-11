-- School Sky "describe your sky": a student describes the sky in words and
-- an AI (Edge Function describe-sky) turns it into a painted sky. Run AFTER
-- school_sky_social.sql. Safe to run more than once.
--
--   sky_desc    — the student's own words ("pink sunset, cotton-candy clouds")
--   sky_title   — the short title the AI gave it ("Cotton-candy sunset")
--   sky_clouds  — none | few | scattered | overcast
--   sky_things  — what's in it: moon, rainbow, birds…
--   sky_colors  — (existing) the three sky colours; now usually from the
--                 description instead of a photo

alter table public.sky_stars add column if not exists sky_desc text;
alter table public.sky_stars add column if not exists sky_title text;
alter table public.sky_stars add column if not exists sky_clouds text;
alter table public.sky_stars add column if not exists sky_things text[];

alter table public.sky_stars drop constraint if exists sky_stars_desc_valid;
alter table public.sky_stars add constraint sky_stars_desc_valid check (
  (sky_desc is null or char_length(btrim(sky_desc)) between 2 and 200)
  and (sky_title is null or char_length(sky_title) <= 40)
  and (sky_clouds is null or sky_clouds in ('none', 'few', 'scattered', 'overcast'))
  and (sky_things is null or sky_things <@ array['moon','sun','stars','rainbow','rain','snow','birds','airplane','fog','lightning','shooting_star']::text[])
);

-- The diary keeps the day's described sky too.
alter table public.sky_diary add column if not exists sky_title text;

-- Rate limit for the AI painter: each call is logged; 8 per hour per student.
create table if not exists public.sky_describe_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sky_describe_log_idx on public.sky_describe_log (user_id, created_at desc);
alter table public.sky_describe_log enable row level security;
-- No policies: only log_sky_describe() touches it.

create or replace function public.log_sky_describe()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if (select count(*) from public.sky_describe_log where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 8 then
    raise exception 'You''ve painted a lot of skies this hour — look up again a bit later 🌙';
  end if;
  insert into public.sky_describe_log (user_id) values (auth.uid());
  delete from public.sky_describe_log where created_at < now() - interval '1 day';
end;
$$;
revoke all on function public.log_sky_describe() from public;
grant execute on function public.log_sky_describe() to authenticated;

-- set_my_star, now also taking the described sky.
drop function if exists public.set_my_star(text, text);
drop function if exists public.set_my_star(text, text, text);
drop function if exists public.set_my_star(text, text, text, text[]);

create or replace function public.set_my_star(
  p_mood text,
  p_note text,
  p_photo_url text default null,
  p_sky_colors text[] default null,
  p_sky_desc text default null,
  p_sky_title text default null,
  p_sky_clouds text default null,
  p_sky_things text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_school_name text;
  v_last timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_url, '')), '');
  v_desc text := nullif(btrim(coalesce(p_sky_desc, '')), '');
  -- Colours come with a photo or a description; otherwise none.
  v_colors text[] := case when v_photo is null and v_desc is null then null else p_sky_colors end;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if v_photo is not null
     and v_photo not like '%/storage/v1/object/public/sky/' || auth.uid()::text || '/sky.jpg%' then
    raise exception 'That photo can''t be used';
  end if;

  select school_id, school_name into v_school_id, v_school_name
  from public.profiles where id = auth.uid();

  if v_school_id is null and v_school_name is null then
    raise exception 'Choose your school first';
  end if;

  select updated_at into v_last from public.sky_stars where user_id = auth.uid();
  if v_last is not null and v_last > now() - interval '20 seconds' then
    raise exception 'Give it a few seconds before changing your star again';
  end if;

  insert into public.sky_stars (user_id, school_id, school_name, mood, note, photo_url, sky_colors,
                                sky_desc, sky_title, sky_clouds, sky_things, updated_at)
  values (auth.uid(), v_school_id, v_school_name, p_mood, v_note, v_photo, v_colors,
          v_desc, case when v_desc is null then null else p_sky_title end,
          case when v_desc is null then null else p_sky_clouds end,
          case when v_desc is null then null else p_sky_things end, now())
  on conflict (user_id) do update
    set school_id = excluded.school_id,
        school_name = excluded.school_name,
        mood = excluded.mood,
        note = excluded.note,
        photo_url = excluded.photo_url,
        sky_colors = excluded.sky_colors,
        sky_desc = excluded.sky_desc,
        sky_title = excluded.sky_title,
        sky_clouds = excluded.sky_clouds,
        sky_things = excluded.sky_things,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_my_star(text, text, text, text[], text, text, text, text[]) from public;
grant execute on function public.set_my_star(text, text, text, text[], text, text, text, text[]) to authenticated;

-- Diary page keeps the sky's title.
create or replace function public.sky_star_to_diary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sky_diary (user_id, day, mood, note, sky_colors, sky_title, updated_at)
  values (new.user_id, (new.updated_at at time zone 'America/Los_Angeles')::date, new.mood, new.note,
          new.sky_colors, new.sky_title, new.updated_at)
  on conflict (user_id, day) do update
    set mood = excluded.mood,
        note = excluded.note,
        sky_colors = coalesce(excluded.sky_colors, public.sky_diary.sky_colors),
        sky_title = coalesce(excluded.sky_title, public.sky_diary.sky_title),
        updated_at = excluded.updated_at;
  return new;
end;
$$;
