-- Voice calls between two students who have talked.
--
-- The audio itself goes straight between the two phones (WebRTC). This file
-- only decides who may call whom, keeps a record of each call, and carries
-- the short connection messages ("signals") the phones swap to find each
-- other. Nothing is recorded.
--
-- Who can call: two people who have BOTH sent at least one message in their
-- chat, who haven't blocked each other, and only if the person being called
-- hasn't turned calls off (notification_prefs.calls_off). Deleted messages
-- still count: they show the two really talked.
--
-- Signals go through call_signals instead of an open realtime channel,
-- because Realtime applies RLS to inserts: only the two people on the call
-- ever receive them.
--
-- Run after school_vouches.sql. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references public.profiles (id) on delete set null,
  callee_id uuid references public.profiles (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null default 'audio' check (kind in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'missed', 'cancelled', 'ended')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index if not exists calls_callee_idx on public.calls (callee_id, created_at desc);
create index if not exists calls_caller_idx on public.calls (caller_id, created_at desc);

create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('offer', 'answer', 'ice')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists call_signals_call_idx on public.call_signals (call_id, id);

alter table public.calls enable row level security;
alter table public.call_signals enable row level security;

drop policy if exists "Call participants can see their calls" on public.calls;
create policy "Call participants can see their calls"
  on public.calls for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());

-- Only the other person's signals: never your own echoed back.
drop policy if exists "Call participants receive the other side's signals" on public.call_signals;
create policy "Call participants receive the other side's signals"
  on public.call_signals for select to authenticated
  using (
    sender_id <> auth.uid()
    and exists (select 1 from public.calls c where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid()))
  );
-- No insert/update/delete policies: only through the functions below.

-- "Don't let anyone call me".
alter table public.notification_prefs add column if not exists calls_off boolean not null default false;

-- A call notification ("Wooju is calling"), grouped with messages in settings.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
    'achievement_earned', 'message', 'follow', 'story_wave', 'thanks_received',
    'sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks', 'helper_chosen',
    'buddy_request', 'buddy_accepted', 'call'
  ));

create or replace function public.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('message', 'call') then 'messages'
    when p_type in ('buddy_request', 'buddy_accepted') then 'buddies'
    when p_type in ('volunteer', 'help_completed', 'helper_chosen', 'thanks_received', 'points_earned') then 'help'
    when p_type in ('like', 'comment', 'follow', 'story_wave') then 'social'
    when p_type in ('sky_twinkle', 'wish_cheer', 'lantern_note', 'lantern_thanks') then 'sky'
    when p_type in ('achievement_earned') then 'achievements'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call whom
-- ---------------------------------------------------------------------------

-- Internal: the conversation between two people if both have written in it.
create or replace function public.mutual_conversation(p_a uuid, p_b uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.conversations c
   where c.user1_id = least(p_a, p_b) and c.user2_id = greatest(p_a, p_b)
     and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = p_a)
     and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = p_b);
$$;
revoke all on function public.mutual_conversation(uuid, uuid) from public, anon, authenticated;

-- For the chat header: can I call this person right now? Returns null when
-- yes, or a short reason the app can show.
create or replace function public.call_blocker(p_other uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return 'Sign in to call.';
  end if;
  if p_other is null or p_other = auth.uid() then
    return 'You can''t call yourself.';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
       or (b.blocker_id = p_other and b.blocked_id = auth.uid())
  ) then
    return 'You can''t call this person.';
  end if;
  if public.mutual_conversation(auth.uid(), p_other) is null then
    return 'You can call once you''ve both sent a message.';
  end if;
  if coalesce((select calls_off from public.notification_prefs where user_id = p_other), false) then
    return 'They''re not taking calls right now.';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Call lifecycle
-- ---------------------------------------------------------------------------

-- Ringing calls nobody answered become missed, and a call still 'accepted'
-- after 4 hours is one whose phones both went away without hanging up.
-- Both free the two people up for new calls.
create or replace function public.expire_ringing_calls()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.calls set status = 'missed', ended_at = now()
   where status = 'ringing' and created_at < now() - interval '45 seconds';
  update public.calls set status = 'ended', ended_at = now()
   where status = 'accepted' and answered_at < now() - interval '4 hours';
$$;
revoke all on function public.expire_ringing_calls() from public, anon, authenticated;

create or replace function public.start_call(p_callee uuid, p_kind text default 'audio')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_call uuid;
  v_name text;
  v_conversation uuid;
