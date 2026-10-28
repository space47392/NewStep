import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { REACTIONS, type ReactionCount } from '../../lib/reactionSummary';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';

// The row of reactions at the top of a message's long-press menu.
export function ReactionBar({ mine, onPick }: { mine: string | null; onPick: (emoji: string) => void }) {
  return (
    <View style={styles.bar} accessibilityRole="toolbar" accessibilityLabel="React to this message">
      {REACTIONS.map((e) => (
        <TouchableOpacity
          key={e}
          style={[styles.barItem, mine === e && styles.barItemOn]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onPick(e);
          }}
          accessibilityRole="button"
          accessibilityLabel={mine === e ? `Remove ${e}` : `React ${e}`}
          accessibilityState={{ selected: mine === e }}
        >
          <Text style={styles.barEmoji}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// The little counts under a bubble. Tapping one adds or takes back that reaction.
export function ReactionPills({ counts, alignEnd, onToggle }: { counts: ReactionCount[]; alignEnd: boolean; onToggle?: (emoji: string) => void }) {
  if (!counts.length) return null;
  return (
    <View style={[styles.pills, alignEnd ? styles.pillsEnd : styles.pillsStart]}>
      {counts.map((c) => (
        <TouchableOpacity
          key={c.emoji}
          style={[styles.pill, c.mine && styles.pillMine]}
          onPress={onToggle ? () => onToggle(c.emoji) : undefined}
          disabled={!onToggle}
          activeOpacity={0.8}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={`${c.emoji} ${c.count}${c.mine ? ', including you' : ''}`}
        >
          <Text style={styles.pillEmoji}>{c.emoji}</Text>
          {c.count > 1 ? <Text style={[styles.pillCount, c.mine && styles.pillCountMine]}>{c.count}</Text> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  barItem: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barItemOn: {
    backgroundColor: colors.primaryLight,
  },
  barEmoji: {
    fontSize: 26,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -6,
    marginBottom: 2,
  },
  pillsEnd: {
    justifyContent: 'flex-end',
    marginRight: spacing.sm,
  },
  pillsStart: {
    justifyContent: 'flex-start',
    marginLeft: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillMine: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  pillEmoji: {
    fontSize: 14,
  },
  pillCount: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textMid,
  },
  pillCountMine: {
    color: colors.primaryDark,
  },
});
