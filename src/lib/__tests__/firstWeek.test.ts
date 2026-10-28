import { readFileSync } from 'fs';
import { join } from 'path';
import { FIRST_WEEK_STEPS, firstWeekProgress, MANUAL_STEPS } from '../firstWeek';

const none = { profile: false, buddy: false, hello: false, ask: false, star: false, manual: [] as string[] };

describe('firstWeekProgress', () => {
  it('shows every step as not done before the status loads', () => {
    const p = firstWeekProgress(null);
    expect(p.done).toBe(0);
    expect(p.total).toBe(FIRST_WEEK_STEPS.length);
    expect(p.next?.key).toBe(FIRST_WEEK_STEPS[0].key);
    expect(p.complete).toBe(false);
  });

  it('ticks automatic steps from the status and manual ones from the list', () => {
    const p = firstWeekProgress({ ...none, profile: true, hello: true, manual: ['lunch'] });
    const done = p.steps.filter((s) => s.done).map((s) => s.key);
    expect(done).toEqual(['profile', 'lunch', 'hello']);
    expect(p.done).toBe(3);
    expect(p.next?.key).toBe('guide');
  });

  it('ignores manual keys it does not know', () => {
    expect(firstWeekProgress({ ...none, manual: ['profile', 'nope'] }).done).toBe(0);
  });

  it('is complete when everything is done', () => {
    const p = firstWeekProgress({ profile: true, buddy: true, hello: true, ask: true, star: true, manual: [...MANUAL_STEPS] });
    expect(p.complete).toBe(true);
    expect(p.next).toBeNull();
  });
});

it('uses the same manual step keys as first_week.sql', () => {
  const sql = readFileSync(join(__dirname, '../../../supabase/first_week.sql'), 'utf8');
  const lists = [...sql.matchAll(/step (?:not )?in \(([^)]*)\)/g)].map((m) => m[1]);
  expect(lists.length).toBe(2);
  for (const list of lists) expect(list).toBe(MANUAL_STEPS.map((k) => `'${k}'`).join(', '));
});
