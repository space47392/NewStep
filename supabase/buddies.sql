-- Buddies: a classmate to walk with you through your first weeks.
--
--  * Anyone can say "I'm happy to be a buddy" (buddy_volunteers), with a
--    short intro.
--  * A student looking for one sees volunteers from their school, best
--    matches first (shared interests, then nearby grade), and asks one.
--  * The buddy accepts or says not right now. Once accepted, both see each
--    other as buddies until either side ends it.
--
-- All writes go through the functions below (no insert/update policies), so
-- the rules — same school, not blocked, one open ask at a time, a buddy
-- takes at most 3 students — can't be skipped.

-- 1. Volunteers ------------------------------------------------------------
create table if not exists public.buddy_volunteers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  intro text check (intro is null or char_length(intro) <= 140),
  created_at timestamptz not null default now()
);
alter table public.buddy_volunteers enable row level security;
drop policy if exists "Signed-in users can see buddy volunteers" on public.buddy_volunteers;
create policy "Signed-in users can see buddy volunteers"
  on public.buddy_volunteers for select to authenticated using (true);

-- 2. Pairs -------------------------------------------------------------------
create table if not exists public.buddy_pairs (
  id uuid primary key default gen_random_uuid(),
  newcomer_id uuid not null references public.profiles (id) on delete cascade,
  buddy_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'asked' check (status in ('asked', 'active', 'declined', 'ended')),
  message text check (message is null or char_length(message) <= 200),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint buddy_not_self check (newcomer_id <> buddy_id)
);
-- One open ask or active buddy per student.
create unique index if not exists buddy_pairs_one_open
  on public.buddy_pairs (newcomer_id) where status in ('asked', 'active');
create index if not exists buddy_pairs_buddy_idx on public.buddy_pairs (buddy_id, status);

alter table public.buddy_pairs enable row level security;
drop policy if exists "People in a buddy pair can see it" on public.buddy_pairs;
create policy "People in a buddy pair can see it"
  on public.buddy_pairs for select to authenticated
  using (auth.uid() = newcomer_id or auth.uid() = buddy_id);

-- 3. Notification types ------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
    'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received',
    'sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks', 'helper_chosen',
    'buddy_request', 'buddy_accepted'
  ));

-- 4. Functions ---------------------------------------------------------------

