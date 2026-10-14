-- School Sky Lanterns: send up a worry anonymously; classmates send back a
-- warm note (with their name). Run AFTER school_sky_safety.sql. Safe to run
-- more than once.
--
-- Safety:
--   * Lanterns are anonymous to students, but author_id is kept so reports
--     can be reviewed. The table is never readable directly — only through
--     fetch_* functions that leave the author out.
--   * Same school only. Lanterns fade after 3 days.
--   * Kind-words filter (has_blocked_words) on lanterns and notes.
--   * Lanterns that sound like the writer may be in danger are flagged
--     (crisis) so the app shows support lines with them.
--   * No replies to replies; the lantern's writer can hide any note on it;
--     anyone can report. Nothing is auto-hidden by report count.

-- =====================================================================
-- Tables
-- =====================================================================
create table if not exists public.sky_lanterns (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid,
  school_name text,
  text text not null,
  crisis boolean not null default false,
  created_at timestamptz not null default now(),
  constraint sky_lanterns_text_length check (char_length(btrim(text)) between 2 and 300)
);
create index if not exists sky_lanterns_school_idx on public.sky_lanterns (school_id, created_at desc);
create index if not exists sky_lanterns_school_name_idx on public.sky_lanterns (school_name, created_at desc);
alter table public.sky_lanterns enable row level security;
-- No policies: read and write only through the functions below.

create table if not exists public.lantern_notes (
  id uuid primary key default gen_random_uuid(),
  lantern_id uuid not null references public.sky_lanterns (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete cascade,
  text text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint lantern_notes_text_length check (char_length(btrim(text)) between 1 and 200)
);
create index if not exists lantern_notes_lantern_idx on public.lantern_notes (lantern_id, created_at);
alter table public.lantern_notes enable row level security;

create table if not exists public.lantern_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  lantern_id uuid references public.sky_lanterns (id) on delete cascade,
  note_id uuid references public.lantern_notes (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint lantern_reports_one_target check ((lantern_id is null) <> (note_id is null))
);
create unique index if not exists lantern_reports_unique_lantern on public.lantern_reports (reporter_id, lantern_id) where lantern_id is not null;
create unique index if not exists lantern_reports_unique_note on public.lantern_reports (reporter_id, note_id) where note_id is not null;
alter table public.lantern_reports enable row level security;

-- =====================================================================
-- Crisis signals (kept in step with src/lib/lanterns.ts)
-- =====================================================================
create or replace function public.sounds_like_crisis(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(p_text, ''), '\s+', '', 'g')) ~
    '(killmyself|kms|wanttodie|wannadie|endmylife|enditall|suicid|selfharm|cutmyself|cuttingmyself|hurtmyself|noreasontolive|betteroffwithoutme|dontwanttobehere|disappearforever|죽고싶|자살|자해|살기싫|사라지고싶|없어지고싶|끝내고싶|손목|뛰어내리)';
$$;

-- =====================================================================
-- Guards
-- =====================================================================
create or replace function public.lantern_kind_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_blocked_words(new.text) then
    raise exception 'Let''s keep it kind 💛 Try saying it a different way.';
  end if;
  return new;
end;
$$;
drop trigger if exists lantern_kind_guard on public.sky_lanterns;
create trigger lantern_kind_guard before insert or update on public.sky_lanterns
  for each row execute function public.lantern_kind_guard();
drop trigger if exists lantern_note_kind_guard on public.lantern_notes;
create trigger lantern_note_kind_guard before insert or update on public.lantern_notes
  for each row execute function public.lantern_kind_guard();

-- The lantern is visible to me: same school, still glowing, not reported by me.
create or replace function public.lantern_visible(p_lantern uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sky_lanterns l
    join public.profiles me on me.id = auth.uid()
    where l.id = p_lantern
      and l.created_at > now() - interval '3 days'
      and (
        (me.school_id is not null and me.school_id = l.school_id)
        or (me.school_id is null and me.school_name is not null and me.school_name = l.school_name)
      )
      and not exists (select 1 from public.lantern_reports r where r.lantern_id = l.id and r.reporter_id = auth.uid())
  );
$$;

