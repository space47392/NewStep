-- 1. Where each user's device push token is stored (set by the app after they grant permission)
alter table public.profiles add column expo_push_token text;

-- 2. pg_net lets Postgres make outbound HTTP requests directly from a trigger —
--    this is what calls Expo's push API, no separate server/Edge Function needed.
create extension if not exists pg_net;

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
  end if;
end;
$$;

-- 3. Notify the post's author when someone comments (skip self-comments)
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  commenter_name text;
begin
  select author_id into post_author_id from public.posts where id = new.post_id;

  if post_author_id is not null and post_author_id <> new.author_id then
    select full_name into commenter_name from public.profiles where id = new.author_id;
    perform public.send_push_notification(
      post_author_id,
      'New comment',
      coalesce(commenter_name, 'Someone') || ' commented on your post',
      jsonb_build_object('type', 'comment', 'post_id', new.post_id)
    );
  end if;

  return new;
end;
$$;

create trigger on_comment_created_notify
  after insert on public.comments
  for each row execute function public.notify_new_comment();

-- 4. Notify the post's author when someone volunteers (open -> accepted transition)
create or replace function public.notify_volunteer_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  helper_name text;
begin
  if new.status = 'accepted' and old.status = 'open' and new.helper_id is not null then
    select full_name into helper_name from public.profiles where id = new.helper_id;
    perform public.send_push_notification(
      new.author_id,
      'Someone is helping!',
      coalesce(helper_name, 'A student') || ' volunteered to help with your request',
      jsonb_build_object('type', 'volunteer', 'post_id', new.id)
    );
  end if;

  return new;
end;
$$;

create trigger on_post_volunteered_notify
  after update on public.posts
  for each row execute function public.notify_volunteer_accepted();

-- 5. Notify the other participant when a new message arrives
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  sender_name text;
begin
  select case when c.user1_id = new.sender_id then c.user2_id else c.user1_id end
  into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient_id is not null then
    select full_name into sender_name from public.profiles where id = new.sender_id;
    perform public.send_push_notification(
      recipient_id,
      coalesce(sender_name, 'New message'),
      new.content,
      jsonb_build_object('type', 'message', 'conversation_id', new.conversation_id)
    );
  end if;

  return new;
end;
$$;

create trigger on_message_created_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();
