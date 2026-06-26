import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Opens a tab in the main app. Doesn't deep-link to the exact post/conversation —
// that would need an extra fetch (the full Post object, or the other user's profile)
// before navigating, since those screens take full objects as params, not just ids.
export function navigateToTab(tabName: 'Feed' | 'Chat') {
  if (!navigationRef.isReady()) return;
  (navigationRef.navigate as (name: string, params: object) => void)('Main', {
    screen: 'Tabs',
    params: { screen: tabName },
  });
}
