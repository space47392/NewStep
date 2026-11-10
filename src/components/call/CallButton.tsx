// The 📞 in a chat header. Checks with the server first (call_blocker) so
// "you can call once you've both sent a message" shows as a gentle note
// instead of a call that fails.
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCalls } from '../../contexts/CallContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchCallBlocker } from '../../lib/callsApi';
import { errorMessage } from '../../lib/errors';
import type { ChatProfile } from '../../types';
import { colors } from '../../constants/theme';

export default function CallButton({ other }: { other: ChatProfile | null }) {
  const { supported, active, placeCall } = useCalls();
  const { showToast } = useToast();
  const [checking, setChecking] = useState(false);

  // Hidden in Expo Go (no native calling) and for a deleted account.
  if (!supported || !other) return null;

  const onPress = async () => {
    if (checking || active) return;
    setChecking(true);
    try {
      const reason = await fetchCallBlocker(other.id);
      if (reason) showToast(reason);
      else await placeCall(other);
    } catch (e) {
      showToast(errorMessage(e, "Couldn't start the call."));
    } finally {
      setChecking(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      disabled={checking}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Call ${other.full_name ?? 'them'}`}
    >
      {checking ? <ActivityIndicator size="small" color={colors.textMid} /> : <Ionicons name="call-outline" size={22} color={colors.textDark} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: 'auto',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
