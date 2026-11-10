// Birthday and age for the sign-up age check. Pure and unit tested.
// The birthday never leaves the device: only "old enough or not" is used.

export type Birthday = { year: number; month: number; day: number }; // month 0–11

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// A day that no longer exists after changing month or year (Feb 30) moves to
// the last day of that month.
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

// Turned `years` old on or before today. Someone born Feb 29 turns a year
// older on Mar 1 in years without a Feb 29.
export function isAtLeast(b: Birthday, years: number, now = new Date()): boolean {
  const birthdayThisYear = new Date(now.getFullYear(), b.month, b.day);
  let age = now.getFullYear() - b.year;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < birthdayThisYear) age -= 1;
  return age >= years;
}

export function formatBirthday(b: Birthday): string {
  return `${MONTHS[b.month]} ${b.day}, ${b.year}`;
}
