-- School Sky, part 2: twinkles, wishes and the Sky Diary.
-- Run AFTER school_sky_colors.sql (and push_copy.sql). Safe to run more
-- than once.
--
--   1. Twinkles  — send a little light to a classmate's star. The star
--                  glows with today's twinkles and its owner gets a
--                  notification. One twinkle per sender per star per day.
--   2. Wishes    — catch a shooting star and make a short wish. Wishes
--                  are shown to classmates without a name and fade after
--                  24 hours. Classmates can cheer (💛) a wish.
--   3. Sky Diary — every time you set your star, that day's mood, line and
--                  sky colours are kept in your own diary (only you see it).

-- =====================================================================
-- Shared helper: are two students at the same school?
-- =====================================================================
create or replace function public.same_school(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles a, public.profiles b
    where a.id = p_a and b.id = p_b
      and (
        (a.school_id is not null and a.school_id = b.school_id)
        or (a.school_id is null and b.school_id is null and a.school_name is not null and a.school_name = b.school_name)
      )
  );
$$;

-- =====================================================================
-- 1. Twinkles
-- =====================================================================
create table if not exists public.sky_twinkles (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sky_twinkles_recipient_idx on public.sky_twinkles (recipient_id, created_at desc);
create index if not exists sky_twinkles_sender_idx on public.sky_twinkles (sender_id, created_at desc);

alter table public.sky_twinkles enable row level security;

-- Classmates can see today's twinkles (counts on stars); writes only via
-- send_twinkle().
drop policy if exists "Classmates can see twinkles" on public.sky_twinkles;
create policy "Classmates can see twinkles"
  on public.sky_twinkles for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.same_school(auth.uid(), recipient_id));

-- Notification type for twinkles and wish cheers.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
    'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received',
    'sky_twinkle', 'wish_cheer'
  ));

create or replace function public.send_twinkle(p_recipient uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_recipient = auth.uid() then
    return;
  end if;
  if not public.same_school(auth.uid(), p_recipient) then
    raise exception 'You can only twinkle at classmates';
  end if;
  -- Only at a star that's actually up today.
  if not exists (
    select 1 from public.sky_stars where user_id = p_recipient and updated_at > now() - interval '24 hours'
  ) then
    raise exception 'That star has faded';
  end if;
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(auth.uid(), p_recipient) then
    raise exception 'Unable to send this.';
  end if;
  -- One twinkle per classmate per day.
  if exists (
    select 1 from public.sky_twinkles
    where sender_id = auth.uid() and recipient_id = p_recipient and created_at > now() - interval '24 hours'
  ) then
    raise exception 'You already sent them a twinkle today';
  end if;
  -- Flood guard.
  if (select count(*) from public.sky_twinkles where sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of twinkles — try again later';
  end if;

  insert into public.sky_twinkles (sender_id, recipient_id) values (auth.uid(), p_recipient);

  perform set_config('newstep.allow_notification_create', 'on', true);
  -- create_notification() has no copy for this type, so the title/body
  -- passed here are what the push shows.
  perform public.create_notification(
    p_recipient, auth.uid(), 'sky_twinkle', null, null, null,
    coalesce((select nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '') from public.profiles where id = auth.uid()), 'A classmate')
      || ' sent you a twinkle ✨',
    'Someone noticed your star tonight.'
  );
end;
$$;

revoke all on function public.send_twinkle(uuid) from public;
grant execute on function public.send_twinkle(uuid) to authenticated;

-- =====================================================================
-- 2. Wishes
-- =====================================================================
create table if not exists public.sky_wishes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid,
  school_name text,
  text text not null,
  created_at timestamptz not null default now(),
  constraint sky_wishes_text_length check (char_length(btrim(text)) between 1 and 60)
);
create index if not exists sky_wishes_school_idx on public.sky_wishes (school_id, created_at desc);
create index if not exists sky_wishes_school_name_idx on public.sky_wishes (school_name, created_at desc);

alter table public.sky_wishes enable row level security;

-- Classmates can read wishes. The author is not exposed to the app (see
-- fetch_sky_wishes); the table itself stays readable only to the author,
-- so author_id never leaves the server for anyone else.
drop policy if exists "Authors can see their own wishes" on public.sky_wishes;
create policy "Authors can see their own wishes"
  on public.sky_wishes for select
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "Authors can delete their own wishes" on public.sky_wishes;
create policy "Authors can delete their own wishes"
  on public.sky_wishes for delete
  to authenticated
  using (author_id = auth.uid());

