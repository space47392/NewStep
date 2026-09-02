import { supabase } from './supabase';
import { Achievement, AchievementProgress } from '../types';

// Every achievement definition, merged with whether the given user has earned
// each one. Both tables are public-read (see achievements_schema.sql), so this
// works the same for your own profile and anyone else's — no RPC needed, just
// two plain reads. Awarding itself only ever happens via trusted DB triggers;
// nothing here writes anything.
export async function fetchAchievementProgress(userId: string): Promise<AchievementProgress[]> {
  const [{ data: achievements, error: achError }, { data: earned, error: earnedError }] = await Promise.all([
    supabase
      .from('achievements')
      .select('id, key, name, description, icon, metric, requirement')
      .order('created_at', { ascending: true }),
    supabase.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId),
  ]);

  if (achError) throw achError;
  if (earnedError) throw earnedError;

  const earnedMap = new Map((earned ?? []).map((row) => [row.achievement_id as string, row.earned_at as string]));

  return ((achievements ?? []) as Achievement[]).map((achievement) => ({
    ...achievement,
    earned: earnedMap.has(achievement.id),
    earnedAt: earnedMap.get(achievement.id) ?? null,
  }));
}
