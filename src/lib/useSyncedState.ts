import { useState } from 'react';

// Local state that starts from a prop and snaps back to it whenever the prop
// changes — e.g. a like button that updates optimistically on tap, then
// re-syncs when the parent refetches the server truth.
//
// This is React's "adjust state when a prop changes" pattern: the reset
// happens during render, so there's no extra effect-driven render with a
// stale value first.
// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
export function useSyncedState<T>(value: T) {
  const [state, setState] = useState(value);
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    setState(value);
  }
  return [state, setState] as const;
}
