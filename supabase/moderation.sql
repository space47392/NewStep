-- Report review for moderators.
--
-- Reports land in four places: public.reports (posts, comments, stories,
-- profiles, messages), sky_wish_reports, lantern_reports (lanterns and their
-- notes) and school_tip_reports. moderation_queue() gathers them into one
-- list, one row per reported thing (three reports on a post = one row,
-- count 3). moderate() dismisses or removes it and logs who did what in
-- moderation_actions. Reports that arrive after an action bring the thing
-- back to the queue.
--
-- Only profiles.role in ('moderator', 'admin') can use any of this. Making
-- someone a moderator happens here in the SQL editor (set_user_role, which
-- the app can't call):
--   select public.set_user_role('their-email@example.com', 'moderator');
--
-- Kinds must match MODERATION_KINDS in src/lib/moderation.ts (a test checks).
-- Run after function_privileges_hardening.sql. Safe to run more than once.

-- Who did what, and when.
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('post', 'comment', 'story', 'profile', 'message', 'wish', 'lantern', 'lantern_note', 'tip')),
  target_id uuid not null,
  action text not null check (action in ('dismiss', 'remove', 'reviewed')),
  moderator_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_target_idx on public.moderation_actions (kind, target_id, created_at desc);
alter table public.moderation_actions enable row level security;
-- No policies: read and written only through the functions below.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- The role guard now lets exactly one path through: set_user_role().
create or replace function public.guard_profile_role_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_role_change', true), 'off') = 'on' then
    return new;
  end if;
  raise exception 'profiles.role cannot be modified directly.';
end;
$$;

