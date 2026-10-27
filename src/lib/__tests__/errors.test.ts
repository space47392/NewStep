import { errorMessage, isNetworkError, OFFLINE_MESSAGE } from '../errors';

describe('errorMessage', () => {
  it('keeps friendly messages raised by our own functions', () => {
    expect(errorMessage(new Error("That's your own tip 💛"))).toBe("That's your own tip 💛");
  });

  it('replaces raw network failures with plain words', () => {
    expect(errorMessage(new TypeError('Network request failed'))).toBe(OFFLINE_MESSAGE);
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(OFFLINE_MESSAGE);
  });

  it('falls back for anything that is not an Error, or has no message', () => {
    expect(errorMessage('boom', 'Could not save.')).toBe('Could not save.');
    expect(errorMessage(null, 'Could not save.')).toBe('Could not save.');
    expect(errorMessage(new Error('  '), 'Could not save.')).toBe('Could not save.');
    expect(errorMessage(undefined)).toMatch(/try again/i);
  });
});

describe('isNetworkError', () => {
  it('only matches connection problems', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('duplicate key value'))).toBe(false);
    expect(isNetworkError('Network request failed')).toBe(false);
  });
});
