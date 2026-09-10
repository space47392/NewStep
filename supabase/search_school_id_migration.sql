-- Search school_id migration (Step 43) — People Search couldn't find, or
-- correctly rank by "same school," a directory-based (school_id-only)
-- student, because profiles.search_text only ever indexed the legacy
-- free-text school_name column (see search_discovery_schema.sql), which
-- ChooseSchoolScreen's directory picker never writes (setMySchool() only
-- ever sets school_id — see schools_directory_schema.sql).
--
-- This migration only changes the trigger function that maintains
-- search_text and backfills existing rows. It does not touch any table
-- structure, any RLS policy, or the search_posts()/search_schools_by_name()
-- functions (unchanged — P1 #2 needed no SQL changes; the metadata
-- PostPreviewCard now displays was already part of POST_SELECT).

-- =====================================================================
-- 1. profiles_search_text_update() — now resolves the directory school's
-- real name (schools.name) when school_id is set, falling back to the
-- legacy school_name column otherwise. SECURITY INVOKER (the original
-- default, unchanged) is still correct: public.schools already has a fully
-- public "Schools are viewable by everyone" SELECT policy
-- (schools_directory_schema.sql, `using (true)`), so the caller's own
-- privileges (whoever is inserting/updating their own profile row) are
-- already sufficient to read it — no privilege elevation needed.
--
-- coalesce(v_directory_school_name, new.school_name, '') — never both at
-- once, so a profile that somehow has both set doesn't get a duplicated
-- school name in the tsvector. The directory name wins when both exist,
-- since school_id is the more current/authoritative source (a profile that
-- has picked from the directory never has school_name set going forward —
-- see setMySchool() — but this stays defensive for any pre-existing data).
-- =====================================================================
create or replace function public.profiles_search_text_update()
returns trigger
language plpgsql
as $$
declare
  v_directory_school_name text;
begin
  if new.school_id is not null then
    select s.name into v_directory_school_name from public.schools s where s.id = new.school_id;
  end if;

  new.search_text := to_tsvector('english',
    coalesce(new.username, '') || ' ' ||
    coalesce(new.full_name, '') || ' ' ||
    coalesce(v_directory_school_name, new.school_name, '') || ' ' ||
    array_to_string(coalesce(new.interests, '{}'), ' ')
  );
  return new;
end;
$$;

-- =====================================================================
-- 2. Backfill — CREATE OR REPLACE FUNCTION does not retroactively re-run the
-- trigger for existing rows, so every profile that already has a school_id
-- (picked their school via the directory before this migration ran) needs
-- its search_text recomputed once here, or it would keep missing a school
-- name until that profile's next unrelated edit happens to re-fire the
-- trigger. Same coalesce logic as the trigger above, inlined as a
-- correlated subquery so one statement covers every row (school_id set or
-- null) without a second pass or a temporary join table.
--
-- Safe to run more than once (idempotent — recomputes the same deterministic
-- value each time) and touches no table structure, no RLS policy, and
-- deletes no data; it only recomputes one existing column's value.
-- =====================================================================
update public.profiles p
set search_text = to_tsvector('english',
  coalesce(p.username, '') || ' ' ||
  coalesce(p.full_name, '') || ' ' ||
  coalesce((select s.name from public.schools s where s.id = p.school_id), p.school_name, '') || ' ' ||
  array_to_string(coalesce(p.interests, '{}'), ' ')
);
