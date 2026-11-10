import { clampDay, daysInMonth, formatBirthday, isAtLeast } from '../age';

describe('daysInMonth', () => {
  it('knows short months and leap years', () => {
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
  });

  it('moves a day that no longer exists to the end of the month', () => {
    expect(clampDay(2026, 1, 31)).toBe(28);
    expect(clampDay(2026, 2, 31)).toBe(31);
  });
});

describe('isAtLeast', () => {
  const today = new Date(2026, 10, 9); // Nov 9, 2026

  it('counts the birthday itself as the day you turn that age', () => {
    expect(isAtLeast({ year: 2013, month: 10, day: 9 }, 13, today)).toBe(true);
    expect(isAtLeast({ year: 2013, month: 10, day: 10 }, 13, today)).toBe(false);
  });

  it('looks at the day, not just the month', () => {
    expect(isAtLeast({ year: 2013, month: 10, day: 1 }, 13, today)).toBe(true);
    expect(isAtLeast({ year: 2013, month: 10, day: 30 }, 13, today)).toBe(false);
  });

  it('handles earlier and later months', () => {
    expect(isAtLeast({ year: 2013, month: 0, day: 1 }, 13, today)).toBe(true);
    expect(isAtLeast({ year: 2013, month: 11, day: 1 }, 13, today)).toBe(false);
    expect(isAtLeast({ year: 2009, month: 5, day: 1 }, 13, today)).toBe(true);
  });

  it('lets a Feb 29 birthday turn older on Mar 1 in other years', () => {
    expect(isAtLeast({ year: 2012, month: 1, day: 29 }, 14, new Date(2026, 1, 28))).toBe(false);
    expect(isAtLeast({ year: 2012, month: 1, day: 29 }, 14, new Date(2026, 2, 1))).toBe(true);
    expect(isAtLeast({ year: 2013, month: 1, day: 29 }, 13, new Date(2026, 1, 28))).toBe(false);
  });
});

it('formats a birthday for the field', () => {
  expect(formatBirthday({ year: 2010, month: 2, day: 5 })).toBe('March 5, 2010');
});