-- SQL editor only (no grants): promote or demote by email.
create or replace function public.set_user_role(p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_role not in ('user', 'moderator', 'admin') then
    raise exception 'Role must be user, moderator or admin.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No account with that email.';
  end if;
  perform set_config('newstep.allow_role_change', 'on', true);
  update public.profiles set role = p_role where id = v_id;
  perform set_config('newstep.allow_role_change', 'off', true);
  return p_role;
end;
$$;
revoke all on function public.set_user_role(text, text) from public, anon, authenticated;

-- My own role, so the app knows whether to show "Review reports".
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator', 'admin'));
$$;
revoke all on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------

create or replace function public.moderation_queue()
returns table (
  kind text,
  target_id uuid,
  preview text,
  author_id uuid,
  author_name text,
  report_count integer,
  reasons text[],
  last_reported timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can review reports.';
  end if;

  return query
  with raw as (
    select r.target_type as kind,
           coalesce(r.post_id, r.comment_id, r.story_id, r.reported_user_id, r.message_id) as target_id,
           r.reason || coalesce(': ' || nullif(btrim(r.details), ''), '') as reason,
           r.created_at
      from public.reports r
    union all
    select 'wish', w.wish_id, coalesce(nullif(btrim(w.reason), ''), 'reported'), w.created_at from public.sky_wish_reports w
    union all
    select case when l.lantern_id is not null then 'lantern' else 'lantern_note' end,
           coalesce(l.lantern_id, l.note_id), 'reported', l.created_at
      from public.lantern_reports l
    union all
    select 'tip', t.tip_id, coalesce(nullif(btrim(t.reason), ''), 'reported'), t.created_at from public.school_tip_reports t
  ),
  -- Only reports newer than the last action on that thing are still open.
  open as (
    select raw.* from raw
    where raw.target_id is not null
      and raw.created_at > coalesce(
        (select max(a.created_at) from public.moderation_actions a where a.kind = raw.kind and a.target_id = raw.target_id),
        '-infinity'::timestamptz)
  ),
  grouped as (
    select o.kind, o.target_id, count(*)::int as report_count,
           array_agg(distinct o.reason) as reasons, max(o.created_at) as last_reported
      from open o
     group by o.kind, o.target_id
  ),
  content as (
    select g.*,
      case g.kind
        when 'post' then (select p.content from public.posts p where p.id = g.target_id)
        when 'comment' then (select c.content from public.comments c where c.id = g.target_id)
        when 'story' then '📷 Story photo'
        when 'profile' then (select coalesce(p.full_name, '') || coalesce(' (@' || p.username || ')', '') from public.profiles p where p.id = g.target_id)
        -- Only the reported message itself, never the rest of the chat.
        when 'message' then (select coalesce(nullif(m.content, ''), case when m.audio_path is not null then '🎤 Voice message' when m.photo_path is not null then '📷 Photo' end) from public.messages m where m.id = g.target_id)
        when 'wish' then (select w.text from public.sky_wishes w where w.id = g.target_id)
        when 'lantern' then (select l.text from public.sky_lanterns l where l.id = g.target_id)
        when 'lantern_note' then (select n.text from public.lantern_notes n where n.id = g.target_id)
        when 'tip' then (select t.title || coalesce(' — ' || t.body, '') from public.school_tips t where t.id = g.target_id)
      end as preview,
      case g.kind
        when 'post' then (select p.author_id from public.posts p where p.id = g.target_id)
        when 'comment' then (select c.author_id from public.comments c where c.id = g.target_id)
        when 'story' then (select s.author_id from public.stories s where s.id = g.target_id)
        when 'profile' then g.target_id
        when 'message' then (select m.sender_id from public.messages m where m.id = g.target_id)
        when 'wish' then (select w.author_id from public.sky_wishes w where w.id = g.target_id)
        when 'lantern' then (select l.author_id from public.sky_lanterns l where l.id = g.target_id)
        when 'lantern_note' then (select n.author_id from public.lantern_notes n where n.id = g.target_id)
        when 'tip' then (select t.author_id from public.school_tips t where t.id = g.target_id)
      end as author_id
    from grouped g
  )
  select c.kind, c.target_id, c.preview, c.author_id,
         (select p.full_name from public.profiles p where p.id = c.author_id),
         c.report_count, c.reasons, c.last_reported
    from content c
   order by c.report_count desc, c.last_reported desc
   limit 200;
end;
$$;
revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

-- ---------------------------------------------------------------------------
-- Acting on a report
-- ---------------------------------------------------------------------------

-- 'dismiss': it's fine. 'remove': delete it (not for profiles). 'reviewed':
-- seen, nothing to delete (e.g. a profile to keep an eye on).
create or replace function public.moderate(p_kind text, p_target uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can review reports.';
  end if;
  if p_kind not in ('post', 'comment', 'story', 'profile', 'message', 'wish', 'lantern', 'lantern_note', 'tip') then
    raise exception 'Unknown kind.';
  end if;
  if p_action not in ('dismiss', 'remove', 'reviewed') then
    raise exception 'Unknown action.';
  end if;
  if p_action = 'remove' and p_kind = 'profile' then
    raise exception 'Accounts can''t be removed from here.';
  end if;

  if p_action = 'remove' then
    case p_kind
      when 'post' then delete from public.posts where id = p_target;
      when 'comment' then delete from public.comments where id = p_target;
      when 'story' then delete from public.stories where id = p_target;
      -- Same tombstone as delete_message(), so the chat keeps its shape.
      when 'message' then
        update public.messages
           set content = '', photo_path = null, audio_path = null, audio_ms = null, deleted_at = now()
         where id = p_target;
        update public.message_reactions set emoji = null, updated_at = now() where message_id = p_target and emoji is not null;
      when 'wish' then delete from public.sky_wishes where id = p_target;
      when 'lantern' then delete from public.sky_lanterns where id = p_target;
      when 'lantern_note' then delete from public.lantern_notes where id = p_target;
      when 'tip' then delete from public.school_tips where id = p_target;
    end case;
  end if;

  if p_kind in ('post', 'comment', 'story', 'profile', 'message') then
    update public.reports
       set status = case p_action when 'remove' then 'actioned' when 'dismiss' then 'dismissed' else 'reviewed' end
     where status = 'pending'
       and target_type = p_kind
       and coalesce(post_id, comment_id, story_id, reported_user_id, message_id) = p_target;
  end if;

  insert into public.moderation_actions (kind, target_id, action, moderator_id, note)
  values (p_kind, p_target, p_action, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;
revoke all on function public.moderate(text, uuid, text, text) from public, anon;
grant execute on function public.moderate(text, uuid, text, text) to authenticated;
