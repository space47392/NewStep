import AsyncStorage from '@react-native-async-storage/async-storage';

// Whether this device has dismissed the "New Student" welcome banner — purely
// a UI nicety, not worth a database column (see profiles_add_new_student_flag.sql
// for the one field that IS worth persisting). Keyed per-user so a shared/reused
// device doesn't carry one account's dismissal over to another.
function storageKey(userId: string): string {
  return `new_student_banner_dismissed:${userId}`;
}

export async function isWelcomeBannerDismissed(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  return value === 'true';
}

export async function dismissWelcomeBanner(userId: string): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), 'true');
}
