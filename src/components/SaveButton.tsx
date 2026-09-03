import { useEffect, useState } from 'react';
import { TouchableOpacity, GestureResponderEvent, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { savePost, unsavePost } from '../lib/postSaves';
import { colors } from '../constants/theme';

type Props = {
  postId: string;
  initialSaved: boolean;
};

// Mirrors LikeButton's optimistic-update pattern. No realtime subscription
// needed here — saves are private (see post_saves_schema.sql), so no other
// user's action can ever change what this button should show.
export default function SaveButton({ postId, initialSaved }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [saved, setSaved] = useState(initialSaved);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  const handleToggle = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (!user) return;

    const next = !saved;
    setSaved(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (next) {
        await savePost({ postId, userId: user.id });
        showToast('Saved');
      } else {
        await unsavePost({ postId, userId: user.id });
      }
    } catch {
      setSaved(!next); // revert the optimistic update on failure
    }
  };

  return (
    <TouchableOpacity onPress={handleToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.button}>
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={21} color={saved ? colors.primary : colors.textMid} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 2,
  },
});
