// Mirrors the SQL constraint in profiles_add_username.sql — kept as two separate
// checks (shape regex + a distinct ".." check) rather than one dense regex, so
// this stays easy to compare against the SQL version by eye.
const USERNAME_SHAPE = /^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;

export type UsernameValidationResult = { valid: true } | { valid: false; reason: string };

// Assumes `username` has already been through normalizeUsername() — this only
// validates shape, it doesn't lowercase/trim for you.
export function validateUsername(username: string): UsernameValidationResult {
  if (username.length < 3 || username.length > 20) {
    return { valid: false, reason: 'Username must be 3–20 characters.' };
  }
  if (username.includes('..')) {
    return { valid: false, reason: "Username can't contain consecutive periods." };
  }
  if (!USERNAME_SHAPE.test(username)) {
    return {
      valid: false,
      reason: "Use only lowercase letters, numbers, underscores, and periods — and don't start or end with a period.",
    };
  }
  return { valid: true };
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
