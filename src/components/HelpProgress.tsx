import { Fragment, ReactNode, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';
import { PostStatus } from '../types';

type Person = { id?: string; full_name: string | null; avatar_url: string | null } | null;

type Props = {
  status: PostStatus;
  author: Person;
  helper: Person;
  // Copy for the open state, before anyone has offered to help.
  waitingText?: string;
  // Makes the linked-avatars row open the helper's profile.
  onPressHelper?: () => void;
  // Actions/celebration rendered inside the panel, under the tracker
  // (PostDetail's buttons; nothing on compact list cards).
  children?: ReactNode;
};

const STEPS = ['Asked', 'Helping', 'Done'] as const;
const STEP_INDEX: Record<PostStatus, number> = { open: 0, accepted: 1, completed: 2 };

function firstName(person: Person): string {
  return person?.full_name?.trim().split(/\s+/)[0] || 'Someone';
}

// The help request's real lifecycle (open → accepted → completed) drawn as
// NewStep's signature step tracker, with the two people involved linked
// once someone has offered to help. Reserved for help requests only — other
// post types get their own signatures, not this one.
export default function HelpProgress({
  status,
  author,
  helper,
  waitingText = 'Asked — waiting for a helper',
  onPressHelper,
  children,
}: Props) {
  const { user } = useAuth();
  const current = STEP_INDEX[status];
  const done = status === 'completed';
  const tone = done ? colors.accentDark : colors.secondaryDark;
  const showPair = status !== 'open' && helper;
  // A plain View when not tappable, so taps inside a card that is itself
  // pressable (Feed, preview cards) still reach that card.
  const PairRow = onPressHelper ? TouchableOpacity : View;

  // When the status moves forward while this is on screen (e.g. "Mark as
  // done" on PostDetail), the newly reached dot pops. Never on first render,
  // so scrolling a list of finished requests stays calm.
  const pop = useRef(new Animated.Value(1)).current;
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === status) return;
    prevStatusRef.current = status;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }).start();
  }, [status, pop]);
  const popScale = pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.6, 1] });

  return (
    <View style={[styles.panel, { backgroundColor: done ? colors.accentLight : colors.secondaryLight }]}>
      {showPair ? (
        <PairRow
          style={styles.pairRow}
          onPress={onPressHelper}
          accessibilityRole={onPressHelper ? 'button' : undefined}
          accessibilityLabel={onPressHelper ? `View ${helper?.full_name ?? 'helper'}'s profile` : undefined}
        >
          <View style={styles.pair}>
            <View style={styles.pairAvatar}>
              <Avatar uri={author?.avatar_url} size={28} />
            </View>
            <View style={styles.pairLink}>
              <Text style={styles.pairLinkEmoji}>{done ? '💙' : '🤝'}</Text>
            </View>
            <View style={styles.pairAvatar}>
              <Avatar uri={helper?.avatar_url} size={28} />
            </View>
          </View>
          {/* Says "you" when you're one of the two people involved. */}
          <Text style={styles.pairText}>
            {user && helper?.id === user.id ? (
              <>
                <Text style={styles.bold}>You</Text>
                {done ? ' helped ' : ' are helping '}
                <Text style={styles.bold}>{firstName(author)}</Text>
              </>
            ) : user && author?.id === user.id ? (
              <>
                <Text style={styles.bold}>{firstName(helper)}</Text>
                {done ? ' helped ' : ' is helping '}
                <Text style={styles.bold}>you</Text>
              </>
            ) : (
              <>
                <Text style={styles.bold}>{firstName(helper)}</Text>
                {done ? ' helped ' : ' is helping '}
                <Text style={styles.bold}>{firstName(author)}</Text>
              </>
            )}
          </Text>
          {onPressHelper && <Ionicons name="chevron-forward" size={16} color={tone} />}
        </PairRow>
      ) : (
        // No helper to show past the open state (e.g. their account was
        // deleted) — describe the step instead of falling back to "waiting".
        <Text style={styles.waitingText}>
          {status === 'completed' ? 'Done — this request got help 🎉' : status === 'accepted' ? 'Someone is helping' : waitingText}
        </Text>
      )}

      <View>
        <View style={styles.track}>
          {STEPS.map((step, i) => {
            const reached = i < current || done;
            const isCurrent = i === current && !done;
            return (
              <Fragment key={step}>
                {i > 0 && <View style={[styles.line, { backgroundColor: i <= current ? tone : colors.cardBg }]} />}
                {reached ? (
                  <Animated.View
                    style={[styles.dot, { backgroundColor: tone }, i === current && { transform: [{ scale: popScale }] }]}
                  >
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </Animated.View>
                ) : isCurrent ? (
                  <Animated.View
                    style={[styles.dot, styles.dotCurrent, { backgroundColor: tone }, { transform: [{ scale: popScale }] }]}
                  />
                ) : (
                  <View style={[styles.dot, styles.dotFuture]} />
                )}
              </Fragment>
            );
          })}
        </View>
        <View style={styles.labels}>
          {STEPS.map((step, i) => (
            <Text key={step} style={[styles.label, i === current && { color: tone, fontFamily: fontFamily.bold }]}>
              {step}
            </Text>
          ))}
        </View>
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm + spacing.xs,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairAvatar: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.cardBg,
  },
  pairLink: {
    width: 24,
    height: 24,
    marginHorizontal: -4,
    zIndex: 1,
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairLinkEmoji: {
    fontSize: 12,
  },
  pairText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  bold: {
    fontFamily: fontFamily.bold,
  },
  waitingText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: 3,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: {
    borderWidth: 4,
    borderColor: colors.cardBg,
  },
  dotFuture: {
    backgroundColor: colors.cardBg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
});
