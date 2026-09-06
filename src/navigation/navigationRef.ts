import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList, MainStackParamList, MainTabParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Opens any screen on the Main stack (which nests the bottom tabs alongside
// PostDetail/Conversation/UserProfile/etc. — see MainStackParamList) from
// outside the navigation tree, e.g. a push notification tap in App.tsx. The
// cast is needed because RootStackParamList types 'Main' as `undefined` —
// nested-navigator params aren't expressible there — but this is the exact
// shape React Navigation expects for reaching into a nested stack.
export function navigateToMainStack<RouteName extends keyof MainStackParamList>(
  screen: RouteName,
  params: MainStackParamList[RouteName]
) {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (name: string, params: object) => void)('Main', { screen, params });
}

// Opens a bottom tab directly — e.g. when a notification's destination
// couldn't be resolved to anything more specific than "the Chat tab."
export function navigateToTab(tabName: keyof MainTabParamList) {
  navigateToMainStack('Tabs', { screen: tabName });
}
