import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { blendDescribedSky, fetchSchoolSky, TodaySky } from './sky';
import { fetchBlockedUserIds } from './blocks';

// Today's sky at my school as classmates described it, refreshed whenever
// the screen comes into focus. Null when nobody has described it yet (or
// School Sky isn't set up) — callers fall back to their usual look.
export function useTodaySky(userId: string | undefined): TodaySky | null {
  const [sky, setSky] = useState<TodaySky | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      Promise.all([fetchSchoolSky(60), fetchBlockedUserIds(userId).catch(() => new Set<string>())])
        .then(([stars, blocked]) => {
          if (!cancelled) setSky(blendDescribedSky(stars.filter((s) => !blocked.has(s.user_id))));
        })
        .catch(() => {
          // Keep whatever was showing.
        });
      return () => {
        cancelled = true;
      };
    }, [userId])
  );
  return sky;
}
