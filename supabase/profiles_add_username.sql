-- 1. Username column — nullable, since existing accounts won't have one yet.
-- The app gates entry (see AppNavigator) to prompt anyone with username = null
-- to choose one, covering both pre-existing accounts and brand new signups
-- (a fresh profile row also starts with username = null).
alter table public.profiles add column username text;

-- 2. Format rules, split into two checks rather than one dense regex so the SQL
-- and TypeScript versions of this validation are easier to keep in agreement:
--   a) charset [a-z0-9_.], length 3-20, first/last char can't be a period
--   b) no two consecutive periods anywhere
-- [a-z0-9_] only matching lowercase is also what enforces "must be stored in
-- lowercase" at the DB level — there's no separate rule needed for that.
alter table public.profiles
  add constraint username_format check (
    username is null or (
      username ~ '^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$'
      and username not like '%..%'
    )
  );

-- 3. Uniqueness — a partial index so multiple NULLs (not-yet-chosen) don't
-- collide with each other, but any two actual usernames must be distinct.
create unique index profiles_username_unique_idx on public.profiles (username) where username is not null;

-- No new RLS policy needed: "Users can update their own profile" (from
-- profile_schema.sql) is an unrestricted per-row policy, so it already covers
-- writing to this new column.
