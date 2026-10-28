import { useCallback, useLayoutEffect, useRef } from 'react';

// A function whose identity never changes but always runs the latest `fn`.
// For handlers passed to memoised list rows: the row doesn't re-render just
// because the parent re-rendered (e.g. on every keystroke in a composer).
// Only call the result from events, never during render.
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
