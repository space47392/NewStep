import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, spacing, radius, shadow } from '../constants/theme';

type BlockProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

// Base shimmering placeholder — a soft opacity pulse rather than a moving
// gradient, so it stays cheap to run inside long lists of skeleton rows.
export function Skeleton({ width = '100%', height = 14, radius: r = 6, style }: BlockProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

// Mimics a FeedScreen post card, so the loading state holds the same shape as
// the content that replaces it (no layout jump when real posts arrive).
export function PostCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={42} height={42} radius={21} />
        <View style={styles.headerText}>
          <Skeleton width="55%" height={13} />
          <Skeleton width="35%" height={11} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton width={90} height={20} radius={radius.full} style={{ marginTop: spacing.md }} />
      <Skeleton width="100%" height={13} style={{ marginTop: spacing.sm }} />
      <Skeleton width="80%" height={13} style={{ marginTop: 6 }} />
      <View style={styles.footerRow}>
        <Skeleton width={70} height={13} />
        <Skeleton width={100} height={13} />
      </View>
    </View>
  );
}

export function ConversationRowSkeleton() {
  return (
    <View style={styles.chatRow}>
      <Skeleton width={50} height={50} radius={25} />
      <View style={styles.headerText}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function MessageSkeleton({ mine = false }: { mine?: boolean }) {
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <Skeleton width={mine ? 140 : 180} height={38} radius={radius.lg} />
    </View>
  );
}

export function CommentSkeleton() {
  return (
    <View style={styles.commentRow}>
      <Skeleton width={32} height={32} radius={16} />
      <View style={styles.commentBubble}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="90%" height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  bubbleRow: {
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
  },
  bubbleRowTheirs: {
    alignSelf: 'flex-start',
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
});
