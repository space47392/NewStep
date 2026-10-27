import { normalizeUsername, validateUsername } from '../usernameValidation';

// Must agree with the SQL constraint in supabase/profiles_add_username.sql.
describe('validateUsername', () => {
  it.each(['abc', 'new_step', 'wooju.kim', '_hidden_', 'a1b2c3d4e5f6g7h8i9j0'])('accepts %p', (name) => {
    expect(validateUsername(name)).toEqual({ valid: true });
  });

  it.each([
    ['ab', 'Username must be 3–20 characters.'],
    ['a'.repeat(21), 'Username must be 3–20 characters.'],
    ['wooju..kim', "Username can't contain consecutive periods."],
  ])('rejects %p', (name, reason) => {
    expect(validateUsername(name)).toEqual({ valid: false, reason });
  });

  it.each(['.wooju', 'wooju.', 'Wooju', 'woo ju', 'woo-ju', '우주'])('rejects the shape of %p', (name) => {
    expect(validateUsername(name).valid).toBe(false);
  });
});

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  WooJu_Kim ')).toBe('wooju_kim');
  });
});
