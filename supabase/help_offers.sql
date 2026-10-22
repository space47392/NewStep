-- Help offers: several classmates can offer to help with a Need Help post,
-- and the person who asked picks the one they want. Run AFTER
-- school_sky_lanterns_care.sql. Safe to run more than once.
--
--   * volunteer_to_help() now records an OFFER (the post stays 'open') and
--     tells the author someone offered.
--   * choose_helper() — author only — picks one offer: sets helper_id and
--     moves the post to 'accepted' (the existing lifecycle continues from
--     there: mark_post_completed, points, help history, thanks).
--   * The chosen helper is told they were picked.
--   * posts.help_offer_count keeps a count for lists.

-- =====================================================================
-- Table
-- =====================================================================
create table if not exists public.help_offers (
  post_id uuid not null references public.posts (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  primary key (post_id, helper_id),
  constraint help_offers_message_length check (message is null or char_length(btrim(message)) between 1 and 140)
);
create index if not exists help_offers_helper_idx on public.help_offers (helper_id);
alter table public.help_offers enable row level security;
-- No policies: read and write only through the functions below.

alter table public.posts add column if not exists help_offer_count integer not null default 0;

create or replace function public.sync_help_offer_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts
  set help_offer_count = (select count(*) from public.help_offers o where o.post_id = coalesce(new.post_id, old.post_id))
  where id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;
drop trigger if exists help_offers_count on public.help_offers;
create trigger help_offers_count after insert or delete on public.help_offers
  for each row execute function public.sync_help_offer_count();

-- Kind-words filter on the optional message.
create or replace function public.help_offer_kind_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message is not null and public.has_blocked_words(new.message) then
    raise exception 'Let''s keep it kind 💛 Try saying it a different way.';
  end if;
  return new;
end;
$$;
drop trigger if exists help_offer_kind_guard on public.help_offers;
create trigger help_offer_kind_guard before insert or update on public.help_offers
  for each row execute function public.help_offer_kind_guard();

-- =====================================================================
-- Notifications
-- =====================================================================
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
    'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received',
    'sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks', 'helper_chosen'
  ));

-- The post moving open -> accepted now means the author picked someone:
-- tell the chosen helper (the author is the actor).
create or replace function public.notify_volunteer_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_first text;
begin
  if new.status = 'accepted' and old.status = 'open' and new.helper_id is not null then
    select nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '') into v_author_first
    from public.profiles where id = new.author_id;
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.helper_id, new.author_id, 'helper_chosen', new.id, null, null,
      coalesce(v_author_first, 'Someone') || ' picked you to help 🤝',
      'Say hi and work it out together.'
    );
  end if;
  return new;
end;
$$;

-- =====================================================================
-- Offer, withdraw, choose
-- =====================================================================
drop function if exists public.volunteer_to_help(uuid);
create or replace function public.volunteer_to_help(p_post_id uuid, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to offer help.';
  end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found.';
  end if;
  if v_post.category is distinct from 'Need Help' then
    raise exception 'Only Need Help posts can get offers.';
  end if;
  if v_post.status is distinct from 'open' then
    raise exception 'This request already has a helper.';
  end if;
  if v_post.author_id = v_uid then
    raise exception 'You cannot offer to help with your own request.';
  end if;
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(v_uid, v_post.author_id) then
    raise exception 'Unable to offer help here.';
  end if;
  if exists (select 1 from public.help_offers where post_id = p_post_id and helper_id = v_uid) then
    return;
  end if;
  if (select count(*) from public.help_offers where helper_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of offers — try again a little later.';
  end if;

  insert into public.help_offers (post_id, helper_id, message)
  values (p_post_id, v_uid, nullif(btrim(coalesce(p_message, '')), ''));

  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    v_post.author_id, v_uid, 'volunteer', p_post_id, null, null,
    'Someone offered to help 🤝', 'Open your request to choose a helper.'
  );
end;
$$;
revoke all on function public.volunteer_to_help(uuid, text) from public;
grant execute on function public.volunteer_to_help(uuid, text) to authenticated;

create or replace function public.withdraw_help_offer(p_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.help_offers o
  using public.posts p
  where o.post_id = p_post_id and o.helper_id = auth.uid()
    and p.id = o.post_id and p.status = 'open';
$$;
revoke all on function public.withdraw_help_offer(uuid) from public;
grant execute on function public.withdraw_help_offer(uuid) to authenticated;

create or replace function public.choose_helper(p_post_id uuid, p_helper_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found.';
  end if;
  if v_post.author_id <> auth.uid() then
    raise exception 'Only the person who asked can choose a helper.';
  end if;
  if v_post.status is distinct from 'open' then
    raise exception 'This request already has a helper.';
  end if;
  if not exists (select 1 from public.help_offers where post_id = p_post_id and helper_id = p_helper_id) then
    raise exception 'That person hasn''t offered to help.';
  end if;
  update public.posts set helper_id = p_helper_id, status = 'accepted' where id = p_post_id;
end;
$$;
revoke all on function public.choose_helper(uuid, uuid) from public;
grant execute on function public.choose_helper(uuid, uuid) to authenticated;

-- Offers on a post. The author sees everyone (with how many people each
-- has helped before); anyone else sees only their own offer.
create or replace function public.fetch_help_offers(p_post_id uuid)
returns table (helper_id uuid, full_name text, avatar_url text, grade text, message text,
               created_at timestamptz, helped_count integer, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.helper_id, p.full_name, p.avatar_url, p.grade, o.message, o.created_at,
         (select count(*)::int from public.help_history h where h.helper_id = o.helper_id) as helped_count,
         o.helper_id = auth.uid() as mine
  from public.help_offers o
  join public.posts po on po.id = o.post_id
  left join public.profiles p on p.id = o.helper_id
  where o.post_id = p_post_id
    and (po.author_id = auth.uid() or o.helper_id = auth.uid())
  order by o.created_at;
$$;
revoke all on function public.fetch_help_offers(uuid) from public;
grant execute on function public.fetch_help_offers(uuid) to authenticated;

-- Which open requests I've already offered on (for the 'Offered' state in lists).
create or replace function public.my_help_offer_post_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select post_id from public.help_offers where helper_id = auth.uid();
$$;
revoke all on function public.my_help_offer_post_ids() from public;
grant execute on function public.my_help_offer_post_ids() to authenticated;
