import { indexReactions, nextReaction, REACTIONS, summarizeReactions } from '../reactionSummary';

const r = (message_id: string, user_id: string, emoji: string | null) => ({ message_id, user_id, emoji });

describe('summarizeReactions', () => {
  it('is empty with nothing to show', () => {
    expect(summarizeReactions(undefined, 'me')).toEqual([]);
    expect(summarizeReactions([r('m', 'me', null)], 'me')).toEqual([]);
  });

  it('counts each emoji and marks mine, in the picker order', () => {
    const rows = [r('m', 'them', '🙏'), r('m', 'me', '❤️'), r('m', 'x', '❤️')];
    expect(summarizeReactions(rows, 'me')).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '🙏', count: 1, mine: false },
    ]);
  });

  it('puts anything unexpected last instead of dropping it', () => {
    expect(summarizeReactions([r('m', 'a', '🔥'), r('m', 'b', '😂')], 'me').map((c) => c.emoji)).toEqual(['😂', '🔥']);
  });
});

describe('indexReactions', () => {
  it('groups by message and keeps the latest row per person', () => {
    const idx = indexReactions([r('m1', 'me', '❤️'), r('m2', 'me', '😂'), r('m1', 'me', '😮'), r('m1', 'them', '❤️')]);
    expect(idx.m1).toEqual([r('m1', 'me', '😮'), r('m1', 'them', '❤️')]);
    expect(idx.m2).toEqual([r('m2', 'me', '😂')]);
  });
});

describe('nextReaction', () => {
  it('sets, switches and takes back', () => {
    expect(nextReaction(null, '❤️')).toBe('❤️');
    expect(nextReaction('❤️', '😂')).toBe('😂');
    expect(nextReaction('❤️', '❤️')).toBeNull();
  });
});

it('matches the emoji list in message_reactions.sql', () => {
  const fs = require('fs') as typeof import('fs');
  const sql = fs.readFileSync(require('path').join(__dirname, '../../../supabase/message_reactions.sql'), 'utf8');
  const lists = [...sql.matchAll(/in \(('[^)]*')\)/g)].map((m) => m[1]);
  expect(lists.length).toBeGreaterThanOrEqual(2);
  for (const list of lists) expect(list).toBe(REACTIONS.map((e) => `'${e}'`).join(', '));
});