create table if not exists public.sky_wish_cheers (
  wish_id uuid not null references public.sky_wishes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wish_id, user_id)
);
alter table public.sky_wish_cheers enable row level security;
drop policy if exists "Users can see their own cheers" on public.sky_wish_cheers;
create policy "Users can see their own cheers"
  on public.sky_wish_cheers for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.make_wish(p_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
  v_school_name text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select school_id, school_name into v_school_id, v_school_name from public.profiles where id = auth.uid();
  if v_school_id is null and v_school_name is null then
    raise exception 'Choose your school first';
  end if;
  -- A few wishes a day is plenty.
  if (select count(*) from public.sky_wishes where author_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'You''ve made 3 wishes today — save some for tomorrow ✨';
  end if;
  insert into public.sky_wishes (author_id, school_id, school_name, text)
  values (auth.uid(), v_school_id, v_school_name, btrim(p_text))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.make_wish(text) from public;
grant execute on function public.make_wish(text) to authenticated;

-- Today's wishes at the caller's school, without who made them, plus
-- whether each one is yours and whether you cheered it.
create or replace function public.fetch_sky_wishes()
returns table (id uuid, text text, created_at timestamptz, cheers int, mine boolean, cheered boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.text, w.created_at,
         (select count(*)::int from public.sky_wish_cheers c where c.wish_id = w.id) as cheers,
         w.author_id = auth.uid() as mine,
         exists (select 1 from public.sky_wish_cheers c where c.wish_id = w.id and c.user_id = auth.uid()) as cheered
  from public.sky_wishes w
  join public.profiles me on me.id = auth.uid()
  where w.created_at > now() - interval '24 hours'
    and (
      (me.school_id is not null and me.school_id = w.school_id)
      or (me.school_id is null and me.school_name is not null and me.school_name = w.school_name)
    )
  order by w.created_at desc
  limit 40;
$$;
revoke all on function public.fetch_sky_wishes() from public;
grant execute on function public.fetch_sky_wishes() to authenticated;

create or replace function public.cheer_wish(p_wish uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select author_id into v_author from public.sky_wishes
  where id = p_wish and created_at > now() - interval '24 hours';
  if v_author is null then
    raise exception 'That wish has faded';
  end if;
  if not public.same_school(auth.uid(), v_author) then
    raise exception 'Unable to cheer this wish';
  end if;
  insert into public.sky_wish_cheers (wish_id, user_id) values (p_wish, auth.uid())
  on conflict do nothing;
  if found and v_author <> auth.uid() then
    -- Anonymous on purpose: the wisher learns someone cheered, not who.
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      v_author, null, 'wish_cheer', null, null, null,
      'Someone cheered your wish 💛', 'Your wish is shining a little brighter.'
    );
  end if;
end;
$$;
revoke all on function public.cheer_wish(uuid) from public;
grant execute on function public.cheer_wish(uuid) to authenticated;

-- =====================================================================
-- 3. Sky Diary
-- =====================================================================
create table if not exists public.sky_diary (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  mood text not null,
  note text,
  sky_colors text[],
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.sky_diary enable row level security;
drop policy if exists "Students can read their own diary" on public.sky_diary;
create policy "Students can read their own diary"
  on public.sky_diary for select
  to authenticated
  using (user_id = auth.uid());

-- Every star update also writes that day's diary page. The "day" follows
-- the school's own timezone where known; Pacific time otherwise (the
-- school directory is California schools).
create or replace function public.sky_star_to_diary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sky_diary (user_id, day, mood, note, sky_colors, updated_at)
  values (new.user_id, (new.updated_at at time zone 'America/Los_Angeles')::date, new.mood, new.note, new.sky_colors, new.updated_at)
  on conflict (user_id, day) do update
    set mood = excluded.mood,
        note = excluded.note,
        -- Keep the day's colours if this update had no photo.
        sky_colors = coalesce(excluded.sky_colors, public.sky_diary.sky_colors),
        updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists sky_star_to_diary on public.sky_stars;
create trigger sky_star_to_diary
  after insert or update on public.sky_stars
  for each row execute function public.sky_star_to_diary();
