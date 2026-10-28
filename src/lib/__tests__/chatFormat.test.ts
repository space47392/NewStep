import { formatGap, isEmojiOnly, layoutMessage, messagePreview, sameTimestampBucket } from '../chatFormat';

const at = (h: number, m = 0, day = 26) => new Date(2026, 9, day, h, m).toISOString();
const msg = (sender: string, created_at: string) => ({ sender_id: sender, created_at });

describe('isEmojiOnly', () => {
  it.each(['👋', '🎉🎉', ' 😂 ', '👍🏽', '❤️'])('treats %p as a sticker', (t) => expect(isEmojiOnly(t)).toBe(true));
  it.each(['hi 👋', '👋👋👋👋', 'ok', '', '123'])('keeps %p in a bubble', (t) => expect(isEmojiOnly(t)).toBe(false));
});

describe('formatGap', () => {
  it('stays quiet under an hour', () => expect(formatGap(at(9), at(9, 59))).toBeNull());
  it('counts whole hours', () => {
    expect(formatGap(at(9), at(10, 30))).toBe('1 hour later');
    expect(formatGap(at(9), at(12, 5))).toBe('3 hours later');
  });
});

describe('sameTimestampBucket', () => {
  it('compares calendar minutes', () => {
    expect(sameTimestampBucket(new Date(2026, 9, 26, 9, 0, 1).toISOString(), new Date(2026, 9, 26, 9, 0, 59).toISOString())).toBe(true);
    expect(sameTimestampBucket(new Date(2026, 9, 26, 9, 0, 59).toISOString(), new Date(2026, 9, 26, 9, 1, 0).toISOString())).toBe(false);
  });
});

describe('messagePreview', () => {
  const base = { content: '', deleted_at: null, audio_path: null, photo_path: null };
  it('prefers text, then voice, then photo', () => {
    expect(messagePreview({ ...base, content: 'hey' })).toBe('hey');
    expect(messagePreview({ ...base, audio_path: 'a', photo_path: 'p' })).toBe('🎤 Voice message');
    expect(messagePreview({ ...base, photo_path: 'p' })).toBe('📷 Photo');
  });
  it('says when the original is gone', () => {
    expect(messagePreview({ ...base, content: 'hey', deleted_at: at(9) })).toBe('Original message deleted');
  });
});

describe('layoutMessage', () => {
  it('starts a thread with a day separator and no gap marker', () => {
    const l = layoutMessage(undefined, msg('a', at(9)), undefined);
    expect(l).toEqual({ showDaySeparator: true, gapLabel: null, isFirstInGroup: true, isLastInGroup: true, showTimestamp: true });
  });

  it('groups a run from the same sender and shows one time at its end', () => {
    const a1 = msg('a', at(9, 0));
    const a2 = msg('a', at(9, 0));
    const a3 = msg('a', at(9, 0));
    expect(layoutMessage(a1, a2, a3)).toMatchObject({ isFirstInGroup: false, isLastInGroup: false, showTimestamp: false });
    expect(layoutMessage(a2, a3, undefined)).toMatchObject({ isFirstInGroup: false, isLastInGroup: true, showTimestamp: true });
  });

  it('breaks the group when the sender changes, but shares the minute', () => {
    const a = msg('a', at(9, 0));
    const b = msg('b', at(9, 0));
    expect(layoutMessage(undefined, a, b)).toMatchObject({ isLastInGroup: true, showTimestamp: false });
    expect(layoutMessage(a, b, undefined)).toMatchObject({ isFirstInGroup: true });
  });

  it('breaks the group across days even for the same sender', () => {
    const l = layoutMessage(msg('a', at(23, 50, 25)), msg('a', at(8, 0, 26)), undefined);
    expect(l).toMatchObject({ showDaySeparator: true, isFirstInGroup: true, gapLabel: null });
  });

  it('marks a long pause on the same day', () => {
    expect(layoutMessage(msg('a', at(9)), msg('b', at(13)), undefined).gapLabel).toBe('4 hours later');
  });
});
