// First-week checklist (supabase/first_week.sql). The list and the progress
// maths are pure and unit tested. The two database calls are in firstWeekApi.ts.

export type AutoStep = 'profile' | 'buddy' | 'hello' | 'ask' | 'star';
export type ManualStep = 'guide' | 'classes' | 'lunch';
export type FirstWeekStepKey = AutoStep | ManualStep;

export type FirstWeekStep = {
  key: FirstWeekStepKey;
  title: string;
  hint: string;
  // 'auto' ticks itself from what you did in the app; 'manual' is ticked by
  // hand (the guide ticks itself when opened).
  kind: 'auto' | 'manual';
};

export const FIRST_WEEK_STEPS: FirstWeekStep[] = [
  { key: 'profile', title: 'Add a photo and your interests', hint: 'So classmates who like the same things can find you.', kind: 'auto' },
  { key: 'guide', title: 'Read the school guide', hint: 'Tips from classmates — the stuff nobody tells you on day one.', kind: 'manual' },
  { key: 'classes', title: 'Find all your classrooms', hint: 'Walk your schedule once. Ask anyone in the hall — people like helping.', kind: 'manual' },
  { key: 'lunch', title: 'Find a spot for lunch', hint: 'A table, a bench, the library — anywhere that feels okay.', kind: 'manual' },
  { key: 'buddy', title: 'Find a buddy', hint: 'A classmate to walk your first weeks with.', kind: 'auto' },
  { key: 'hello', title: 'Say hi to one classmate', hint: 'One message is enough. A 👋 counts.', kind: 'auto' },
  { key: 'ask', title: 'Ask one question', hint: 'Where, when, how — classmates are happy to help.', kind: 'auto' },
  { key: 'star', title: 'Light your first star', hint: 'Tell the sky how today really went.', kind: 'auto' },
];

export const MANUAL_STEPS: ManualStep[] = FIRST_WEEK_STEPS.filter((s) => s.kind === 'manual').map((s) => s.key as ManualStep);

// What first_week_status() returns.
export type FirstWeekStatus = Record<AutoStep, boolean> & { manual: string[] };

export type FirstWeekProgress = {
  steps: (FirstWeekStep & { done: boolean })[];
  done: number;
  total: number;
  complete: boolean;
  // The first step not done yet, for the Home card's "next" line.
  next: FirstWeekStep | null;
};

export function firstWeekProgress(status: FirstWeekStatus | null): FirstWeekProgress {
  const manual = new Set(status?.manual ?? []);
  const steps = FIRST_WEEK_STEPS.map((s) => ({
    ...s,
    done: !!status && (s.kind === 'manual' ? manual.has(s.key) : !!status[s.key as AutoStep]),
  }));
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length, next: steps.find((s) => !s.done) ?? null };
}
