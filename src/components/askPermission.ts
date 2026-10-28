import { Linking } from 'react-native';
import { warmAlert } from './WarmAlert';

// One way to ask for photos / camera / microphone everywhere in the app.
//
// Once someone taps "Don't allow", the system stops showing its own prompt
// (canAskAgain = false). Telling them to "allow access" at that point is a
// dead end, so the alert offers a way to open Settings instead.

type PermissionResponse = { granted: boolean; canAskAgain: boolean };
export type PermissionKind = 'photos' | 'camera' | 'microphone';

const COPY: Record<PermissionKind, { title: string; thing: string }> = {
  photos: { title: 'Allow photo access', thing: 'your photos' },
  camera: { title: 'Allow the camera', thing: 'your camera' },
  microphone: { title: 'Allow the microphone', thing: 'your microphone' },
};

// `reason` finishes the sentence "NewStep needs your photos …",
// e.g. "to send one" or "to set a profile picture".
export async function askPermission(request: () => Promise<PermissionResponse>, kind: PermissionKind, reason: string): Promise<boolean> {
  let res: PermissionResponse;
  try {
    res = await request();
  } catch {
    res = { granted: false, canAskAgain: true };
  }
  if (res.granted) return true;

  const { title, thing } = COPY[kind];
  if (res.canAskAgain) {
    warmAlert(title, `NewStep needs ${thing} ${reason}.`);
  } else {
    warmAlert(title, `Access to ${thing} is turned off for NewStep. You can turn it on in Settings.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
    ]);
  }
  return false;
}
