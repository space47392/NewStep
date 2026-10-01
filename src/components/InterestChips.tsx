import { View, Text, StyleSheet } from 'react-native';
import { getInterestIcon } from '../constants/interests';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// Cycles by position so a profile's chips always read as a varied, playful
// set rather than a row of identical outlines.
const TINTS = [colors.primaryLight, colors.secondaryLight, colors.accentLight, colors.warningLight];

type Props = {
  interests: string[];
};

export default function InterestChips({ interests }: Props) {
  return (
    <View style={styles.row}>
      {interests.map((interest, index) => (
        <View key={interest} style={[styles.chip, { backgroundColor: TINTS[index % TINTS.length] }]}>
          <Text style={styles.icon}>{getInterestIcon(interest)}</Text>
          <Text style={styles.text}>{interest}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  icon: {
    fontSize: fontSize.md,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
});
