import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontFamily, shadow } from '../constants/theme';
import { AchievementProgress } from '../types';

const TINTS = [colors.warningLight, colors.secondaryLight, colors.accentLight, colors.primaryLight];
// Small alternating tilts make earned badges feel like stickers slapped on,
// not a settings grid.
const TILTS = ['-6deg', '4deg', '-3deg', '6deg'];

type Props = {
  achievements: AchievementProgress[];
  // Own profile shows locked goals with how to earn them; someone else's
  // profile only passes earned ones.
  showHints?: boolean;
};

export default function AchievementStickers({ achievements, showHints = false }: Props) {
  return (
    <View style={styles.grid}>
      {achievements.map((a, i) => (
        <View
          key={a.id}
          style={styles.item}
          accessible
          accessibilityLabel={a.earned ? `${a.name}, earned` : `${a.name}, locked. ${a.description}`}
        >
          {a.earned ? (
            <View
              style={[
                styles.sticker,
                { backgroundColor: TINTS[i % TINTS.length], transform: [{ rotate: TILTS[i % TILTS.length] }] },
              ]}
            >
              <Text style={styles.icon}>{a.icon}</Text>
            </View>
          ) : (
            <View style={styles.slot}>
              <Text style={[styles.icon, styles.iconLocked]}>{a.icon}</Text>
              <View style={styles.lock}>
                <Ionicons name="lock-closed" size={10} color={colors.textLight} />
              </View>
            </View>
          )}
          <Text style={[styles.name, !a.earned && styles.nameLocked]} numberOfLines={2}>
            {a.name}
          </Text>
          {showHints && !a.earned && (
            <Text style={styles.hint} numberOfLines={2}>
              {a.description}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const STICKER = 56;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  item: {
    width: '33.33%',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  sticker: {
    width: STICKER,
    height: STICKER,
    borderRadius: STICKER / 2,
    borderWidth: 3,
    borderColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  slot: {
    width: STICKER,
    height: STICKER,
    borderRadius: STICKER / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 26,
  },
  iconLocked: {
    opacity: 0.3,
  },
  lock: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: spacing.xs + 2,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textDark,
    textAlign: 'center',
  },
  nameLocked: {
    color: colors.textLight,
  },
  hint: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textLight,
    textAlign: 'center',
  },
});
