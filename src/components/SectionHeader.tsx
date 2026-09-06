import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

type Props = {
  title: string;
  onSeeAll?: () => void;
};

// One consistent "Title ... See All" header for every section that has a
// fuller place to send someone (or just a title, when onSeeAll is omitted) —
// previously duplicated and drifting: SchoolScreen used a local component at
// fontSize.lg/bold/textDark, SearchScreen used a plain Text at
// fontSize.sm/semibold/textMid for the exact same role (Step 30).
export default function SectionHeader({ title, onSeeAll }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.seeAll}>See All</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
  },
  seeAll: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
