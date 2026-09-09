import { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, GestureResponderEvent, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { markInterested, unmarkInterested } from '../lib/eventInterests';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

type Props = {
  postId: string;
  initialInterested: boolean;
  // Called only after a successful toggle (never optimistically, and never
  // on failure) — lets the caller keep its own locally-held interested_count
  // (e.g. EventDetails' displayed count) in sync without a second count
  // query per tap. Optional: every existing call site keeps working
  // unchanged without it.
  onToggle?: (nextInterested: boolean) => void;
};

// Mirrors SaveButton's optimistic-toggle pattern exactly. Deliberately a
// separate signal from Save — "I want to find this later" (Save) vs "I may
// participate" (Interested) — never merged. Only ever rendered for
// category === 'Event' posts (see FeedScreen/PostDetailScreen); the
// event_interests INSERT policy enforces that server-side too, not just here.
export default function InterestButton({ postId, initialInterested, onToggle }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [interested, setInterested] = useState(initialInterested);
  // Guards against a fast double-tap firing two overlapping toggle calls
  // before the first resolves.
  const pendingRef = useRef(false);

  useEffect(() => {
    setInterested(initialInterested);
  }, [initialInterested]);

  const handleToggle = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (!user || pendingRef.current) return;
    pendingRef.current = true;

    const next = !interested;
    setInterested(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (next) {
        await markInterested({ postId, userId: user.id });
      } else {
        await unmarkInterested({ postId, userId: user.id });
      }
      onToggle?.(next);
    } catch {
      // Revert the optimistic update on failure — and say so, rather than
      // silently flipping back with no explanation.
      setInterested(!next);
      showToast(next ? "Couldn't mark interested" : "Couldn't remove interest");
    } finally {
      pendingRef.current = false;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, interested && styles.buttonActive]}
      onPress={handleToggle}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={interested ? 'Remove interested' : 'Mark as interested'}
      accessibilityState={{ selected: interested }}
    >
      <Ionicons name={interested ? 'star' : 'star-outline'} size={15} color={interested ? '#fff' : colors.primary} />
      <Text style={[styles.text, interested && styles.textActive]}>Interested{interested ? ' ✓' : ''}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  buttonActive: {
    backgroundColor: colors.primary,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  textActive: {
    color: '#fff',
  },
});