-- Turn "I'm happy to be a buddy" on or off.
create or replace function public.set_buddy_volunteer(p_on boolean, p_intro text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_on then
    insert into public.buddy_volunteers (user_id, intro)
    values (auth.uid(), nullif(btrim(coalesce(p_intro, '')), ''))
    on conflict (user_id) do update set intro = excluded.intro;
  else
    delete from public.buddy_volunteers where user_id = auth.uid();
  end if;
end;
$$;
revoke all on function public.set_buddy_volunteer(boolean, text) from public, anon;
grant execute on function public.set_buddy_volunteer(boolean, text) to authenticated;

-- Volunteers at my school I could ask, best matches first.
create or replace function public.suggest_buddies()
returns table (
  user_id uuid,
  full_name text,
  username text,
  avatar_url text,
  grade text,
  interests text[],
  intro text,
  shared_interests text[],
  helped_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null or v_me.school_id is null then
    return;
  end if;
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  return query
  select
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    p.grade,
    coalesce(p.interests, '{}'),
    v.intro,
    array(select unnest(coalesce(p.interests, '{}')) intersect select unnest(coalesce(v_me.interests, '{}'))),
    (select count(*) from public.buddy_pairs bp where bp.buddy_id = p.id and bp.status in ('active', 'ended'))
  from public.buddy_volunteers v
  join public.profiles p on p.id = v.user_id
  where p.school_id = v_me.school_id
    and p.id <> v_me.id
    and not public.users_blocked(v_me.id, p.id)
    and (select count(*) from public.buddy_pairs bp where bp.buddy_id = p.id and bp.status = 'active') < 3
  order by
    cardinality(array(select unnest(coalesce(p.interests, '{}')) intersect select unnest(coalesce(v_me.interests, '{}')))) desc,
    abs(coalesce(nullif(regexp_replace(coalesce(p.grade, ''), '\D', '', 'g'), '')::int, 99)
      - coalesce(nullif(regexp_replace(coalesce(v_me.grade, ''), '\D', '', 'g'), '')::int, 99)) asc,
    v.created_at asc
  limit 12;
end;
$$;
revoke all on function public.suggest_buddies() from public, anon;
grant execute on function public.suggest_buddies() to authenticated;

-- Ask someone to be my buddy.
create or replace function public.ask_buddy(p_buddy uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_my_school uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;
  if p_buddy = v_uid then
    raise exception 'You can''t be your own buddy.';
  end if;
  if not exists (select 1 from public.buddy_volunteers where user_id = p_buddy) then
    raise exception 'They aren''t taking new buddies right now.';
  end if;
  select school_id into v_my_school from public.profiles where id = v_uid;
  if v_my_school is null or v_my_school is distinct from (select school_id from public.profiles where id = p_buddy) then
    raise exception 'Buddies are from your own school.';
  end if;
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(v_uid, p_buddy) then
    raise exception 'Unable to ask this person.';
  end if;
  if exists (select 1 from public.buddy_pairs where newcomer_id = v_uid and status in ('asked', 'active')) then
    raise exception 'You already have a buddy or an ask waiting.';
  end if;
  if (select count(*) from public.buddy_pairs where buddy_id = p_buddy and status = 'active') >= 3 then
    raise exception 'They already have a full set of buddies.';
  end if;
  if (select count(*) from public.buddy_pairs where newcomer_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Give it a little time before asking someone else.';
  end if;

  insert into public.buddy_pairs (newcomer_id, buddy_id, message)
  values (v_uid, p_buddy, nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_id;

  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    p_buddy, v_uid, 'buddy_request', null, null, null,
    'Someone would love a buddy 🤝', 'A classmate new to school asked you to be their buddy.'
  );
  return v_id;
end;
$$;
revoke all on function public.ask_buddy(uuid, text) from public, anon;
grant execute on function public.ask_buddy(uuid, text) to authenticated;

-- The buddy says yes or not right now.
create or replace function public.respond_buddy(p_pair uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair public.buddy_pairs;
begin
  select * into v_pair from public.buddy_pairs where id = p_pair for update;
  if v_pair.id is null or v_pair.buddy_id is distinct from auth.uid() then
    raise exception 'Request not found.';
  end if;
  if v_pair.status <> 'asked' then
    return;
  end if;
  if p_accept and (select count(*) from public.buddy_pairs where buddy_id = v_pair.buddy_id and status = 'active') >= 3 then
    raise exception 'You already have 3 buddies.';
  end if;

  update public.buddy_pairs
  set status = case when p_accept then 'active' else 'declined' end, responded_at = now()
  where id = p_pair;

  if p_accept then
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      v_pair.newcomer_id, v_pair.buddy_id, 'buddy_accepted', null, null, null,
      'You have a buddy 💛', 'Say hi — they''re here to help you settle in.'
    );
  end if;
end;
$$;
revoke all on function public.respond_buddy(uuid, boolean) from public, anon;
grant execute on function public.respond_buddy(uuid, boolean) to authenticated;

-- Either side can end it (or the newcomer can take back an ask).
create or replace function public.end_buddy(p_pair uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.buddy_pairs
  set status = 'ended', responded_at = coalesce(responded_at, now())
  where id = p_pair
    and status in ('asked', 'active')
    and (newcomer_id = auth.uid() or buddy_id = auth.uid());
end;
$$;
revoke all on function public.end_buddy(uuid) from public, anon;
grant execute on function public.end_buddy(uuid) to authenticated;
