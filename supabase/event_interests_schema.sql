-- Event Participation (Step 28). "Interested" is deliberately a separate,
-- lightweight signal from Save — Save means "I want to find this later,"
-- Interested means "I may participate" — so this is its own table, not a
-- reused/repurposed post_saves row.
--
-- Structurally identical to post_saves: same shape, same private-by-default
-- RLS (only the owner can ever read their own interest rows — the public
-- signal is the denormalized count below, not the membership rows
-- themselves, so "who's interested" is never queryable by anyone but the
-- interested user). The one addition is the INSERT policy's category check,
-- which restricts interest rows to Event posts only.

create table public.event_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_event_interest unique (post_id, user_id)
);

-- Matches post_saves_user_id_idx's exact purpose: the real access pattern is
-- "which of these event posts is the current user interested in" — a bulk
-- user_id + post_id-in-list check — not "who is interested in post X" (RLS
-- forbids that anyway), so this is the index that pattern actually needs.
create index event_interests_user_id_idx on public.event_interests (user_id);

alter table public.event_interests enable row level security;

-- Private by design, same as post_saves — nobody but the owner can read back
-- an individual interest row. The public "N interested" signal comes from
-- posts.interested_count below, never from querying this table directly.
create policy "Users can view their own event interest"
  on public.event_interests for select
  using (auth.uid() = user_id);

-- Cross-table subquery (posts, not event_interests itself) — safe; this is
-- not the self-referencing-policy recursion pattern that broke messages in
-- Step 17. Restricts interest rows to Event posts only, at the database
-- layer, not just in the client UI.
create policy "Users can mark interest in event posts as themselves"
  on public.event_interests for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.category = 'Event'
    )
  );

create policy "Users can remove their own event interest"
  on public.event_interests for delete
  using (auth.uid() = user_id);

-- Denormalized public count, kept in sync by triggers — same pattern as
-- likes.post_id -> posts.like_count. Avoids an N+1 count query per event
-- when rendering a feed/school page/search results, and is what actually
-- makes the count public despite event_interests' own SELECT policy being
-- owner-only.
alter table public.posts add column interested_count integer not null default 0;

create or replace function public.handle_event_interest_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set interested_count = interested_count + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger on_event_interest_added
  after insert on public.event_interests
  for each row execute function public.handle_event_interest_added();

create or replace function public.handle_event_interest_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set interested_count = interested_count - 1 where id = old.post_id;
  return old;
end;
$$;

create trigger on_event_interest_removed
  after delete on public.event_interests
  for each row execute function public.handle_event_interest_removed();
