# NewStep

A gentle place for students who just moved to a new school. They can ask
classmates for help, find a buddy for their first weeks, read the school
guide, and check in on how they feel under the School Sky.

Built with **Expo SDK 57** (React Native 0.86, React 19), **TypeScript**
(strict), and **Supabase** (Postgres + RLS, Auth, Storage, Realtime).

## Getting started

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL and anon key
npm start                   # Expo dev server; press a for Android
```

On a fresh Supabase project, run the SQL files first, in the order given in
[supabase/README.md](supabase/README.md).

`.env` only ever holds `EXPO_PUBLIC_*` values, and those ship inside the app.
**Never put a secret there.** Service keys and paid-API keys belong in
Supabase secrets.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Expo dev server |
| `npm run typecheck` | TypeScript, no output files |
| `npm run lint` | ESLint (`eslint-config-expo` plus React Compiler rules) |
| `npm test` | Jest unit tests (`jest-expo`) |
| `npm run check` | All three. Run it before every push; CI runs it too |

## Project layout

```
src/
  screens/       one file per screen (auth/ before sign-in, main/ after)
  components/    shared UI
  navigation/    stacks, tabs, deep links
  contexts/      Auth, Toast
  lib/           data access and pure logic — no UI
    __tests__/   unit tests for the pure logic
  constants/     theme (colors, spacing, fonts), legal copy
  types/         shared types and navigation params
supabase/        SQL (run by hand) and the optional describe-sky Edge Function
scripts/         one-off Node scripts (school data import)
```

### Conventions

- **Screens don't query tables or storage directly.** They go through
  `src/lib/*`, which throws on error. Screens catch the error and show
  `errorMessage(err, '…fallback…')` from `src/lib/errors.ts`. The one
  exception is `supabase.auth.*` calls (sign in, sign up, passwords), which
  stay in their screens.
- **Writes go through database functions (RPCs).** Security, rate limits and
  "same school" checks live in the database, not only in the app.
- **Checks that run in both places** (crisis words, the word filter,
  usernames) are listed in [supabase/README.md](supabase/README.md#logic-kept-in-two-places).
  Change both sides together.
- **Animated values** use `useAnimatedValue()`. A value made once uses
  `useState(() => …)`, not `useRef(...).current`. Local state that follows
  a prop uses `useSyncedState()`.
- **Effects key off ids** (`user?.id`), not objects. The Supabase `user`
  object is replaced on every token refresh.
- **Copy:** the UI is in English and warm in tone. Errors say what to do next.

## Before release

- [ ] Turn **Confirm email** back on (Supabase → Auth → Providers → Email).
- [ ] Fill in the contact email in `src/constants/legal.ts`, and get the terms reviewed.
- [ ] Run `crisis_check_v2.sql` in production.
