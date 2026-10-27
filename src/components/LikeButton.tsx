import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, GestureResponderEvent, StyleSheet, useAnimatedValue } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useSyncedState } from '../lib/useSyncedState';
import { likePost, unlikePost, subscribeToLikes } from '../lib/likes';
import LikesListModal from './LikesListModal';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';
import { MainStackParamList } from '../types';

type Props = {
  postId: string;
  initialLikeCount: number;
  initialLikedByMe: boolean;
};

export default function LikeButton({ postId, initialLikeCount, initialLikedByMe }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();
  // Re-sync to the server truth whenever the parent screen refetches (e.g. on
  // focus); a tap overrides these right away via the optimistic update.
  const [liked, setLiked] = useSyncedState(initialLikedByMe);
  const [count, setCount] = useSyncedState(initialLikeCount);
  const [listVisible, setListVisible] = useState(false);
  const scale = useAnimatedValue(1);
  // Guards against a fast double-tap firing two overlapping toggle calls
  // before the first resolves — not a ref-driven re-render, just a latch.
  const pendingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToLikes(postId, ({ type, userId }) => {
      // Our own like/unlike is already reflected by the optimistic update in handleToggle.
      if (userId === user?.id) return;
      setCount((prev) => Math.max(0, prev + (type === 'insert' ? 1 : -1)));
    });
    return unsubscribe;
  }, [postId, user?.id, setCount]);

  const handleToggle = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (!user || pendingRef.current) return;
    pendingRef.current = true;

    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 50 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();

    try {
      if (nextLiked) {
        await likePost({ postId, userId: user.id });
      } else {
        await unlikePost({ postId, userId: user.id });
      }
    } catch {
      // Revert the optimistic update on failure — and say so, rather than
      // silently flipping back with no explanation.
      setLiked(!nextLiked);
      setCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)));
      showToast(nextLiked ? "Couldn't like post" : "Couldn't unlike post");
    } finally {
      pendingRef.current = false;
    }
  };

  const handleOpenList = (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (count > 0) setListVisible(true);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handleToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike post' : 'Like post'}
        accessibilityState={{ selected: liked }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? colors.secondary : colors.textMid}
          />
        </Animated.View>
      </TouchableOpacity>
      {count > 0 ? (
        <TouchableOpacity
          onPress={handleOpenList}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityLabel={`${count} ${count === 1 ? 'like' : 'likes'}. See who liked it`}
        >
          <Text style={styles.count}>{count}</Text>
        </TouchableOpacity>
      ) : null}

      <LikesListModal
        postId={postId}
        visible={listVisible}
        onClose={() => setListVisible(false)}
        onSelectUser={(userId) => {
          setListVisible(false);
          navigation.navigate('UserProfile', { userId });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  count: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
});