begin
  v_reason := public.call_blocker(p_callee);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;
  if p_kind not in ('audio', 'video') then
    raise exception 'Unknown call type.';
  end if;
  if (select count(*) from public.calls where caller_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of calls this hour. Try again a bit later.';
  end if;

  perform public.expire_ringing_calls();
  if exists (
    select 1 from public.calls
    where status in ('ringing', 'accepted')
      and (caller_id in (auth.uid(), p_callee) or callee_id in (auth.uid(), p_callee))
  ) then
    raise exception 'One of you is already on a call.';
  end if;

  v_conversation := public.mutual_conversation(auth.uid(), p_callee);
  insert into public.calls (caller_id, callee_id, conversation_id, kind)
  values (auth.uid(), p_callee, v_conversation, p_kind)
  returning id into v_call;

  select coalesce(nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), ''), 'Someone') into v_name
    from public.profiles where id = auth.uid();
  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    p_callee, auth.uid(), 'call', null, v_conversation, null,
    case when p_kind = 'video' then v_name || ' is video calling 📹' else v_name || ' is calling 📞' end,
    'Open NewStep to answer.'
  );
  return v_call;
end;
$$;

-- The person being called answers or declines.
create or replace function public.answer_call(p_call uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.expire_ringing_calls();
  update public.calls
     set status = case when p_accept then 'accepted' else 'declined' end,
         answered_at = case when p_accept then now() else null end,
         ended_at = case when p_accept then null else now() end
   where id = p_call and callee_id = auth.uid() and status = 'ringing'
  returning status into v_status;
  if v_status is null then
    raise exception 'This call has ended.';
  end if;
  return v_status;
end;
$$;

-- Either side hangs up. A caller hanging up before an answer is 'cancelled'.
create or replace function public.end_call(p_call uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.calls
     set status = case when status = 'ringing' then 'cancelled' else 'ended' end,
         ended_at = now()
   where id = p_call and (caller_id = auth.uid() or callee_id = auth.uid()) and status in ('ringing', 'accepted');
$$;

create or replace function public.send_call_signal(p_call uuid, p_kind text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.calls
    where id = p_call and (caller_id = auth.uid() or callee_id = auth.uid()) and status in ('ringing', 'accepted')
  ) then
    raise exception 'This call has ended.';
  end if;
  if (select count(*) from public.call_signals where call_id = p_call and sender_id = auth.uid()) >= 200 then
    raise exception 'Too many connection messages.';
  end if;
  insert into public.call_signals (call_id, sender_id, kind, payload) values (p_call, auth.uid(), p_kind, p_payload);
end;
$$;

-- A call ringing for me right now (opening the app from the push). Timed by
-- the server's clock, not the phone's, which may be off.
create or replace function public.my_ringing_call()
returns setof public.calls
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_ringing_calls();
  return query
    select * from public.calls
     where callee_id = auth.uid() and status = 'ringing'
     order by created_at desc
     limit 1;
end;
$$;

-- When the app opens it isn't on a call, so anything still open from before
-- (the app was closed mid-call) is over. A call ringing FOR me stays: I may
-- have opened the app to answer it.
create or replace function public.end_my_stale_calls()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.calls
     set status = case when status = 'ringing' then 'cancelled' else 'ended' end,
         ended_at = now()
   where (status = 'accepted' and (caller_id = auth.uid() or callee_id = auth.uid()))
      or (status = 'ringing' and caller_id = auth.uid());
$$;

-- "Allow calls" in Notification settings.
create or replace function public.set_calls_off(p_off boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  insert into public.notification_prefs (user_id, calls_off, updated_at) values (auth.uid(), p_off, now())
  on conflict (user_id) do update set calls_off = excluded.calls_off, updated_at = excluded.updated_at;
end;
$$;

-- Live: a ringing call reaching the callee, status changes, and signals.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls') then
    alter publication supabase_realtime add table public.calls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_signals') then
    alter publication supabase_realtime add table public.call_signals;
  end if;
end;
$$;

revoke all on function public.call_blocker(uuid) from public, anon;
grant execute on function public.call_blocker(uuid) to authenticated;
revoke all on function public.start_call(uuid, text) from public, anon;
grant execute on function public.start_call(uuid, text) to authenticated;
revoke all on function public.answer_call(uuid, boolean) from public, anon;
grant execute on function public.answer_call(uuid, boolean) to authenticated;
revoke all on function public.end_call(uuid) from public, anon;
grant execute on function public.end_call(uuid) to authenticated;
revoke all on function public.send_call_signal(uuid, text, jsonb) from public, anon;
grant execute on function public.send_call_signal(uuid, text, jsonb) to authenticated;
revoke all on function public.my_ringing_call() from public, anon;
grant execute on function public.my_ringing_call() to authenticated;
revoke all on function public.end_my_stale_calls() from public, anon;
grant execute on function public.end_my_stale_calls() to authenticated;
revoke all on function public.set_calls_off(boolean) from public, anon;
grant execute on function public.set_calls_off(boolean) to authenticated;
