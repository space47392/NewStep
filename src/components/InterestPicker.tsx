import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IconInput from './IconInput';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';
import { INTEREST_GROUPS, MAX_INTERESTS, getInterestIcon } from '../constants/interests';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

// Shared curated interest picker — search field + grouped grid + Selected
// summary — used identically by ChooseInterestsScreen (onboarding) and
// EditProfileScreen, so both offer the exact same experience from the same
// INTEREST_GROUPS instead of two hand-rolled copies that could drift apart.
// Purely a controlled input: the caller owns `value` and persists it however
// it already does (setMyInterests() or its own upsert) — this component
// never saves anything itself.
//
// Any value in `value` that isn't one of the curated options (a legacy
// free-typed interest from before this picker existed) has no grid chip to
// highlight, but still appears in Selected and is never dropped on its
// own — only an explicit tap there removes it.
export default function InterestPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState('');

  const atLimit = value.length >= MAX_INTERESTS;

  const toggleInterest = (item: string) => {
    if (value.includes(item)) {
      onChange(value.filter((i) => i !== item));
    } else if (!atLimit) {
      onChange([...value, item]);
    }
  };

  const query = search.trim().toLowerCase();

  return (
    <View style={styles.container}>
      <View style={styles.counterRow}>
        <Text style={styles.counterHint}>Pick up to {MAX_INTERESTS}</Text>
        <View style={[styles.counter, atLimit && styles.counterFull]}>
          <Text style={[styles.counterText, atLimit && styles.counterTextFull]}>
            {value.length} / {MAX_INTERESTS}
          </Text>
        </View>
      </View>
      <IconInput
        icon="search-outline"
        style={styles.searchInput}
        placeholder="Search interests..."
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      {INTEREST_GROUPS.map((group) => {
        const filtered = query ? group.items.filter((item) => item.toLowerCase().includes(query)) : group.items;
        if (filtered.length === 0) return null;
        return (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.chipRow}>
              {filtered.map((item) => {
                const selected = value.includes(item);
                const disabled = !selected && atLimit;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.optionChip,
                      selected && styles.optionChipSelected,
                      disabled && styles.optionChipDisabled,
                    ]}
                    onPress={() => toggleInterest(item)}
                    disabled={disabled}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled }}
                  >
                    <Text style={styles.optionEmoji}>{getInterestIcon(item)}</Text>
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{item}</Text>
                    {selected && (
                      <View style={styles.checkDot}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {value.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>
            Selected ({value.length}/{MAX_INTERESTS})
          </Text>
          <View style={styles.chipRow}>
            {value.map((interest) => (
              <TouchableOpacity key={interest} style={styles.selectedChip} onPress={() => toggleInterest(interest)}>
                <Text style={styles.optionEmoji}>{getInterestIcon(interest)}</Text>
                <Text style={styles.selectedChipText}>{interest}</Text>
                <Ionicons name="close" size={13} color={colors.textMid} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  counterHint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  counter: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  counterFull: {
    backgroundColor: colors.accentLight,
  },
  counterText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  counterTextFull: {
    color: colors.accentDark,
  },
  searchInput: {
    marginBottom: spacing.lg,
  },
  group: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  groupTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    marginBottom: spacing.sm,
  },
  chipRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionChipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  optionEmoji: {
    fontSize: fontSize.md,
  },
  checkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipDisabled: {
    opacity: 0.4,
  },
  optionChipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
  optionChipTextSelected: {
    color: colors.primary,
    fontFamily: fontFamily.semibold,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
});
