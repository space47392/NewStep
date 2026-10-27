# Database (Supabase)

Every file here is plain SQL, run by hand in the Supabase dashboard
(**SQL Editor → New query → paste → Run**). Each file is written to be safe
to run again (`create … if not exists`, `create or replace`, `drop policy if exists`).

## Rules every file follows

- **Row Level Security is on for every table.** Policies only allow *reads*.
- **Writes go through `security definer` functions** with `set search_path = ''`.
  Each function checks `auth.uid()`, the school, and blocks before it changes anything.
  Execute rights are revoked from `public`/`anon` and granted to `authenticated`.
- Rate limits (for example "10 tips a day") live inside those functions,
  so a modified app can't skip them.
- The client only ever has the **anon key**. Service keys and API keys
  (for example `ANTHROPIC_API_KEY`) live in Supabase secrets.

## Setting up a fresh project

Run the files in this order. It's the order they were first applied to
production; later files depend on tables and functions from earlier ones.

| # | File | What it adds |
|---|------|--------------|
| 1 | `profile_schema.sql` | profiles, avatars |
| 2 | `posts_schema.sql` | posts |
| 3 | `chat_schema.sql` | conversations, messages |
| 4 | `comments_schema.sql` | comments |
| 5 | `posts_add_category.sql` | post categories |
| 6 | `posts_add_volunteer.sql` | volunteer / help requests |
| 7 | `push_notifications_schema.sql` | push tokens |
| 8 | `volunteer_points_schema.sql` | helper points |
| 9 | `posts_edit_delete.sql` | edit / delete posts |
| 10 | `likes_schema.sql` | likes |
| 11 | `messages_edit_delete.sql` | edit / delete messages |
| 12 | `posts_add_photos.sql` | post photos |
| 13 | `profiles_add_username.sql` | usernames (shape mirrored in `src/lib/usernameValidation.ts`) |
| 14 | `profiles_search.sql` | profile search |
| 15 | `stories_schema.sql` | stories |
| 16 | `messages_sync_conversation_preview.sql` | chat list preview |
| 17 | `points_history_schema.sql` | points history |
| 18 | `secure_help_lifecycle.sql` | help request status rules |
| 19 | `achievements_schema.sql` | achievements |
| 20 | `achievements_fix_count_type.sql` | |
| 21 | `achievements_fix_award_guard.sql` | |
| 22 | `achievements_lock_award_function.sql` | |
| 23 | `schools_performance_index.sql` | |
| 24 | `account_deletion_schema.sql` | `delete_my_account()` |
| 25 | `follows_schema.sql` | follows |
| 26 | `notifications_schema.sql` | in-app notifications, `create_notification()` |
| 27 | `profiles_add_new_student_flag.sql` | new-student flag |
| 28 | `safety_moderation_schema.sql` | reports, blocks |
| 29 | `search_discovery_schema.sql` | search |
| 30 | `users_blocked_security_fix.sql` | `users_blocked()` guard |
| 31 | `message_replies_schema.sql` | replies in chat |
| 32 | `message_reply_target_fix.sql` | |
| 33 | `post_saves_schema.sql` | saved posts |
| 34 | `posts_story_origin.sql` | |
| 35 | `schools_directory_schema.sql` | schools |
| 36 | `schools_directory_backfill.sql` | |
| 37 | `schools_seed_ca_full.sql` | *(data)* California school list — large; see `scripts/import_ca_schools.js` |
| 38 | `story_views_schema.sql` | story views |
| 39 | `story_wave_schema.sql` | story waves |
| 40 | `thanks_received_schema.sql` | thanks |
| 41 | `school_events_schema.sql` | events |
| 42 | `event_interests_schema.sql` | "Interested" on events |
| 43 | `notifications_push_payload_fix.sql` | |
| 44 | `search_school_id_migration.sql` | |
| 45 | `account_deletion_notification_trigger_fix.sql` | |
| 46 | `account_deletion_storage_cleanup.sql` | |
| 47 | `block_likes_comments_migration.sql` | |
| 48 | `help_history_schema.sql` | |
| 49 | `help_history_backfill.sql` | |
| 50 | `chat_deleted_participant_schema_only.sql` | |
| 51 | `chat_deleted_participant_rls_only.sql` | |
| 52 | `get_or_create_conversation_user_check.sql` | |
| 53 | `push_notification_resilience_fix.sql` | |
| 54 | `abuse_protection.sql` | rate limits |
| 55 | `conversation_origin.sql` | |
| 56 | `help_stats_public.sql` | |
| 57 | `push_copy.sql` | push notification wording |
| 58 | `school_sky.sql` | School Sky: one mood star per student |
| 59 | `school_sky_colors.sql` | |
| 60 | `school_sky_photos.sql` | |
| 61 | `school_sky_social.sql` | |
| 62 | `school_sky_describe.sql` | sky description rate limit |
| 63 | `school_sky_safety.sql` | word filter (mirrored in `src/lib/contentFilter.ts`) |
| 64 | `school_sky_lanterns.sql` | anonymous lanterns |
| 65 | `school_sky_lanterns_care.sql` | "Me too", notes |
| 66 | `help_offers.sql` | help offers |
| 67 | `conversation_clears.sql` | "Clear chat" |
| 68 | `chat_photos.sql` | private `chat-photos` bucket |
| 69 | `voice_messages.sql` | voice messages (same bucket) |
| 70 | `buddies.sql` | buddy matching |
| 71 | `school_tips.sql` | school guide |
| 72 | `crisis_check_v2.sql` | crisis check (mirrored in `src/lib/crisis.ts`) |

**Skip:**
- `chat_deleted_participant_schema.sql`. It was replaced by files 50 and 51.
- `schools_seed_ca_fullerton_juhsd.sql`. It's a small subset of file 37.

## Logic kept in two places

A few checks run in both the app (for instant feedback) and the database
(so they can't be skipped). When you change one, change the other. The
unit tests in `src/lib/__tests__/` pin the app side.

| App | Database |
|-----|----------|
| `src/lib/crisis.ts` | `sounds_like_crisis()`, `crisis_check_v2.sql` |
| `src/lib/contentFilter.ts` | `school_sky_safety.sql` |
| `src/lib/usernameValidation.ts` | `profiles_add_username.sql` |

## Edge Functions

`functions/describe-sky` is the optional AI version of the sky painter.
It is off by default. The app paints skies on the phone with
`src/lib/skyInterpret.ts`, at no cost. See the comment in `src/lib/sky.ts`
before turning it on.

## Reviewing reports

For now, reports are reviewed from the SQL editor. `report_school_tip()` in
`school_tips.sql` has an example query.
