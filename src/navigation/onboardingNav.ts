import { createContext, useContext } from 'react';

// Lets the first-run step trail (components/OnboardingSteps) jump back to a
// step the student already finished. Provided by AppNavigator, which owns
// the onboarding order. null outside onboarding, where the trail is just a
// picture.
export type OnboardingNav = { goToStep: (index: number) => void };

export const OnboardingNavContext = createContext<OnboardingNav | null>(null);

export function useOnboardingNav(): OnboardingNav | null {
  return useContext(OnboardingNavContext);
}

// Step 0 (Sign up) can't be revisited: the account already exists.
export function canRevisitStep(index: number, current: number): boolean {
  return index >= 1 && index < current;
}
