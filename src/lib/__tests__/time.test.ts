import { formatDayLabel, formatRelativeTime, isSameDay } from '../time';

const NOW = new Date(2026, 9, 26, 15, 0, 0); // Mon Oct 26 2026, 3:00 PM local

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [10_000, 'Just now'],
    [5 * MIN, '5m ago'],
    [59 * MIN, '59m ago'],
    [2 * HOUR, '2h ago'],
    [23 * HOUR, '23h ago'],
    [3 * DAY, '3d ago'],
    [6 * DAY, '6d ago'],
  ])('%p ms ago → %p', (ms, label) => {
    expect(formatRelativeTime(ago(ms))).toBe(label);
  });

  it('shows a short date after a week, without the year when it is this year', () => {
    const label = formatRelativeTime(new Date(2026, 8, 16).toISOString());
    expect(label).not.toMatch(/2026/);
    expect(label).toMatch(/16/);
  });

  it('includes the year for older dates', () => {
    expect(formatRelativeTime(new Date(2025, 8, 16).toISOString())).toMatch(/2025/);
  });
});

describe('formatDayLabel', () => {
  it('names today and yesterday', () => {
    expect(formatDayLabel(ago(HOUR))).toBe('Today');
    expect(formatDayLabel(new Date(2026, 9, 25, 9).toISOString())).toBe('Yesterday');
  });
});

describe('isSameDay', () => {
  it('compares calendar days, not 24-hour windows', () => {
    expect(isSameDay(new Date(2026, 9, 26, 0, 5).toISOString(), new Date(2026, 9, 26, 23, 55).toISOString())).toBe(true);
    expect(isSameDay(new Date(2026, 9, 25, 23, 55).toISOString(), new Date(2026, 9, 26, 0, 5).toISOString())).toBe(false);
  });
});