-- =====================================================================
-- Lanterns
-- =====================================================================
create or replace function public.send_lantern(p_text text)
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
  if (select count(*) from public.sky_lanterns where author_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'You''ve sent up 3 lanterns today — rest a little, they''re glowing 🏮';
  end if;
  insert into public.sky_lanterns (author_id, school_id, school_name, text, crisis)
  values (auth.uid(), v_school_id, v_school_name, btrim(p_text), public.sounds_like_crisis(p_text))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.send_lantern(text) from public;
grant execute on function public.send_lantern(text) to authenticated;

create or replace function public.fetch_lanterns()
returns table (id uuid, text text, crisis boolean, created_at timestamptz, mine boolean, note_count int, noted_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.text, l.crisis, l.created_at,
         l.author_id = auth.uid() as mine,
         (select count(*)::int from public.lantern_notes n where n.lantern_id = l.id and not n.hidden) as note_count,
         exists (select 1 from public.lantern_notes n where n.lantern_id = l.id and n.author_id = auth.uid()) as noted_by_me
  from public.sky_lanterns l
  where public.lantern_visible(l.id)
  order by l.created_at desc
  limit 60;
$$;
revoke all on function public.fetch_lanterns() from public;
grant execute on function public.fetch_lanterns() to authenticated;

create or replace function public.delete_my_lantern(p_lantern uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sky_lanterns where id = p_lantern and author_id = auth.uid();
$$;
revoke all on function public.delete_my_lantern(uuid) from public;
grant execute on function public.delete_my_lantern(uuid) to authenticated;

-- =====================================================================
-- Warm notes
-- =====================================================================
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
    'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received',
    'sky_twinkle', 'wish_cheer', 'lantern_note'
  ));

create or replace function public.add_lantern_note(p_lantern uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.lantern_visible(p_lantern) then
    raise exception 'That lantern has drifted away';
  end if;
  select author_id into v_author from public.sky_lanterns where id = p_lantern;
  if v_author = auth.uid() then
    raise exception 'This is your own lantern';
  end if;
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(auth.uid(), v_author) then
    raise exception 'Unable to send this.';
  end if;
  if (select count(*) from public.lantern_notes where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of notes — take a breather and try again later';
  end if;
  insert into public.lantern_notes (lantern_id, author_id, text) values (p_lantern, auth.uid(), btrim(p_text))
  returning id into v_id;

  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    v_author, auth.uid(), 'lantern_note', null, null, null,
    'Someone sent your lantern a warm note 💛',
    'Open School Sky to read it.'
  );
  return v_id;
end;
$$;
revoke all on function public.add_lantern_note(uuid, text) from public;
grant execute on function public.add_lantern_note(uuid, text) to authenticated;

-- Notes on a lantern, with who wrote them. The lantern's writer also sees
-- notes they've hidden (so they can bring one back); others don't.
create or replace function public.fetch_lantern_notes(p_lantern uuid)
returns table (id uuid, text text, created_at timestamptz, hidden boolean, mine boolean,
               author_id uuid, author_name text, author_avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.text, n.created_at, n.hidden, n.author_id = auth.uid() as mine,
         p.id, p.full_name, p.avatar_url
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

-- The lantern's writer can hide (or un-hide) any note on it.
create or replace function public.set_lantern_note_hidden(p_note uuid, p_hidden boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lantern_notes n set hidden = p_hidden
  from public.sky_lanterns l
  where n.id = p_note and l.id = n.lantern_id and l.author_id = auth.uid();
$$;
revoke all on function public.set_lantern_note_hidden(uuid, boolean) from public;
grant execute on function public.set_lantern_note_hidden(uuid, boolean) to authenticated;

create or replace function public.delete_my_lantern_note(p_note uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.lantern_notes where id = p_note and author_id = auth.uid();
$$;
revoke all on function public.delete_my_lantern_note(uuid) from public;
grant execute on function public.delete_my_lantern_note(uuid) to authenticated;

-- =====================================================================
-- Reports (hide for the reporter; kept for review)
-- =====================================================================
create or replace function public.report_lantern(p_lantern uuid default null, p_note uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if (p_lantern is null) = (p_note is null) then
    raise exception 'Report one thing at a time';
  end if;
  if (select count(*) from public.lantern_reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of reports — try again later';
  end if;
  insert into public.lantern_reports (reporter_id, lantern_id, note_id) values (auth.uid(), p_lantern, p_note)
  on conflict do nothing;
end;
$$;
revoke all on function public.report_lantern(uuid, uuid) from public;
grant execute on function public.report_lantern(uuid, uuid) to authenticated;
