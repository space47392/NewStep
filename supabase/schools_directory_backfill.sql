-- School Directory — exact-match backfill (Step 15). NOT run automatically,
-- NOT run as part of schools_directory_schema.sql, and REQUIRES at least one
-- schools_seed_<region>.sql to have been run first — against an empty
-- schools table this simply matches nothing (harmless, but pointless).
--
-- Exact match only, never fuzzy: case-insensitive, whitespace-trimmed
-- equality between profiles.school_name and schools.name. No similarity
-- scoring, no partial/substring matching, no manual review queue — anything
-- that doesn't match exactly is left alone.
--
-- Idempotent and safe to re-run as more regions get seeded: only ever fills
-- school_id where it is currently NULL, so it can never overwrite a school a
-- user already picked for themselves through ChooseSchoolScreen.
update public.profiles p
set school_id = s.id
from public.schools s
where p.school_id is null
  and p.school_name is not null
  and lower(trim(p.school_name)) = lower(trim(s.name));
