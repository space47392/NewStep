import { readFileSync } from 'fs';
import { join } from 'path';
import { categoryOf, isPaused, NOTIFICATION_CATEGORIES, pausedLabel, pauseUntil, toggleMuted, DEFAULT_PREFS } from '../notificationPrefs';

const sql = readFileSync(join(__dirname, '../../../supabase/notification_prefs.sql'), 'utf8');

describe('categories', () => {
  it('match notification_category() in the SQL, type by type', () => {
    const fromSql: Record<string, string> = {};
    for (const m of sql.matchAll(/when p_type in \(([^)]*)\) then '(\w+)'/g)) {
      for (const t of m[1].split(',').map((x) => x.trim().replace(/'/g, ''))) fromSql[t] = m[2];
    }
    const fromApp: Record<string, string> = {};
    for (const c of NOTIFICATION_CATEGORIES) for (const t of c.types) fromApp[t] = c.key;
    expect(fromApp).toEqual(fromSql);
  });

  it('cover every notification type the database allows', () => {
    const buddies = readFileSync(join(__dirname, '../../../supabase/buddies.sql'), 'utf8');
    const list = buddies.match(/notifications_type_check\s+check \(type in \(([\s\S]*?)\)\)/)![1];
    const allowed = list.split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
    for (const t of allowed) expect(categoryOf(t)).not.toBeNull();
  });

  it('use the same keys the SQL accepts', () => {
    const list = sql.match(/where m not in \(([^)]*)\)/)![1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(NOTIFICATION_CATEGORIES.map((c) => c.key)).toEqual(list);
  });

  it('give null for an unknown type', () => expect(categoryOf('nope')).toBeNull());
});

describe('pausing', () => {
  const now = new Date(2026, 9, 27, 21, 30);

  it('pauses for an hour, or until 7 AM tomorrow', () => {
    expect(pauseUntil('hour', now)).toEqual(new Date(2026, 9, 27, 22, 30));
    expect(pauseUntil('tomorrow', now)).toEqual(new Date(2026, 9, 28, 7, 0));
  });

  it('knows when a pause is over', () => {
    expect(isPaused(DEFAULT_PREFS, now)).toBe(false);
    expect(isPaused({ muted: [], paused_until: new Date(2026, 9, 27, 22).toISOString() }, now)).toBe(true);
    expect(isPaused({ muted: [], paused_until: new Date(2026, 9, 27, 21).toISOString() }, now)).toBe(false);
  });

  it('labels the end of the pause, with the day when it is not today', () => {
    expect(pausedLabel(DEFAULT_PREFS, now)).toBeNull();
    expect(pausedLabel({ muted: [], paused_until: new Date(2026, 9, 27, 22, 30).toISOString() }, now)).toMatch(/^Paused until \d/);
    expect(pausedLabel({ muted: [], paused_until: new Date(2026, 9, 28, 7).toISOString() }, now)).toMatch(/^Paused until \S+ \d/);
  });
});

describe('toggleMuted', () => {
  it('turns a group off and on without duplicates', () => {
    const off = toggleMuted(toggleMuted(DEFAULT_PREFS, 'social', false), 'social', false);
    expect(off.muted).toEqual(['social']);
    expect(toggleMuted(off, 'social', true).muted).toEqual([]);
  });
});
