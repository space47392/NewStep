import { readFileSync } from 'fs';
import { join } from 'path';
import { actionsFor, isModeratorRole, kindInfo, MODERATION_KINDS, reasonLabel } from '../moderation';

const sql = readFileSync(join(__dirname, '../../../supabase/moderation.sql'), 'utf8');

it('uses the same kinds as moderation.sql everywhere it checks them', () => {
  // The full lists (the table check and moderate()'s check); the shorter
  // public.reports subset is a different thing.
  const lists = [...sql.matchAll(/kind (?:not )?in \(('post'[^)]*)\)/g)].map((m) => m[1]).filter((l) => l.includes("'tip'"));
  expect(lists.length).toBe(2);
  for (const list of lists) expect(list).toBe(MODERATION_KINDS.map((k) => `'${k.key}'`).join(', '));
});

it('never offers to remove an account', () => {
  expect(actionsFor('profile')).not.toContain('remove');
  for (const k of MODERATION_KINDS.filter((x) => x.key !== 'profile')) expect(actionsFor(k.key)).toContain('remove');
});

it('labels kinds and reasons', () => {
  expect(kindInfo('lantern_note').label).toBe('Lantern note');
  expect(kindInfo('mystery').label).toBe('Report');
  expect(reasonLabel('harassment: mean comments')).toBe('Harassment: mean comments');
  expect(reasonLabel('')).toBe('Reported');
});

it('treats moderators and admins as moderators', () => {
  expect(isModeratorRole('moderator')).toBe(true);
  expect(isModeratorRole('admin')).toBe(true);
  expect(isModeratorRole('user')).toBe(false);
  expect(isModeratorRole(null)).toBe(false);
});
