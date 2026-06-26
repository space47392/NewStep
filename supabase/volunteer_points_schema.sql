-- 1. Track points on each profile
alter table public.profiles
  add column points integer not null default 0;

-- 2. Allow a third status: a request moves open -> accepted -> completed
alter table public.posts drop constraint posts_status_check;
alter table public.posts
  add constraint posts_status_check check (status in ('open', 'accepted', 'completed'));

-- 3. Only the post's author can mark their own accepted request as completed
create policy "Authors can mark accepted requests as completed"
  on public.posts for update
  using (
    auth.uid() = author_id
    and status = 'accepted'
  )
  with check (
    status = 'completed'
  );

-- 4. Award the helper 1 point the moment a request is marked completed.
--    This runs as a trigger (not client-side) because the author who marks it
--    complete has no RLS permission to edit the helper's profile row directly.
create or replace function public.handle_post_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    update public.profiles
    set points = points + 1
    where id = new.helper_id;
  end if;
  return new;
end;
$$;

create trigger on_post_completed
  after update on public.posts
  for each row execute function public.handle_post_completed();
