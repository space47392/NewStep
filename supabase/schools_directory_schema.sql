-- School Directory — schema only (Step 15). No seed data, no backfill, no
-- change to any existing behavior: profiles.school_name, its index, its
-- search_text trigger, and every query that already reads it are all
-- untouched. profiles.school_id starts NULL for every row and stays that way
-- until a user picks a school or the (separate, not-yet-run) backfill links
-- an exact match — every existing feature keeps working off school_name in
-- the meantime.
--
-- SAFE TO RUN IMMEDIATELY: purely additive, no data dependency, nothing
-- reads school_id yet so there is nothing to break.

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  state text,
  country text not null default 'US',
  -- Only kept where the source data genuinely has one — never required.
  district text,
  -- NCES's own school id, when a row came from that import. Lets a future
  -- re-import/region-expansion match by stable external id instead of
  -- guessing from name+city again. Unique only when present.
  nces_id text,
  created_at timestamptz not null default now(),
  constraint schools_nces_id_unique unique (nces_id)
);

-- Powers the picker's State -> Area step and narrows the name search within
-- a state/city before it runs — no separate name index yet, since the
-- directory starts as a single small region (see schools_seed_<region>.sql).
create index schools_state_city_idx on public.schools (state, city);

alter table public.schools enable row level security;

-- A directory is meant to be browsed by everyone — same "fully public read"
-- trust level as posts/profiles/stories. No insert/update/delete policy for
-- any client role: populated only by us via SQL import, same as no policy at
-- all being the existing pattern for points_history's write side.
create policy "Schools are viewable by everyone"
  on public.schools for select
  using (true);

-- Nullable, no default. ON DELETE SET NULL (not CASCADE): if a school row is
-- ever removed, affected profiles just fall back to school_name, they don't
-- get corrupted or deleted. Writing this column goes through profiles'
-- EXISTING "own row" UPDATE policy — no new policy needed, it's self-reported
-- the same way school_name already is.
alter table public.profiles
  add column school_id uuid references public.schools (id) on delete set null;
