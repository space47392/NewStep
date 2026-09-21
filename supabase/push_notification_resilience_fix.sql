-- Push notification resilience fix (real remote push pipeline hardening).
--
-- Context: profiles.expo_push_token + send_push_notification() (pg_net,
-- calling Expo's push API directly from Postgres) + create_notification()
-- (the single trusted entry point every notification-generating trigger
-- already routes through — like/comment/volunteer/message/help_completed/
-- points_earned/achievement_earned/follow/story_wave/thanks_received) were
-- ALL already built and wired in earlier steps (push_notifications_schema.sql,
-- notifications_schema.sql, notifications_push_payload_fix.sql,
-- follows_schema.sql, thanks_received_schema.sql, story_wave_schema.sql).
-- That existing architecture is correct and is NOT replaced here — no
-- Database Webhook / Edge Function is introduced, since it would just be a
-- second, redundant path sending the same push twice.
--
-- The one concrete gap: create_notification() calls send_push_notification()
-- with no exception handling around it. pg_net's net.http_post() itself is
-- async (queues the request and returns immediately — it does not raise just
-- because Expo's delivery ultimately fails), so this is a narrow risk, but if
-- anything in this call DID throw for any reason (the pg_net extension
-- misbehaving, a malformed call, a database-level issue), the exception would
-- propagate up through create_notification() and roll back the whole
-- transaction — including the public.notifications row insert that already
-- happened earlier in the SAME function. That row is the real source of
-- truth (the in-app Notifications list) and must never be lost just because
-- the best-effort push side-channel had a problem.
--
-- Fix: wrap the net.http_post() call in its own begin/exception block, right
-- where the push actually happens, so send_push_notification() can never
-- throw upward to whatever inserted the notification it's attached to. A
-- failure here is logged via `raise warning` (visible in Supabase's Postgres
-- logs, no secrets included) and otherwise silently swallowed — matching the
-- same "best-effort, asynchronous, never blocks the real write" principle
-- already documented on this function. Same signature, same behavior for the
-- success path — CREATE OR REPLACE, no new column/table/trigger.
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
begin
  select expo_push_token into push_token from public.profiles where id = target_user_id;

  if push_token is not null then
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
  end if;
end;
$$;
