import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { navigateToTab } from './src/navigation/navigationRef';
import { addNotificationResponseListener } from './src/lib/notifications';

export default function App() {
  useEffect(() => {
    return addNotificationResponseListener((type) => {
      if (type === 'message') {
        navigateToTab('Chat');
      } else if (type === 'comment' || type === 'volunteer') {
        navigateToTab('Feed');
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
