-- School Directory seed — initial regional test seed (Step 15/16), scoped to
-- Fullerton Joint Union High School District, Orange County, California,
-- rather than all of California:
--
-- A full-California CCD import is ~10,000+ public schools. Fetching/parsing
-- that at bulk scale wasn't reliable to do accurately in this session (the
-- Urban Institute's JSON mirror of CCD exceeded a 10MB response even scoped
-- to a single county, and hand-typing thousands of NCES IDs from memory would
-- risk exactly the kind of fabricated-looking-real data this project
-- explicitly avoids). This scope was confirmed with the project owner as the
-- practical starting point instead.
--
-- Source: NCES Common Core of Data (CCD) — 2023-24 Universe Files, Version 1a
-- (NCES publication #2024251), cross-checked school-by-school against
-- nces.ed.gov's own live School/District Search tool (District ID 0614760),
-- which reflects the current 2024-25 CCD directory. Every nces_id, school
-- name, and city below was verified against that source, not fabricated —
-- this is also the real-world source of "Sunny Hills High School" from the
-- original ChooseSchoolScreen mockup.
--
-- Idempotent: keyed on nces_id, unique per schools_directory_schema.sql, so
-- re-running this only ever updates these same 8 rows — never duplicates
-- them, and never touches any other school already in the directory.
-- Does NOT touch profiles.school_name or profiles.school_id — schools only.

insert into public.schools (name, city, state, country, district, nces_id)
values
  ('Buena Park High', 'Buena Park', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001809'),
  ('Fullerton Union High', 'Fullerton', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001810'),
  ('La Habra High', 'La Habra', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001811'),
  ('La Sierra High (Alternative)', 'Fullerton', 'CA', 'US', 'Fullerton Joint Union High School District', '061476007723'),
  ('La Vista High (Continuation)', 'Fullerton', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001812'),
  ('Sonora High', 'La Habra', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001814'),
  ('Sunny Hills High', 'Fullerton', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001815'),
  ('Troy High', 'Fullerton', 'CA', 'US', 'Fullerton Joint Union High School District', '061476001816')
on conflict (nces_id) do update set
  name = excluded.name,
  city = excluded.city,
  state = excluded.state,
  country = excluded.country,
  district = excluded.district;
