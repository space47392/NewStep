-- School Sky: each student can put one "mood star" in their school's sky.
-- A star is a mood (from a fixed set) plus an optional short line. It shows
-- on Home and in the School Sky screen for 24 hours after it was last set.
--
-- One row per student (user_id is the primary key): setting a new star
-- replaces the old one. Only classmates (same school) can see a star.
-- Writes go through set_my_star(), which stamps the school from the
-- student's own profile so a client can't post into another school's sky.
--
-- Safe to run more than once.

create table if not exists public.sky_stars (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  school_id uuid,
  school_name text,
  mood text not null,
  note text,
  updated_at timestamptz not null default now(),
  constraint sky_stars_mood_valid
    check (mood in ('happy', 'excited', 'chill', 'nervous', 'tired', 'down')),
  constraint sky_stars_note_length
    check (note is null or char_length(btrim(note)) between 1 and 80)
);

create index if not exists sky_stars_school_id_idx on public.sky_stars (school_id, updated_at desc);
create index if not exists sky_stars_school_name_idx on public.sky_stars (school_name, updated_at desc);

alter table public.sky_stars enable row level security;

-- Classmates only: same directory school, or (for older profiles without a
-- school_id) the same school name. You can always see your own star.
drop policy if exists "Classmates can see sky stars" on public.sky_stars;
create policy "Classmates can see sky stars"
  on public.sky_stars for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid()
        and (
          (me.school_id is not null and me.school_id = sky_stars.school_id)
          or (me.school_id is null and me.school_name is not null and me.school_name = sky_stars.school_name)
        )
    )
  );

drop policy if exists "Students can remove their own star" on public.sky_stars;
create policy "Students can remove their own star"
  on public.sky_stars for delete
  to authenticated
  using (user_id = auth.uid());

-- No insert/update policies: set_my_star() is the only way to write.

create or replace function public.set_my_star(p_mood text, p_note text)
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
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select school_id, school_name into v_school_id, v_school_name
  from public.profiles where id = auth.uid();

  if v_school_id is null and v_school_name is null then
    raise exception 'Choose your school first';
  end if;

  -- Light rate limit: changing your star more than once every 20 seconds
  -- is a flood, not a mood.
  select updated_at into v_last from public.sky_stars where user_id = auth.uid();
  if v_last is not null and v_last > now() - interval '20 seconds' then
    raise exception 'Give it a few seconds before changing your star again';
  end if;

  insert into public.sky_stars (user_id, school_id, school_name, mood, note, updated_at)
  values (auth.uid(), v_school_id, v_school_name, p_mood, v_note, now())
  on conflict (user_id) do update
    set school_id = excluded.school_id,
        school_name = excluded.school_name,
        mood = excluded.mood,
        note = excluded.note,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_my_star(text, text) from public;
grant execute on function public.set_my_star(text, text) to authenticated;
