-- Notification settings: turn push off by kind, or pause all of it for a bit.
--
-- Only the push (the banner on the phone) is affected. Everything still lands
-- in the in-app Notifications list, so nothing is lost.
--
-- Enforced inside send_push_notification(), which every push goes through.
-- The type → category mapping must match NOTIFICATION_CATEGORIES in
-- src/lib/notificationPrefs.ts (a unit test checks this).
--
-- Safe to run more than once. Replaces send_push_notification() (same
-- signature, same error handling as push_notification_resilience_fix.sql).

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  muted text[] not null default '{}',
  paused_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists "Students can see their own notification settings" on public.notification_prefs;
create policy "Students can see their own notification settings"
  on public.notification_prefs for select to authenticated
  using (user_id = auth.uid());
-- Writes only go through set_notification_prefs().

-- Which settings group a notification type belongs to.
create or replace function public.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('message') then 'messages'
    when p_type in ('buddy_request', 'buddy_accepted') then 'buddies'
    when p_type in ('volunteer', 'help_completed', 'helper_chosen', 'thanks_received', 'points_earned') then 'help'
    when p_type in ('like', 'comment', 'follow', 'story_wave') then 'social'
    when p_type in ('sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks') then 'sky'
    when p_type in ('achievement_earned') then 'achievements'
    else null
  end;
$$;

create or replace function public.set_notification_prefs(p_muted text[], p_paused_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_muted, '{}')) m
    where m not in ('messages', 'buddies', 'help', 'social', 'sky', 'achievements')
  ) then
    raise exception 'Unknown notification setting.';
  end if;
  -- A pause is for a break, not forever: at most a week.
  if p_paused_until is not null and p_paused_until > now() + interval '7 days' then
    raise exception 'A pause can be at most a week.';
  end if;
  insert into public.notification_prefs (user_id, muted, paused_until, updated_at)
  values (auth.uid(), coalesce(p_muted, '{}'), p_paused_until, now())
  on conflict (user_id) do update
    set muted = excluded.muted, paused_until = excluded.paused_until, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.set_notification_prefs(text[], timestamptz) from public, anon;
grant execute on function public.set_notification_prefs(text[], timestamptz) to authenticated;

create or replace function public.send_push_notification(
  target_user_id uuid,
  title text,
  body text,
  data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  push_token text;
  v_prefs public.notification_prefs;
begin
  select expo_push_token into push_token from public.profiles where id = target_user_id;
  if push_token is null then
    return;
  end if;

  -- The student's own settings: paused, or this kind turned off.
  select * into v_prefs from public.notification_prefs where user_id = target_user_id;
  if v_prefs.user_id is not null then
    if v_prefs.paused_until is not null and v_prefs.paused_until > now() then
      return;
    end if;
    if public.notification_category(data ->> 'type') = any (v_prefs.muted) then
      return;
    end if;
  end if;

  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'to', push_token,
        'title', title,
        'body', body,
        'data', data
      )
    );
  exception when others then
    raise warning 'send_push_notification: net.http_post failed for user %: %', target_user_id, sqlerrm;
  end;
end;
$$;
